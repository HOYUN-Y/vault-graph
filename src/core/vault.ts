// 가상 볼트 읽기(어댑터): 파일 목록(경로 · 본문) → 문서 · 링크 · 주 분류. 디스크 · 심볼릭 링크를 직접 읽지 않는다.
// secondbrain-index-sync 스킬의 구조를 따른다.
//   - 볼트 최상위의 안내 문서: CLAUDE.md(라우터) · <영역>.md(영역 색인) · <영역>--<주제>.md(하위 색인)
//     · moc-<주제>.md(주제 MOC) · project-<이름>.md(프로젝트 안내)
//   - 원문: src-<이름>/… (라우터 '외부 자료 폴더' 표에 등록한 외부 폴더 링크 안). 데모 경로는 모두 가상이다.
//   - 관계는 본문의 [이름](문서 기준 상대경로) 링크에서만 나온다. 링크는 정규 경로 → 고유 ID로 바꾸므로
//     같은 원문을 여러 색인 · MOC가 연결해도 노드는 하나다.
//   - 분류(주 소속)는 원문이 디스크의 어느 폴더에 있는지와 무관하다. 색인 링크로만 정한다(classify).
import { normalizePath, parseLinks, resolveHref } from './markdown';
import type { BrainDoc, DocFormat, NodeKind } from './types';

/** 어댑터 입력 한 건: 볼트 기준 경로와 그 문서의 메타데이터 · UTF-8 본문 */
export interface VaultFile {
  path: string;
  title: string;
  summary: string;
  body: string;
  /** YYYY-MM-DD(실제 볼트는 원문을 열지 않으므로 빈 값) */
  updated: string;
  /** 형식을 확장자 대신 지정할 때(실제 볼트: 폴더 'dir', 알 수 없는 확장자 'other') */
  format?: DocFormat;
}

export interface VaultRead {
  docs: BrainDoc[];
  /** 문서 ID → 본문이 링크한 문서 ID(본문 순서 · 중복 제거 · 자기 자신 제외) */
  links: Map<string, string[]>;
  /** 정규 경로(NFC) → 고유 ID */
  idOfPath: Map<string, string>;
  /** 라우터가 링크한 src-* 외부 자료 폴더. 후속 연결기는 원문 루트를 따로 설정하지 않고 여기서 찾는다 */
  sourceRoots: string[];
  problems: string[];
}

/** 경로 규칙으로 문서 종류를 정한다. 최상위가 아니거나 .md가 아니면 원문 자료다 */
export function kindOfPath(path: string): NodeKind {
  if (path.includes('/') || !/\.md$/i.test(path)) return 'material';
  if (path === 'CLAUDE.md') return 'router';
  if (path.startsWith('moc-')) return 'moc';
  if (path.startsWith('project-')) return 'guide';
  if (path.includes('--')) return 'subindex';
  return 'area';
}

const FORMATS: [RegExp, DocFormat][] = [[/\.md$/i, 'md'], [/\.pdf$/i, 'pdf'], [/\.(png|jpe?g|gif|webp|svg)$/i, 'image']];
export function formatOfPath(path: string): DocFormat | null {
  return FORMATS.find(([re]) => re.test(path))?.[1] ?? null;
}

function fnv(text: string, seed: number) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** 정규 경로에서 만든 불투명 ID. 화면 · 주소 · 후속 읽기 API는 경로 대신 이 값을 쓴다 */
export const opaqueId = (path: string) => `d${fnv(path, 2166136261).toString(36)}${fnv(path, 0x9e3779b9).toString(36)}`;

const AREA_AXIS: ReadonlySet<NodeKind> = new Set<NodeKind>(['area', 'subindex', 'guide']);

/**
 * 주 분류(논리 상위) 정하기 — 디스크 폴더가 아니라 색인 링크를 따른다.
 *   1) 영역 축: 라우터 → 영역 색인 → (하위 색인 · 프로젝트 안내) → 문서. 너비 우선, 같은 깊이는 본문 링크 순서.
 *      먼저 닿은 색인이 주 분류이고, 다른 영역 색인이 함께 연결한 링크는 '색인 연결'로 남는다.
 *   2) 라우터의 나머지 링크(프로젝트 표 바로가기 등): 영역 색인이 분류하지 않은 문서만 라우터 아래에 둔다.
 *   3) 주제 축: MOC만 연결한 문서는 그 MOC 아래에 둔다.
 */
