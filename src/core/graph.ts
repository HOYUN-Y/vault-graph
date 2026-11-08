// 가상 볼트 파일 → 탐색 그래프. 관계는 본문의 표준 Markdown 링크 [이름](상대경로)에서만 나온다(markdown.ts · vault.ts 규칙).
// 주 분류(parent)는 색인 링크로 정한 논리 상위이며 디스크 폴더가 아니다.
//
// 두 층을 나눈다.
//   1) 관계(relations): 방향 · 종류가 있는 원자료. A→B 색인 연결과 B→A 주제 연결은 서로 다른 관계로 모두 남는다.
//      영역 필터 · 상세 패널 · 연결 보기 판정은 이 층을 쓴다.
//   2) 화면 선(edges): 연결 보기마다 그 보기에 해당하는 관계만 골라 같은 쌍을 선 하나로 합친다(그리기 전용).
// 같은 자료를 여러 색인 · MOC가 연결해도 노드는 하나다.
import { INDEX_KINDS } from './types';
import type { BrainDoc, Dataset, Edge, EdgeKind, EdgeView } from './types';
import { resolveHref } from './markdown';
import { readVault } from './vault';

export interface Relation {
  source: string;
  target: string;
  kind: EdgeKind;
  /** 주 분류 링크에서 나온 관계(주 분류 색인 → 문서) */
  parent: boolean;
}

export interface BrainGraph {
  label: string;
  synthetic: boolean;
  docs: BrainDoc[];
  byId: Map<string, BrainDoc>;
  routerId: string;
  /** 주 분류 기준 하위 문서(종류 · 제목 순) */
  children: Map<string, BrainDoc[]>;
  /** 방향 · 종류가 있는 관계(같은 방향 · 같은 종류만 중복 제거) */
  relations: Relation[];
  relOut: Map<string, Relation[]>;
  relIn: Map<string, Relation[]>;
  /** 전체 보기의 화면 선(쌍마다 하나) */
  edges: Edge[];
  edgeByKey: Map<string, Edge>;
  /** 본문 링크(방향 있음, 같은 방향 중복 제거) */
  outLinks: Map<string, string[]>;
  inLinks: Map<string, string[]>;
  /** 주 소속 영역(영역 색인 id). 라우터 · MOC는 null */
  areaOf: Map<string, string | null>;
  depth: Map<string, number>;
  areas: BrainDoc[];
  mocs: BrainDoc[];
  /** 정규 경로(NFC) → 고유 ID */
  idOfPath: Map<string, string>;
  /** 라우터의 외부 자료 폴더 표에서 찾은 src-* 루트(가상) */
  sourceRoots: string[];
  /** 구조 문제(같은 경로 중복 · 끊긴 링크 · 닿지 않는 문서 등). 비어 있어야 정상 */
  problems: string[];
  /** 보기별 화면 선 캐시 */
  viewEdges: Map<EdgeView, Edge[]>;
}

const KIND_ORDER: Record<BrainDoc['kind'], number> = { router: 0, area: 1, moc: 2, subindex: 3, guide: 4, material: 5 };
const EDGE_RANK: Record<EdgeKind, number> = { primary: 0, index: 1, topic: 2 };
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const byKindThenTitle = (a: BrainDoc, b: BrainDoc) =>
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title, 'ko') || a.path.localeCompare(b.path, 'ko');

const VIEW_KINDS: Record<EdgeView, ReadonlySet<EdgeKind>> = {
  all: new Set<EdgeKind>(['primary', 'index', 'topic']),
  structure: new Set<EdgeKind>(['primary', 'index']),
  topic: new Set<EdgeKind>(['topic'])
};

