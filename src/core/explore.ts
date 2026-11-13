// 경로별 펼침 규칙(순수 계산). 계획서 8절 "공유 자료의 ID · 위치 · 표시 규칙"을 그대로 옮긴다.
// - 탐색 경로 관계: 영역 축 = 분류 소속 + 색인 연결, 주제 축 = 라우터 → MOC · MOC → 자료. 자료 사이 링크는 경로가 아니라 관계다.
// - 보이는 문서 = 라우터에서 시작해 "펼친" 문서의 경로 관계를 따라 닿는 문서(현재 연결 보기의 축만) + 선택한 문서(고정).
// - 접기는 그 경로만 접는다: 다른 펼친 경로로 닿는 공유 자료는 남고, 접은 문서에서 나가는 경로 선만 감춘다.
// - 검색 선택은 주 소속 경로(분류 소속)만 펼친다. 여러 MOC가 연결해도 임의 경로를 열지 않는다.
// - 자리는 바꾸지 않는다(layout3d가 한 번 정한 자리).
// - 작업폴더 연결(덩어리 방식)은 영역 색인만 펼친 채 시작하고, 접힌 색인은 하위 개수를 단 덩어리로 보인다. 덩어리를 누르면 펼친다(App).
import type { BrainGraph, Relation } from './graph';
import { mergeEdges, primaryPath } from './graph';
import type { Edge, EdgeView } from './types';

const PATH_SOURCES = new Set(['router', 'area', 'subindex', 'guide', 'moc']);

/** 이 관계가 연결 보기 view에서 탐색 경로인가 */
export function isPathRelation(g: BrainGraph, r: Relation, view: EdgeView): boolean {
  const source = g.byId.get(r.source);
  if (!source || !PATH_SOURCES.has(source.kind)) return false;
  const structure = r.kind === 'primary' || r.kind === 'index';
  const topic = r.kind === 'topic' && (source.kind === 'router' || source.kind === 'moc');
  return view === 'structure' ? structure : view === 'topic' ? topic : structure || topic;
}

/** 펼치고 접을 수 있는 문서: 어떤 보기에서든 경로 하위가 있는 문서(라우터 제외 — 늘 펼침) */
export function expandable(g: BrainGraph): Set<string> {
  const out = new Set<string>();
  for (const r of g.relations) if (r.source !== g.routerId && isPathRelation(g, r, 'all')) out.add(r.source);
  return out;
}

/**
 * 처음 상태. 색인 방식 · 데모: 모두 펼침(큰 신경망이 먼저 보이게).
 * 덩어리 방식(작업폴더 연결, fold): 영역 색인만 펼치고 나머지 색인은 하위 개수를 단 덩어리로 접어 둔다.
 */
export function defaultExpanded(g: BrainGraph, fold = false): Set<string> {
  const all = expandable(g);
  if (!fold) return all;
  return new Set(g.areas.map(a => a.id).filter(id => all.has(id)));
}

/** 접혀 있을 때 덩어리에 다는 개수: 주 분류 하위 전체(자손) 수와 바로 아래 경로 하위 수 중 큰 값(MOC는 주 분류 하위가 거의 없다) */
export function foldCounts(g: BrainGraph): Map<string, number> {
  const below = new Map<string, number>();
  const subtree = (id: string): number => {
    const known = below.get(id);
    if (known !== undefined) return known;
    below.set(id, 0); // 순환 방지
    let n = 0;
    for (const c of g.children.get(id) ?? []) n += 1 + subtree(c.id);
    below.set(id, n);
    return n;
  };
  const out = new Map<string, number>();
  for (const id of expandable(g)) out.set(id, Math.max(subtree(id), pathChildCount(g, id, 'all')));
  return out;
}

/** 보이지만 접혀 있는 문서 → 접힌 개수(장면이 덩어리 크기 · 이름표 개수로 쓴다) */
export function foldedVisible(visible: ReadonlySet<string>, expanded: ReadonlySet<string>, counts: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, n] of counts) if (n > 0 && visible.has(id) && !expanded.has(id)) out.set(id, n);
  return out;
}

export interface ExploreState { expanded: ReadonlySet<string>; view: EdgeView; pinned: string | null }

const isOpen = (g: BrainGraph, s: ExploreState, id: string) => id === g.routerId || s.expanded.has(id);

export function visibleSet(g: BrainGraph, s: ExploreState): Set<string> {
  const seen = new Set<string>();
  if (g.routerId) seen.add(g.routerId);
  const queue = g.routerId ? [g.routerId] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (!isOpen(g, s, id)) continue;
    for (const r of g.relOut.get(id) ?? []) {
      if (seen.has(r.target) || !isPathRelation(g, r, s.view)) continue;
      seen.add(r.target);
      queue.push(r.target);
    }
  }
  if (s.pinned && g.byId.has(s.pinned)) seen.add(s.pinned);
  return seen;
}

/**
 * 보이는 선: 관계를 하나씩 먼저 거른 뒤(현재 보기의 종류 · 양 끝이 보임 · 경로 관계면 출발 문서가 펼쳐져 있음) 남은 관계만 쌍마다 합친다.
 * 그래서 접힌 분류 소속 관계는 빠지고, 같은 쌍의 주제 링크가 살아 있으면 그 선은 주제 연결로만 남는다.
 */
export function shownEdges(g: BrainGraph, s: ExploreState, visible: Set<string>): Edge[] {
  const kept = g.relations.filter(r => visible.has(r.source) && visible.has(r.target)
    && (!isPathRelation(g, r, s.view) || isOpen(g, s, r.source)));
  return mergeEdges(kept, s.view);
}

/** 검색 · 링크로 고를 때: 주 소속 경로의 상위 문서만 펼친다 */
export function revealPrimaryPath(g: BrainGraph, expanded: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(expanded);
  const path = primaryPath(g, id);
  for (const ancestor of path.slice(0, -1)) if (ancestor !== g.routerId) next.add(ancestor);
  return next;
}

export function toggleExpanded(expanded: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/** 접혔을 때 감춰질 경로 하위 수(패널 단추 표시용) */
export function pathChildCount(g: BrainGraph, id: string, view: EdgeView): number {
  return (g.relOut.get(id) ?? []).filter(r => isPathRelation(g, r, view)).length;
}