function classify(router: string | undefined, links: Map<string, string[]>, kindOf: (id: string) => NodeKind) {
  const parent = new Map<string, string | null>();
  if (!router) return parent;
  parent.set(router, null);
  const top = links.get(router) ?? [];
  const queue: string[] = [];
  const walk = () => {
    while (queue.length) {
      const s = queue.shift()!;
      for (const t of links.get(s) ?? []) {
        if (parent.has(t)) continue;
        parent.set(t, s);
        if (AREA_AXIS.has(kindOf(t))) queue.push(t);
      }
    }
  };
  for (const t of top) {
    const k = kindOf(t);
    if ((k === 'area' || k === 'moc') && !parent.has(t)) { parent.set(t, router); if (k === 'area') queue.push(t); }
  }
  walk();
  for (const t of top) if (!parent.has(t)) { parent.set(t, router); if (AREA_AXIS.has(kindOf(t))) queue.push(t); }
  walk();
  const topics = top.filter(t => kindOf(t) === 'moc');
  while (topics.length) {
    const m = topics.shift()!;
    for (const t of links.get(m) ?? []) {
      if (parent.has(t)) continue;
      parent.set(t, m);
      if (kindOf(t) === 'moc') topics.push(t);
    }
  }
  return parent;
}

export function readVault(files: VaultFile[]): VaultRead {
  const problems: string[] = [];
  const idOfPath = new Map<string, string>();
  const ids = new Set<string>();
  const entries: { file: VaultFile; path: string; id: string; kind: NodeKind; format: DocFormat }[] = [];
  for (const file of files) {
    const path = normalizePath(file.path);
    if (!path) { problems.push(`잘못된 경로: ${file.path}`); continue; }
    if (idOfPath.has(path)) { problems.push(`같은 원문 경로가 두 번 있음: ${path}`); continue; }
    const format = file.format ?? formatOfPath(path) ?? 'other';
    const id = opaqueId(path);
    if (ids.has(id)) { problems.push(`ID 충돌: ${path}`); continue; }
    ids.add(id);
    idOfPath.set(path, id);
    entries.push({ file, path, id, kind: kindOfPath(path), format });
  }
  const kindById = new Map(entries.map(e => [e.id, e.kind]));
  const dirs = new Set<string>();
  for (const path of idOfPath.keys()) {
    const segs = path.split('/');
    for (let i = 1; i < segs.length; i++) dirs.add(segs.slice(0, i).join('/'));
  }

  const links = new Map<string, string[]>();
  const sourceRoots: string[] = [];
  for (const e of entries) {
    if (e.format !== 'md') continue;
    const out: string[] = [];
    for (const link of parseLinks(e.file.body)) {
      const t = resolveHref(e.path, link.href);
      if (t.type === 'external' || t.type === 'anchor') continue;
      if (t.type === 'invalid') { problems.push(`끊긴 링크(${t.reason}): ${e.path} → ${link.href}`); continue; }
      const id = idOfPath.get(t.path);
      if (!id) {
        // 폴더 링크: 라우터의 외부 자료 폴더 표(src-*)는 원문 루트 목록으로 남기고, 노드로 만들지 않는다
        if (dirs.has(t.path)) {
          if (e.kind === 'router' && /^src-[^/]+$/.test(t.path) && !sourceRoots.includes(t.path)) sourceRoots.push(t.path);
          continue;
        }
        problems.push(`끊긴 링크: ${e.path} → ${link.href}`);
        continue;
      }
      if (id !== e.id && !out.includes(id)) out.push(id);
    }
    if (out.length) links.set(e.id, out);
  }

  const routers = entries.filter(e => e.kind === 'router');
  const parent = classify(routers[0]?.id, links, id => kindById.get(id)!);
  const docs: BrainDoc[] = entries.map(({ file, path, id, kind, format }) => {
    if (!parent.has(id) && kind !== 'router') problems.push(`라우터에서 색인 링크로 닿지 않는 문서: ${path}`);
    return { id, kind, title: file.title, path, parent: parent.get(id) ?? null, summary: file.summary, body: file.body, format, updated: file.updated };
  });
  return { docs, links, idOfPath, sourceRoots, problems };
}