/** 관계 → 화면 선: 보기에 해당하는 관계만 골라 같은 쌍을 하나로 합친다. 대표 종류는 분류 소속 > 색인 > 주제 순 */
export function mergeEdges(relations: Relation[], view: EdgeView): Edge[] {
  const kinds = VIEW_KINDS[view];
  const byKey = new Map<string, Edge>();
  for (const r of relations) {
    if (!kinds.has(r.kind)) continue;
    const key = pairKey(r.source, r.target);
    const cur = byKey.get(key);
    if (!cur) { byKey.set(key, { key, source: r.source, target: r.target, kind: r.kind, kinds: [r.kind] }); continue; }
    if (!cur.kinds.includes(r.kind)) cur.kinds.push(r.kind);
    if (EDGE_RANK[r.kind] < EDGE_RANK[cur.kind]) { cur.kind = r.kind; cur.source = r.source; cur.target = r.target; }
  }
  return [...byKey.values()];
}

export function buildGraph(dataset: Dataset): BrainGraph {
  const vault = readVault(dataset.files);
  const problems = [...vault.problems];
  const docs = vault.docs;
  const byId = new Map(docs.map(d => [d.id, d]));
  const routers = docs.filter(d => d.kind === 'router');
  if (routers.length !== 1) problems.push(`라우터(CLAUDE.md)는 하나여야 합니다(현재 ${routers.length}개)`);
  const routerId = routers[0]?.id ?? '';

  const children = new Map<string, BrainDoc[]>();
  for (const doc of docs) {
    if (doc.parent === null) continue;
    const list = children.get(doc.parent) ?? [];
    list.push(doc);
    children.set(doc.parent, list);
  }
  for (const list of children.values()) list.sort(byKindThenTitle);

  // 깊이 · 주 소속 영역: 상위를 따라 올라간다(순환이면 멈추고 보고)
  const depth = new Map<string, number>(), areaOf = new Map<string, string | null>();
  for (const doc of docs) {
    const seen = new Set<string>();
    let d = 0, area: string | null = null, cur: BrainDoc | undefined = doc;
    while (cur) {
      if (seen.has(cur.id)) { problems.push(`상위 순환: ${doc.id}`); break; }
      seen.add(cur.id);
      if (cur.kind === 'area' && area === null) area = cur.id;
      if (cur.parent === null) break;
      cur = byId.get(cur.parent);
      d++;
    }
    depth.set(doc.id, d);
    areaOf.set(doc.id, area);
  }

  // 본문 링크(어댑터가 정규 경로 → ID로 바꾼 것)
  const outLinks = new Map<string, string[]>(), inLinks = new Map<string, string[]>();
  for (const [source, targets] of vault.links) {
    outLinks.set(source, targets);
    for (const t of targets) inLinks.set(t, [...(inLinks.get(t) ?? []), source]);
  }

  // 관계: 주 분류(주 분류 색인 → 문서) + 그 밖의 본문 링크(링크한 문서의 종류로 색인 · 주제 구분).
  // 주 분류를 정한 링크 자체는 분류 소속 관계 하나로만 남긴다. MOC 쪽 분류(라우터 → MOC, MOC → 문서)는 주제 연결이다.
  const relations: Relation[] = [];
  const seen = new Set<string>();
  const add = (r: Relation) => {
    const key = `${r.source}>${r.target}:${r.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    relations.push(r);
  };
  for (const doc of docs) {
    if (doc.parent === null) continue;
    const topic = doc.kind === 'moc' || byId.get(doc.parent)!.kind === 'moc';
    add({ source: doc.parent, target: doc.id, kind: topic ? 'topic' : 'primary', parent: true });
  }
  for (const doc of docs) {
    for (const target of outLinks.get(doc.id) ?? []) {
      if (byId.get(target)!.parent === doc.id) continue;
      add({ source: doc.id, target, kind: INDEX_KINDS.has(doc.kind) ? 'index' : 'topic', parent: false });
    }
  }
  const relOut = new Map<string, Relation[]>(), relIn = new Map<string, Relation[]>();
  for (const r of relations) {
    relOut.set(r.source, [...(relOut.get(r.source) ?? []), r]);
    relIn.set(r.target, [...(relIn.get(r.target) ?? []), r]);
  }

  const edges = mergeEdges(relations, 'all');
  return {
    label: dataset.label, synthetic: dataset.synthetic, docs, byId, routerId, children,
    relations, relOut, relIn, edges, edgeByKey: new Map(edges.map(e => [e.key, e])), outLinks, inLinks, areaOf, depth,
    idOfPath: vault.idOfPath, sourceRoots: vault.sourceRoots,
    areas: docs.filter(d => d.kind === 'area'), mocs: docs.filter(d => d.kind === 'moc'), problems,
    viewEdges: new Map([['all', edges]])
  };
}

/** 분류 경로: 라우터 → 영역 → 하위 색인 → (안내) → 자료. 색인 링크로 정한 논리 경로이며, 여러 MOC가 연결해도 하나로 고정된다 */
export function primaryPath(g: BrainGraph, id: string): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let cur = g.byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur.id);
    cur = cur.parent === null ? undefined : g.byId.get(cur.parent);
  }
  return path;
}

/**
 * 영역 필터 강조 대상: 그 영역에 소속된 문서 + 그 영역의 색인 문서가 명시적으로 연결한(색인 연결) 문서.
 * 방향별 관계를 보므로 서로 다른 영역의 색인 A ↔ B가 서로 링크하면 양쪽 필터가 상대를 강조한다.
 * 주제 연결(MOC · 문서 사이 링크)만으로는 포함하지 않는다. 다른 문서는 숨기지 않고 흐리게 둔다(화면 쪽 책임).
 */
export function areaEmphasis(g: BrainGraph, areaId: string): Set<string> {
  const out = new Set<string>();
  for (const doc of g.docs) if (g.areaOf.get(doc.id) === areaId) out.add(doc.id);
  for (const r of g.relations) if (r.kind === 'index' && g.areaOf.get(r.source) === areaId) out.add(r.target);
  return out;
}

/** 연결 보기별 화면 선: 영역 구조 = 분류 소속 + 색인 연결, 주제 연결 = 라우터 → MOC · MOC → 자료 · 문서 사이 링크 */
export function edgesInView(g: BrainGraph, view: EdgeView): Edge[] {
  let edges = g.viewEdges.get(view);
  if (!edges) { edges = mergeEdges(g.relations, view); g.viewEdges.set(view, edges); }
  return edges;
}

/** 주어진 선을 따라 바로 이어진 문서 */
export function neighborsOf(edges: Edge[], id: string): Set<string> {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.source === id) out.add(e.target);
    else if (e.target === id) out.add(e.source);
  }
  return out;
}

export interface Related { doc: BrainDoc; kind: EdgeKind; kinds: EdgeKind[] }

/** 상세 패널용: 이 문서로 들어오는 관계와 나가는 관계(상대 문서마다 하나, 종류는 모두 표시) */
export function relationsOf(g: BrainGraph, id: string): { incoming: Related[]; outgoing: Related[] } {
  const group = (list: Relation[], other: (r: Relation) => string) => {
    const by = new Map<string, EdgeKind[]>();
    for (const r of list) {
      const kinds = by.get(other(r)) ?? [];
      if (!kinds.includes(r.kind)) kinds.push(r.kind);
      by.set(other(r), kinds);
    }
    return [...by].map(([oid, kinds]) => {
      kinds.sort((a, b) => EDGE_RANK[a] - EDGE_RANK[b]);
      return { doc: g.byId.get(oid)!, kind: kinds[0], kinds };
    });
  };
  return { incoming: group(g.relIn.get(id) ?? [], r => r.source), outgoing: group(g.relOut.get(id) ?? [], r => r.target) };
}

/** 본문 링크 주소 → 연결 문서 ID(문서 위치 기준 상대경로). 외부 주소 · 앵커 · 깨진 링크는 null */
export function linkTarget(g: BrainGraph, fromId: string, href: string): string | null {
  const from = g.byId.get(fromId);
  if (!from) return null;
  const t = resolveHref(from.path, href);
  return t.type === 'path' ? g.idOfPath.get(t.path) ?? null : null;
}
