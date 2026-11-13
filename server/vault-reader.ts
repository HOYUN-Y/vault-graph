// 실제 볼트 스냅숏(Node 서버 전용, 읽기 전용).
// - 읽는 파일: 라우터(CLAUDE.md), 비공개 장부, 라우터에서 링크로 닿는 볼트 최상위 안내 문서(.md)뿐이다.
// - 원문 본문은 읽지 않는다. 색인이 연결한 자료는 링크 이름 · 같은 줄의 설명 · 상대경로로만 노드를 만든다.
//   다만 같은 원문을 가리키는 별칭을 하나로 합치고 등록 루트 이탈 · 비공개 실경로를 막기 위해
//   realpath/stat 메타데이터만 확인한다(본문 열기 아님).
// - 브라우저로 보내는 모든 글자는 비공개 이름 · 로컬 절대경로를 지운 뒤 내보낸다. 경로는 볼트 기준 상대경로만 쓴다.
// - 비공개 규칙을 해석할 수 없으면 데이터를 하나도 내보내지 않는다(blocked).
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { literalRanges, normalizePath, parseLinks, relativeHref, resolveHref } from '../src/core/markdown';
import { formatOfPath, opaqueId } from '../src/core/vault';
import { kindOfPath } from '../src/core/vault';
import type { VaultFile } from '../src/core/vault';
import type { NodeKind } from '../src/core/types';
import { LEDGER, POLICY_DIR, PrivacyRuleError, isPolicyPath, isPrivate, isSecretPath, loadPrivatePaths, makeRedactor } from './privacy';

export type VaultState = 'connected' | 'blocked' | 'unavailable' | 'invalid';

/** 파일 시스템 오류 분류: 없음(ENOENT · ENOTDIR)만 '없음'이고, 권한(EACCES · EPERM)과 그 밖의 입출력 오류는 삭제로 단정하지 않는다 */
export function ioKind(error: unknown): 'missing' | 'denied' | 'error' {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'missing';
  if (code === 'EACCES' || code === 'EPERM') return 'denied';
  return 'error';
}

export interface MaterialRef {
  /** 볼트 기준 정규 경로(별칭은 첫 등록 루트 기준으로 합침) */
  rel: string;
  /** 메타데이터 확인 결과: 있음 · 없음 · 루트에 닿지 못함 · 등록 루트 밖 · 확인 안 함 */
  meta: 'ok' | 'missing' | 'unreachable' | 'outside' | 'denied' | 'error' | 'unchecked';
}

export interface Snapshot {
  state: VaultState;
  /** 사용자에게 보여 줄 사유(상대경로 · 일반 문구만) */
  reason: string | null;
  files: VaultFile[];
  /** 미리보기 대상: 불투명 ID → 자료 */
  materials: Map<string, MaterialRef>;
  roots: string[];
  counts: { guides: number; materials: number; links: number; roots: number; privateRules: number; hiddenLinks: number; problems: number };
  problems: string[];
  /** 감시 대상(절대경로, 서버 안에서만 씀) */
  watch: string[];
  /** 입력 지문: 라우터 · 장부 · 안내 문서 내용이 바뀌면 달라진다 */
  signature: string;
  /** 만들 때 쓴 정책 지문(loadPolicy) */
  policy: string;
}

const SKIP = new Set(['CLAUDE.md', 'AGENTS.md']);
/** 파일 목록 이름(catalog.md · catalog--*.md). 물리 위치 기준 재고 목록이라 의미 색인이 아니다 */
export const isCatalogName = (rel: string) => /^catalog(--.*)?\.md$/i.test(rel.split('/').pop()!);
const META_TIMEOUT = 1500;
/** 안내 문서(라우터 포함) 읽기 상한 */
export const GUIDE_MAX_BYTES = 1024 * 1024, GUIDE_TIMEOUT = 3000;
export const empty = (state: VaultState, reason: string, watch: string[] = []): Snapshot => ({
  state, reason, files: [], materials: new Map(), roots: [], problems: [], watch, signature: `${state}:${reason}`, policy: `${state}:${reason}`,
  counts: { guides: 0, materials: 0, links: 0, roots: 0, privateRules: 0, hiddenLinks: 0, problems: 0 }
});

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: NodeJS.Timeout;
  return Promise.race([p.finally(() => clearTimeout(timer)), new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), ms); })]);
}

