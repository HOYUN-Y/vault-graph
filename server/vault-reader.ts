// Real vault snapshot (Node server only, read-only).
// - Reads only the router (CLAUDE.md), the private ledger, and top-level guide documents (.md) linked from the router.
// - Never reads source file bodies. Materials linked by an index become nodes from link label, same-line description and relative path only.
//   To merge aliases of the same source file and block escapes from registered roots or private real paths,
//   it checks realpath/stat metadata only (never opens the body).
// - All text sent to the browser has private names and local absolute paths redacted. Paths are vault-relative only.
// - If private rules cannot be parsed, no data is sent (blocked).
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { literalRanges, normalizePath, parseLinks, relativeHref, resolveHref } from '../src/core/markdown';
import { formatOfPath, opaqueId } from '../src/core/vault';
import { kindOfPath } from '../src/core/vault';
import type { VaultFile } from '../src/core/vault';
import type { NodeKind } from '../src/core/types';
import { LEDGER, POLICY_DIR, PrivacyRuleError, isPolicyPath, isPrivate, isPrivateLine, isSecretPath, loadPrivatePaths, makeRedactor } from './privacy';

export type VaultState = 'connected' | 'blocked' | 'unavailable' | 'invalid';

/** File system error kind: only ENOENT/ENOTDIR mean missing; permission (EACCES/EPERM) and other I/O errors are not treated as deletion */
export function ioKind(error: unknown): 'missing' | 'denied' | 'error' {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'missing';
  if (code === 'EACCES' || code === 'EPERM') return 'denied';
  return 'error';
}

export interface MaterialRef {
  /** Canonical vault-relative path (aliases merged under the first registered root) */
  rel: string;
  /** Metadata check result: ok, missing, root unreachable, outside registered roots, unchecked */
  meta: 'ok' | 'missing' | 'unreachable' | 'outside' | 'denied' | 'error' | 'unchecked';
}

export interface Snapshot {
  state: VaultState;
  /** Reason shown to the user (relative paths and generic wording only) */
  reason: string | null;
  files: VaultFile[];
  /** Preview targets: opaque ID -> material */
  materials: Map<string, MaterialRef>;
  roots: string[];
  counts: { guides: number; materials: number; links: number; roots: number; privateRules: number; hiddenLinks: number; problems: number };
  problems: string[];
  /** Watched paths (absolute, server-side only) */
  watch: string[];
  /** Input fingerprint: changes when the router, ledger or guide documents change */
  signature: string;
  /** Policy fingerprint used to build it (loadPolicy) */
  policy: string;
}

const SKIP = new Set(['CLAUDE.md', 'AGENTS.md']);
/** Catalog names (catalog.md, catalog--*.md). A physical-location inventory, not a semantic index */
export const isCatalogName = (rel: string) => /^catalog(--.*)?\.md$/i.test(rel.split('/').pop()!);
const META_TIMEOUT = 1500;
/** Read limits for guide documents (router included) */
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
 * Read a guide document (router included): open it only after checking that its real path is a regular file inside the vault,
 * that no real-path alias is private or secret, and that it is within the size limit. A timeout counts as unread.
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

/** Find the on-disk name of a top-level entry by NFC match (handles names stored as NFD) */
async function topLevelName(root: string, rel: string, listing: string[] | null): Promise<string | null> {
  try { await fsp.access(path.join(root, rel)); return rel; } catch { /* NFC match below */ }
  return listing?.find(name => name.normalize('NFC') === rel) ?? null;
}

const inside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);
/** Whether a real path equals or sits under a private item's real path (ledger, router private names, secret-named roots): blocks reaching the same file or folder via a public alias */
export const underPrivate = (real: string, privReals: string[]) => privReals.some(p => inside(real, p));

/** Real paths of the router's registered source roots (null if unreachable) */
export async function rootReals(vault: string, roots: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  await Promise.all(roots.map(async r => {
    const real = await withTimeout(fsp.realpath(path.join(vault, r)).catch(() => null), META_TIMEOUT);
    out.set(r, real === 'timeout' ? null : real);
  }));
  return out;
}

/** Real path -> every registered-root alias pointing at it (vault-relative). The first is canonical */
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

/** Registered source roots: src-* folders linked from the router (private and secret excluded) */
export function routerRoots(router: string, hidden: (rel: string) => boolean, routerPath = 'CLAUDE.md'): string[] {
  const roots: string[] = [];
  for (const link of parseLinks(router)) {
    const t = resolveHref(routerPath, link.href);
    if (t.type === 'path' && /^src-[^/]+$/.test(t.path) && !hidden(t.path) && !roots.includes(t.path)) roots.push(t.path);
  }
  return roots;
}

/**
 * Policy loader (shared by snapshot, publish check and preview): reads the router only after real-path, size and time checks, and the ledger only after the skill rule (real path inside the vault).
 * The fingerprint (print) is built only from content that passed validation.
 */