async function readUtf8(file: string): Promise<string | null> {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(await fsp.readFile(file)); } catch { return null; }
}

/**
 * 안내 문서 읽기(라우터 포함): 읽기 전에 실경로가 지정 볼트 안의 보통 파일인지, 실경로 기준 별칭이 비공개 · 비밀이 아닌지,
 * 크기 상한 안인지 확인한 뒤에만 연다. 시간 상한을 넘기면 읽지 않은 것으로 본다.
 */
async function readGuide(abs: string, vaultReal: string, reals: Map<string, string | null>, hidden: (rel: string) => boolean, privReals: string[] = []): Promise<string | null> {
  const real = await withTimeout(fsp.realpath(abs).catch(() => null), META_TIMEOUT);
  if (!real || real === 'timeout' || !inside(real, vaultReal)) return null;
  if (aliasesOf(real, reals, vaultReal).some(hidden) || underPrivate(real, privReals)) return null;
  const st = await withTimeout(fsp.stat(real).catch(() => null), META_TIMEOUT);
  if (!st || st === 'timeout' || !st.isFile() || st.size > GUIDE_MAX_BYTES) return null;
  const text = await withTimeout(readUtf8(real), GUIDE_TIMEOUT);
  return text === 'timeout' ? null : text;
}

/** 최상위 이름을 NFC로 맞춰 실제 디스크 이름을 찾는다(NFD로 저장된 이름 대응) */
async function topLevelName(root: string, rel: string, listing: string[] | null): Promise<string | null> {
  try { await fsp.access(path.join(root, rel)); return rel; } catch { /* 아래에서 NFC 대조 */ }
  return listing?.find(name => name.normalize('NFC') === rel) ?? null;
}

const inside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);
/** 실경로가 비공개 항목(장부 · 라우터 비공개 이름 · 비밀 이름 루트)의 실경로와 같거나 그 아래인가: 공개 별칭으로 같은 물리 파일 · 폴더에 닿는 우회를 막는다 */
export const underPrivate = (real: string, privReals: string[]) => privReals.some(p => inside(real, p));

/** 라우터 기준 등록 원문 루트의 실경로(닿지 못하면 null) */
export async function rootReals(vault: string, roots: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  await Promise.all(roots.map(async r => {
    const real = await withTimeout(fsp.realpath(path.join(vault, r)).catch(() => null), META_TIMEOUT);
    out.set(r, real === 'timeout' ? null : real);
  }));
  return out;
}