export async function loadPolicy(vault: string, routerPath = 'CLAUDE.md'): Promise<Policy> {
  const fail = (state: VaultState, reason: string): Policy => ({ ok: false, state, reason, print: `${state}:${reason}` });
  if (!path.isAbsolute(vault)) return fail('invalid', 'vaultPath in settings is not an absolute path');
  let vaultReal: string;
  try {
    vaultReal = await fsp.realpath(vault);
    if (!(await fsp.stat(vaultReal)).isDirectory()) return fail('invalid', 'vaultPath is not a folder');
  } catch { return fail('unavailable', 'Cannot access the vault folder (disconnected, moved or permission)'); }
  if (isPolicyPath(routerPath) || isSecretPath(routerPath)) return fail('blocked', 'The router path cannot be used');
  const router = await readGuide(path.join(vault, routerPath), vaultReal, new Map(), rel => isPolicyPath(rel) || isSecretPath(rel));
  if (router === null) return fail('invalid', 'Cannot read the router (missing, links outside the workspace, size or encoding)');
  let priv: Set<string>;
  try { priv = loadPrivatePaths(vault, router); }
  catch (error) {
    return fail('blocked', `Connection blocked because private rules could not be verified: ${error instanceof PrivacyRuleError ? error.message : 'rules cannot be verified'}`);
  }
  const hidden = (rel: string) => isPolicyPath(rel) || isPrivate(rel, priv) || isSecretPath(rel);
  if (hidden(routerPath)) return fail('blocked', 'The router is a private path');
  const roots = routerRoots(router, hidden, routerPath);
  // Policy deny set (separate from display/read lists): real paths behind private items and private or secret-named root links.
  // Only realpath metadata of the named paths is checked; nothing below is listed or read. Unreachable (missing/offline) items get name rules only.
  const guarded = new Set([...priv, POLICY_DIR, LEDGER]);
  for (const link of parseLinks(router)) {
    const t = resolveHref(routerPath, link.href);
    if (t.type === 'path' && /^src-[^/]+$/.test(t.path) && hidden(t.path)) guarded.add(t.path);
  }
  const privReals = [...new Set((await Promise.all([...guarded].map(rel => withTimeout(fsp.realpath(path.join(vault, rel)).catch(() => null), META_TIMEOUT))))
    .filter((r): r is string => typeof r === 'string' && r !== 'timeout'))].sort();
  const routerReal = await fsp.realpath(path.join(vault, routerPath)).catch(() => null);
  if (!routerReal || underPrivate(routerReal, privReals)) return fail('blocked', 'The router is a private path');
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

// Table headers match vault content, so Korean and English are both accepted.
const AREA_HEADERS = new Set(['분야', '영역', 'area']);
const FOLDER_HEADERS = new Set(['폴더', 'folder']);
const GUIDE_HEADERS = new Set(['색인', '안내', 'index', 'guide', '하위 색인', '하위 안내', '안내 문서', 'guide document', '먼저 읽을 안내 문서', 'subindex', 'sub index', 'sub-index']);
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

  // 2) Registered source roots: src-* folders linked from the router (private and secret excluded)
  const roots = policy.roots;
  const reals = await rootReals(vault, roots);

  // 1) Guide document BFS: router -> only linked top-level .md files are read
  const texts = new Map<string, string>([[routerPath, router]]);
  const diskName = new Map<string, string>([[routerPath, routerPath]]);
  const order = [routerPath];
  const kinds = new Map<string, NodeKind>([[routerPath, 'router']]);
  const guideReals = new Set<string>([await fsp.realpath(routerFile)]);
  const problems: string[] = [];
  const unreadable = new Set<string>();
  // Workspace mode reads only links in the declared tables and INDEX.md as guide documents.
  const areaRows = structure === 'workspace' ? areaLinks(router, routerPath) : { rows: [], invalid: 0 };
  const realAreas = await Promise.all(areaRows.rows.map(row => fsp.realpath(path.join(vault, row.index)).catch(() => null)));
  const duplicateReals = new Set(realAreas.filter((real, i) => real && realAreas.indexOf(real) !== i));
  if (duplicateReals.size) {
    areaRows.invalid += realAreas.filter(real => real && duplicateReals.has(real)).length;
    areaRows.rows = areaRows.rows.filter((_, i) => !realAreas[i] || !duplicateReals.has(realAreas[i]));
  }
  const folders = new Map(areaRows.rows.map(row => [row.index, row.folder]));
  if (areaRows.invalid) problems.push(`Skipped ${areaRows.invalid} area declaration(s) that could not be parsed`);
  if (structure === 'workspace' && !areaRows.rows.length) return { ...empty('invalid', 'No area index linked from the router was found', [routerFile, ledgerFile]), problems, counts: { ...empty('invalid', '').counts, problems: problems.length }, policy: policy.print };
  let limitWarned = false;
  // Catalogs reached from the router or another catalog are not followed (including older catalogs without the generated marker).
  // catalog-named documents linked directly from an area index or sub-index may be hand-written indexes, so they are still read.
  const catalogSkipped = new Set<string>();
  for (let i = 0; i < order.length; i++) {
    const from = order[i];
    const links = structure === 'workspace' && i === 0 ? areaRows.rows.map(row => row.index) : structure === 'workspace' ? guideLinks(texts.get(from)!, from, folders.get(from) ?? '') : parseLinks(texts.get(from)!).map(link => resolveHref(from, link.href)).filter((t): t is Extract<typeof t, { type: 'path' }> => t.type === 'path').map(t => t.path);
    for (const rel of links) {
      if (!/\.md$/i.test(rel) || hidden(rel) || (structure === 'indexed' && (rel.includes('/') || SKIP.has(rel)))) continue;
      if (texts.has(rel) || unreadable.has(rel)) continue;
      if (isCatalogName(rel) && (from === routerPath || isCatalogName(from))) { catalogSkipped.add(rel); continue; }
      if (order.length >= 500) { if (!limitWarned) problems.push('Reached the 500 guide document limit; the rest were not read'); limitWarned = true; break; }
      const name = structure === 'indexed' ? await topLevelName(vault, rel, listing) : rel;
      const real = name ? await fsp.realpath(path.join(vault, name)).catch(() => null) : null;
      if (real && guideReals.has(real)) continue;
      const text = name ? await readGuide(path.join(vault, name), vaultReal, reals, hidden, privReals) : null;
      if (text === null) { unreadable.add(rel); continue; }
      if (real) guideReals.add(real);
      // Generated catalogs are existence metadata, not a semantic index. Their thousands of links are not expanded into the graph.
      const body = text.startsWith('<!-- secondbrain-index-sync:catalog ')
        ? '# Catalog (generated)\n\nGenerated catalogs are not expanded in the semantic graph. See the original file in the vault for the full list.\n'
        : text;
      texts.set(rel, body); diskName.set(rel, name!); order.push(rel);
      if (structure === 'workspace' && i !== 0) folders.set(rel, folders.get(from) ?? '');
      if (structure === 'workspace') {
        const base = rel.split('/').pop()!;
        kinds.set(rel, i === 0 ? 'area' : base.startsWith('moc-') ? 'moc' : base.startsWith('project-') ? 'guide' : 'subindex');
      }
    }
  }
  if (structure === 'workspace' && order.length === 1) return { ...empty('invalid', 'Cannot read the area index, so the link structure is incomplete', [routerFile, ledgerFile, ...areaRows.rows.map(row => path.join(vault, row.index))]), policy: policy.print };
  if (unreadable.size) problems.push(`Did not read ${unreadable.size} linked guide document(s) (missing, permission, encoding, size, outside vault or private real path)`);

  // 3) Material candidates: link targets from guide documents other than top-level guide documents
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

  // 4) Metadata check (no body read): merge aliases by real path, private real paths, root escape, folder or not
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
    if (aliases.some(hidden) || underPrivate(real, privReals)) return null; // Hide even a public alias if its real path is private or secret (incl. ledger, private roots, unregistered private aliases)
    let isDir = target.dirHint;
    try { isDir = (await fsp.stat(real)).isDirectory(); } catch { /* keep the guessed format */ }
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
  // Hidden targets (private real path) are also removed when rewriting links
  const dropped = new Set([...targets.keys()].filter(rel => !canonicalOf.has(rel)));
  hiddenLinks += [...dropped].length;

  // 5) Guide document bodies: drop private lines and private/secret links, rewrite aliases to canonical paths, redact names and absolute paths
  for (const from of order) {
    let text = texts.get(from)!;
    if (from === routerPath) text = text.split(/\r\n|\r|\n/).filter(line => !isPrivateLine(line)).join('\n');
    const parts: string[] = [];
    let at = 0;
    for (const link of parseLinks(text)) {
      const t = resolveHref(from, link.href);
      parts.push(text.slice(at, link.index));
      at = link.index + link.length;
      if (t.type === 'path' && (hidden(t.path) || dropped.has(t.path))) { parts.push('[private link]'); continue; }
      // Links outside the vault, absolute or invalid keep only the label (no outside folder names, no broken-link warnings)
      if (t.type === 'invalid') { parts.push(`${link.label} [outside vault]`); continue; }
      // Unlinked top-level documents (intentionally excluded like AGENTS.md, or unread guides) keep only the label
      if (structure === 'indexed' && t.type === 'path' && t.path !== from && !t.path.includes('/') && /\.md$/i.test(t.path) && !texts.has(t.path)) {
        parts.push(`${link.label} [${SKIP.has(t.path) ? 'excluded document' : catalogSkipped.has(t.path) ? 'catalog · not linked' : 'unread guide'}]`);
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

/** Browser-facing shape: relative paths, redacted text and counts only (no server internals like watch paths) */
export function toPublic(s: Snapshot) {
  return {
    state: s.state, reason: s.reason, signature: s.signature, roots: s.roots, counts: s.counts, problems: s.problems,
    files: s.files, meta: Object.fromEntries([...s.materials].map(([id, m]) => [id, m.meta]))
  };
}