/** 실경로 → 그 실경로를 가리키는 모든 등록 루트 별칭(볼트 상대경로). 첫 번째가 정규 경로 */
export function aliasesOf(real: string, reals: Map<string, string | null>, vaultReal: string): string[] {
  const out: string[] = [];
  for (const [root, rr] of [...reals].sort(([a], [b]) => a.localeCompare(b))) {
    if (rr && inside(real, rr)) out.push(normalizePath([root, path.relative(rr, real).split(path.sep).join('/')].filter(Boolean).join('/')) ?? root);
  }
  if (inside(real, vaultReal)) out.push(path.relative(vaultReal, real).split(path.sep).join('/').normalize('NFC'));
  return [...new Set(out)];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

export type Policy =
  | { ok: true; vaultReal: string; router: string; priv: Set<string>; roots: string[]; privReals: string[]; print: string }
  | { ok: false; state: VaultState; reason: string; print: string };

/** 등록 원문 루트: 라우터가 링크한 src-* 폴더(비공개 · 비밀 제외) */
export function routerRoots(router: string, hidden: (rel: string) => boolean, routerPath = 'CLAUDE.md'): string[] {
  const roots: string[] = [];
  for (const link of parseLinks(router)) {
    const t = resolveHref(routerPath, link.href);
    if (t.type === 'path' && /^src-[^/]+$/.test(t.path) && !hidden(t.path) && !roots.includes(t.path)) roots.push(t.path);
  }
  return roots;
}

/**
 * 정책 로더(스냅숏 · 게시 확인 · 미리보기 공통): 라우터는 실경로 · 크기 · 시간 확인 뒤에만, 장부는 스킬 규칙(볼트 안 실경로) 확인 뒤에만 읽는다.
 * 지문(print)은 검증을 통과해 읽은 내용으로만 만든다.
 */
export async function loadPolicy(vault: string, routerPath = 'CLAUDE.md'): Promise<Policy> {
  const fail = (state: VaultState, reason: string): Policy => ({ ok: false, state, reason, print: `${state}:${reason}` });
  if (!path.isAbsolute(vault)) return fail('invalid', '설정의 vaultPath가 절대경로가 아닙니다');
  let vaultReal: string;
  try {
    vaultReal = await fsp.realpath(vault);
    if (!(await fsp.stat(vaultReal)).isDirectory()) return fail('invalid', 'vaultPath가 폴더가 아닙니다');
  } catch { return fail('unavailable', '볼트 폴더에 접근할 수 없습니다(연결 끊김 · 이동 · 권한)'); }
  if (isPolicyPath(routerPath) || isSecretPath(routerPath)) return fail('blocked', '라우터 경로를 사용할 수 없습니다');
  const router = await readGuide(path.join(vault, routerPath), vaultReal, new Map(), rel => isPolicyPath(rel) || isSecretPath(rel));
  if (router === null) return fail('invalid', '지정한 라우터를 읽을 수 없습니다(없음 · 작업폴더 밖 링크 · 크기 · 인코딩)');
  let priv: Set<string>;
  try { priv = loadPrivatePaths(vault, router); }
  catch (error) {
    return fail('blocked', `비공개 규칙 확인 실패로 연결을 차단했습니다: ${error instanceof PrivacyRuleError ? error.message : '규칙을 확인할 수 없습니다'}`);
  }
  const hidden = (rel: string) => isPolicyPath(rel) || isPrivate(rel, priv) || isSecretPath(rel);
  if (hidden(routerPath)) return fail('blocked', '라우터가 비공개 경로입니다');
  const roots = routerRoots(router, hidden, routerPath);
  // 정책용 금지 범위(표시 · 읽기 대상 목록과 분리): 비공개 항목과 비공개 · 비밀 이름의 등록 루트 링크가 실제로 가리키는 실경로.
  // 이름 경로의 realpath 메타데이터만 확인하고 그 아래를 나열하거나 읽지 않는다. 닿지 않는(없음 · 오프라인) 항목은 이름 기준 규칙만 적용된다.
  const guarded = new Set([...priv, POLICY_DIR, LEDGER]);
  for (const link of parseLinks(router)) {
    const t = resolveHref(routerPath, link.href);
    if (t.type === 'path' && /^src-[^/]+$/.test(t.path) && hidden(t.path)) guarded.add(t.path);
  }
  const privReals = [...new Set((await Promise.all([...guarded].map(rel => withTimeout(fsp.realpath(path.join(vault, rel)).catch(() => null), META_TIMEOUT))))
    .filter((r): r is string => typeof r === 'string' && r !== 'timeout'))].sort();
  const routerReal = await fsp.realpath(path.join(vault, routerPath)).catch(() => null);
  if (!routerReal || underPrivate(routerReal, privReals)) return fail('blocked', '라우터가 비공개 경로입니다');
  const print = createHash('sha256').update(router).update('\0').update([...priv].sort().join('\n')).update('\0').update(privReals.join('\n')).digest('hex');
  return { ok: true, vaultReal, router, priv, roots, privReals, print };
}

function tableRows(text: string): string[][][] {
  const tables: string[][][] = [];
  let current: string[][] = [];
  const ranges = literalRanges(text);
  for (const m of text.matchAll(/<!--(?:[\s\S]*?-->|[\s\S]*$)/g)) ranges.push([m.index, m.index + m[0].length]);
  for (const match of text.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    const line = match[0].replace(/[\r\n]+$/, '');
    const literal = ranges.some(([start, end]) => match.index >= start && match.index < end);
    if (!literal && /^\s*\|.*\|\s*$/.test(line)) current.push(line.trim().slice(1, -1).split('|').map(x => x.trim()));
    else if (current.length) { tables.push(current); current = []; }
  }
  if (current.length) tables.push(current);
  return tables;
}

const AREA_HEADERS = new Set(['분야', '영역', 'area']);
const FOLDER_HEADERS = new Set(['폴더', 'folder']);
const GUIDE_HEADERS = new Set(['색인', '안내', 'index', 'guide', '하위 색인', '하위 안내', '안내 문서', '먼저 읽을 안내 문서', 'subindex', 'sub index', 'sub-index']);
const headerKey = (value: string) => value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

function areaLinks(text: string, from: string): { rows: { folder: string; index: string }[]; invalid: number } {
  const rows: { folder: string; index: string }[] = [];
  let invalid = 0;
  for (const table of tableRows(text)) {
    const header = table[0].map(headerKey);
    const area = header.findIndex(x => AREA_HEADERS.has(x));
    const folder = header.findIndex(x => FOLDER_HEADERS.has(x));
    const index = header.findIndex(x => GUIDE_HEADERS.has(x));
    if (area < 0 || folder < 0 || index < 0 || new Set([area, folder, index]).size !== 3) continue;
    for (const row of table.slice(2)) {
      const folderText = row[folder]?.match(/`([^`]+)`/)?.[1];
      const link = parseLinks(row[index] ?? '');
      const f = folderText && resolveHref(from, folderText.replace(/\/$/, ''));
      const t = link.length === 1 && resolveHref(from, link[0].href);
      if (!row[area] || !f || f.type !== 'path' || !t || t.type !== 'path' || !/\.md$/i.test(t.path)) { invalid++; continue; }
      rows.push({ folder: f.path, index: t.path });
    }
  }
  const duplicates = new Set(rows.filter((r, i) => rows.some((x, j) => i !== j && (x.index === r.index))).map(r => r.index));
  invalid += rows.filter(r => duplicates.has(r.index)).length;
  return { rows: rows.filter(r => !duplicates.has(r.index)), invalid };
}

function guideLinks(text: string, from: string, folder: string): string[] {
  const paths = new Set<string>();
  for (const link of parseLinks(text)) {
    const t = resolveHref(from, link.href);
    if (t.type === 'path' && (!folder || t.path.startsWith(folder + '/')) && /(^|\/)INDEX\.md$/i.test(t.path)) paths.add(t.path);
  }
  for (const table of tableRows(text)) {
    const columns = table[0].map((h, i) => GUIDE_HEADERS.has(headerKey(h)) ? i : -1).filter(i => i >= 0);
    for (const row of table.slice(2)) for (const column of columns) for (const link of parseLinks(row[column] ?? '')) {
      const t = resolveHref(from, link.href);
      if (t.type === 'path') paths.add(t.path);
    }
  }
  return [...paths];
}

export async function readSnapshot(vault: string, structure: 'indexed' | 'workspace' = 'indexed', routerPath = 'CLAUDE.md'): Promise<Snapshot> {
  const routerFile = path.join(vault, routerPath);
  const ledgerFile = path.join(vault, '.secondbrain', 'private-paths.txt');
  const policy = await loadPolicy(vault, routerPath);
  if (!policy.ok) return empty(policy.state, policy.reason, [routerFile, ledgerFile]);
  const { vaultReal, router, priv, privReals } = policy;
  const redact = makeRedactor(priv);
  const hidden = (rel: string) => isPolicyPath(rel) || isPrivate(rel, priv) || isSecretPath(rel) || redact(rel) !== rel;
  let listing: string[] | null = null;
  try { listing = await fsp.readdir(vault); } catch { listing = null; }

  // 2) 등록 원문 루트: 라우터가 링크한 src-* 폴더(비공개 · 비밀 제외)
  const roots = policy.roots;
  const reals = await rootReals(vault, roots);

  // 1) 안내 문서 BFS: 라우터 → 링크로 닿는 최상위 .md만 읽는다
  const texts = new Map<string, string>([[routerPath, router]]);
  const diskName = new Map<string, string>([[routerPath, routerPath]]);
  const order = [routerPath];
  const kinds = new Map<string, NodeKind>([[routerPath, 'router']]);
  const guideReals = new Set<string>([await fsp.realpath(routerFile)]);
  const problems: string[] = [];
  const unreadable = new Set<string>();
  // 작업폴더는 명시된 표의 링크와 INDEX.md만 안내 문서로 읽는다.
  const areaRows = structure === 'workspace' ? areaLinks(router, routerPath) : { rows: [], invalid: 0 };
  const realAreas = await Promise.all(areaRows.rows.map(row => fsp.realpath(path.join(vault, row.index)).catch(() => null)));
  const duplicateReals = new Set(realAreas.filter((real, i) => real && realAreas.indexOf(real) !== i));
  if (duplicateReals.size) {
    areaRows.invalid += realAreas.filter(real => real && duplicateReals.has(real)).length;
    areaRows.rows = areaRows.rows.filter((_, i) => !realAreas[i] || !duplicateReals.has(realAreas[i]));
  }
  const folders = new Map(areaRows.rows.map(row => [row.index, row.folder]));
  if (areaRows.invalid) problems.push(`해석할 수 없는 분야 선언 ${areaRows.invalid}개를 건너뛰었습니다`);
  if (structure === 'workspace' && !areaRows.rows.length) return { ...empty('invalid', '라우터에서 연결된 분야 색인을 찾지 못했습니다', [routerFile, ledgerFile]), problems, counts: { ...empty('invalid', '').counts, problems: problems.length }, policy: policy.print };
  let limitWarned = false;
  // 라우터나 다른 파일 목록에서 닿은 파일 목록은 따라가지 않는다(자동 생성 표식이 없는 이전 형식 목록 포함).
  // 영역 · 하위 색인이 직접 링크한 catalog 이름 문서는 수작업 색인일 수 있어 계속 읽는다.
  const catalogSkipped = new Set<string>();
  for (let i = 0; i < order.length; i++) {
    const from = order[i];
    const links = structure === 'workspace' && i === 0 ? areaRows.rows.map(row => row.index) : structure === 'workspace' ? guideLinks(texts.get(from)!, from, folders.get(from) ?? '') : parseLinks(texts.get(from)!).map(link => resolveHref(from, link.href)).filter((t): t is Extract<typeof t, { type: 'path' }> => t.type === 'path').map(t => t.path);
    for (const rel of links) {
      if (!/\.md$/i.test(rel) || hidden(rel) || (structure === 'indexed' && (rel.includes('/') || SKIP.has(rel)))) continue;
      if (texts.has(rel) || unreadable.has(rel)) continue;
      if (isCatalogName(rel) && (from === routerPath || isCatalogName(from))) { catalogSkipped.add(rel); continue; }
      if (order.length >= 500) { if (!limitWarned) problems.push('안내 문서 상한 500개에 도달해 나머지를 읽지 않았습니다'); limitWarned = true; break; }
      const name = structure === 'indexed' ? await topLevelName(vault, rel, listing) : rel;
      const real = name ? await fsp.realpath(path.join(vault, name)).catch(() => null) : null;
      if (real && guideReals.has(real)) continue;
      const text = name ? await readGuide(path.join(vault, name), vaultReal, reals, hidden, privReals) : null;
      if (text === null) { unreadable.add(rel); continue; }
      if (real) guideReals.add(real);
      // 자동 파일 목록은 존재 메타데이터이며 의미 색인이 아니다. 수천 쪽의 목록 링크를 그래프로 확장하지 않는다.
      const body = text.startsWith('<!-- secondbrain-index-sync:catalog ')
        ? '# 파일 목록 (자동 생성)\n\n자동 파일 목록은 의미 관계 그래프에서 확장하지 않습니다. 전체 목록은 볼트의 원본 안내 파일에서 확인할 수 있습니다.\n'
        : text;
      texts.set(rel, body); diskName.set(rel, name!); order.push(rel);
      if (structure === 'workspace' && i !== 0) folders.set(rel, folders.get(from) ?? '');
      if (structure === 'workspace') {
        const base = rel.split('/').pop()!;
        kinds.set(rel, i === 0 ? 'area' : base.startsWith('moc-') ? 'moc' : base.startsWith('project-') ? 'guide' : 'subindex');
      }
    }
  }
  if (structure === 'workspace' && order.length === 1) return { ...empty('invalid', '분야 색인을 읽을 수 없어 연결 구조가 불완전합니다', [routerFile, ledgerFile, ...areaRows.rows.map(row => path.join(vault, row.index))]), policy: policy.print };
  if (unreadable.size) problems.push(`링크한 안내 문서 ${unreadable.size}개를 읽지 않았습니다(없음 · 권한 · 인코딩 · 크기 · 볼트 밖 · 비공개 실경로)`);

  // 3) 연결 자료 후보: 안내 문서가 링크한 최상위 안내 문서 밖의 대상
  interface Target { rel: string; label: string; summary: string; dirHint: boolean }
  const targets = new Map<string, Target>();
  let hiddenLinks = 0, linkCount = 0;
  const lineOf = (text: string, at: number) => {
    const s = text.lastIndexOf('\n', at) + 1, e = text.indexOf('\n', at);
    return text.slice(s, e < 0 ? text.length : e);
  };
  for (const from of order) {
    const text = texts.get(from)!;
    for (const link of parseLinks(text)) {
      const t = resolveHref(from, link.href);
      if (t.type !== 'path') continue;
      if (hidden(t.path)) { hiddenLinks++; continue; }
      if (texts.has(t.path) || roots.includes(t.path) || (structure === 'indexed' && !t.path.includes('/') && /\.md$/i.test(t.path))) continue;
      linkCount++;
      if (!targets.has(t.path)) {
        const line = lineOf(text, link.index);
        const after = line.slice(line.indexOf(link.label) + link.label.length).replace(/^[^)]*\)/, '').replace(/^[\s—–:\-|·]+/, '').replace(/\s*\|.*$/, '').trim();
        targets.set(t.path, { rel: t.path, label: link.label || t.path.split('/').pop()!, summary: after, dirHint: /\/\s*>?$/.test(link.href) });
      }
    }
  }

  // 4) 메타데이터 확인(본문 열기 없음): 실경로로 별칭 합치기 · 비공개 실경로 · 루트 이탈 · 폴더 여부
  const vaultRealResolved = vaultReal;
  const metas = await mapLimit([...targets.values()], 12, async target => {
    const abs = path.join(vault, target.rel);
    let failed: 'missing' | 'denied' | 'error' = 'missing';
    const real = await withTimeout(fsp.realpath(abs), META_TIMEOUT).catch(e => { failed = ioKind(e); return null; });
    if (real === 'timeout') return { target, canonical: target.rel, meta: 'unreachable' as const, isDir: target.dirHint };
    if (!real) {
      const root = target.rel.split('/')[0];
      const rr = reals.get(root);
      return { target, canonical: target.rel, meta: (reals.has(root) && !rr ? 'unreachable' : failed) as MaterialRef['meta'], isDir: target.dirHint };
    }
    const aliases = aliasesOf(real, reals, vaultRealResolved);
    if (aliases.some(hidden) || underPrivate(real, privReals)) return null; // 공개 별칭이라도 실경로가 비공개 · 비밀(장부 · 비공개 루트 · 미등록 비공개 별칭의 실경로 포함)이면 숨긴다
    let isDir = target.dirHint;
    try { isDir = (await fsp.stat(real)).isDirectory(); } catch { /* 형식 추정 유지 */ }
    const viaRoot = aliases.find(a => roots.includes(a.split('/')[0]));
    const internal = structure === 'workspace' && inside(real, vaultRealResolved);
    return { target, canonical: viaRoot ?? (internal ? aliases.find(a => !roots.includes(a.split('/')[0])) : undefined) ?? target.rel, meta: (viaRoot || internal ? 'ok' : 'outside') as MaterialRef['meta'], isDir };
  });

  const canonicalOf = new Map<string, string>();
  const materials = new Map<string, MaterialRef>();
  const files: VaultFile[] = [];
  for (const m of metas) {
    if (!m) continue;
    canonicalOf.set(m.target.rel, m.canonical);
    if ([...materials.values()].some(x => x.rel === m.canonical)) continue;
    materials.set(opaqueId(m.canonical), { rel: m.canonical, meta: m.meta });
    const format = m.isDir ? 'dir' : formatOfPath(m.canonical) ?? 'other';
    files.push({ path: m.canonical, title: redact(m.target.label), summary: redact(m.target.summary), body: '', updated: '', format, ...(structure === 'workspace' ? { kind: 'material' as const } : {}) });
  }
  // 숨긴 대상(실경로가 비공개)도 링크 다시 쓰기에서 지운다
  const dropped = new Set([...targets.keys()].filter(rel => !canonicalOf.has(rel)));
  hiddenLinks += [...dropped].length;

  // 5) 안내 문서 본문: 비공개 줄 · 비공개/비밀 링크 지움, 별칭은 정규 경로로, 이름 · 절대경로 지우기
  for (const from of order) {
    let text = texts.get(from)!;
    if (from === routerPath) text = text.split(/\r\n|\r|\n/).filter(line => !line.normalize('NFC').includes('비공개')).join('\n');
    const parts: string[] = [];
    let at = 0;
    for (const link of parseLinks(text)) {
      const t = resolveHref(from, link.href);
      parts.push(text.slice(at, link.index));
      at = link.index + link.length;
      if (t.type === 'path' && (hidden(t.path) || dropped.has(t.path))) { parts.push('[비공개 링크]'); continue; }
      // 볼트 밖 · 절대 · 잘못된 경로 링크는 주소를 보내지 않고 이름만 남긴다(바깥 폴더 이름 노출 · 깨진 링크 경고 방지)
      if (t.type === 'invalid') { parts.push(`${link.label} [볼트 밖 링크]`); continue; }
      // 연결하지 않는 최상위 문서(AGENTS.md 등 의도적 제외 · 읽지 못한 안내 문서)는 링크 대신 이름만 남긴다
      if (structure === 'indexed' && t.type === 'path' && t.path !== from && !t.path.includes('/') && /\.md$/i.test(t.path) && !texts.has(t.path)) {
        parts.push(`${link.label} [${SKIP.has(t.path) ? '연결 제외 문서' : catalogSkipped.has(t.path) ? '파일 목록 · 연결 제외' : '읽지 않은 안내 문서'}]`);
        continue;
      }
      const canonical = t.type === 'path' ? canonicalOf.get(t.path) : undefined;
      if (t.type === 'path' && canonical && canonical !== t.path) parts.push(`[${link.label}](${relativeHref(from, canonical)}${t.anchor ? `#${t.anchor}` : ''})`);
      else parts.push(text.slice(link.index, link.index + link.length));
    }
    parts.push(text.slice(at));
    const body = redact(parts.join(''));
    const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
    files.unshift({ path: from, title: from === routerPath ? routerPath : redact(heading || from.replace(/\.md$/i, '')), summary: '', body, updated: '', ...(structure === 'workspace' || from === routerPath ? { kind: kinds.get(from) ?? kindOfPath(from) } : {}) });
  }

  const hash = createHash('sha256');
  for (const from of order) hash.update(from).update('\0').update(texts.get(from)!).update('\0');
  hash.update([...priv].sort().join('\n')).update(roots.join('\n')).update(JSON.stringify([...materials.values()]));
  return {
    state: 'connected', reason: null, files, materials, roots, problems: problems.map(redact),
    counts: { guides: order.length, materials: materials.size, links: linkCount, roots: roots.length, privateRules: priv.size, hiddenLinks, problems: problems.length },
    watch: [routerFile, ledgerFile, ...order.map(rel => path.join(vault, diskName.get(rel)!)), ...[...unreadable].map(rel => path.join(vault, rel))],
    signature: hash.digest('hex').slice(0, 16),
    policy: policy.print
  };
}

/** 브라우저로 보내는 형태: 상대경로 · 지운 글자 · 집계만(감시 경로 등 서버 내부 값 제외) */
export function toPublic(s: Snapshot) {
  return {
    state: s.state, reason: s.reason, signature: s.signature, roots: s.roots, counts: s.counts, problems: s.problems,
    files: s.files, meta: Object.fromEntries([...s.materials].map(([id, m]) => [id, m.meta]))
  };
}
