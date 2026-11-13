// Per-path expand rules (pure): IDs, positions and display rules for shared materials.
// - Navigation path relations: area axis = primary + index links, topic axis = router → MOC, MOC → material. Material-to-material links are relations, not paths.
// - Visible = documents reached from the router along path relations of "expanded" documents (current link view's axis only) + the selected document (pinned).
// - Collapse closes only that path: shared materials reached by another expanded path stay; only path lines leaving the collapsed document hide.
// - A search pick expands only the primary path. Several linking MOCs never open an arbitrary path.
// - Positions never change (set once by layout3d).
// - Workspace mode (cluster mode) starts with only area indexes expanded; collapsed indexes show as clusters with a child count. Clicking a cluster expands it (App).
import type { BrainGraph, Relation } from './graph';
import { mergeEdges, primaryPath } from './graph';
import type { Edge, EdgeView } from './types';

const PATH_SOURCES = new Set(['router', 'area', 'subindex', 'guide', 'moc']);

/** Whether this relation is a navigation path in link view `view` */
export function isPathRelation(g: BrainGraph, r: Relation, view: EdgeView): boolean {
  const source = g.byId.get(r.source);
  if (!source || !PATH_SOURCES.has(source.kind)) return false;
  const structure = r.kind === 'primary' || r.kind === 'index';
  const topic = r.kind === 'topic' && (source.kind === 'router' || source.kind === 'moc');
  return view === 'structure' ? structure : view === 'topic' ? topic : structure || topic;
}

/** Expandable documents: those with path children in any view (except the router — always expanded) */
export function expandable(g: BrainGraph): Set<string> {
  const out = new Set<string>();
  for (const r of g.relations) if (r.source !== g.routerId && isPathRelation(g, r, 'all')) out.add(r.source);
  return out;
}

/**
 * Initial state. Indexed mode and demo: all expanded (show the big network first).
 * Cluster mode (workspace mode, fold): expand only area indexes; other indexes stay collapsed as clusters with a child count.
 */
export function defaultExpanded(g: BrainGraph, fold = false): Set<string> {
  const all = expandable(g);
  if (!fold) return all;
  return new Set(g.areas.map(a => a.id).filter(id => all.has(id)));
}

/** Count shown on a collapsed cluster: the larger of all primary descendants and direct path children (MOCs have few primary children) */
export function foldCounts(g: BrainGraph): Map<string, number> {
  const below = new Map<string, number>();
  const subtree = (id: string): number => {
    const known = below.get(id);
    if (known !== undefined) return known;
    below.set(id, 0); // cycle guard
    let n = 0;
    for (const c of g.children.get(id) ?? []) n += 1 + subtree(c.id);
    below.set(id, n);
    return n;
  };
  const out = new Map<string, number>();
  for (const id of expandable(g)) out.set(id, Math.max(subtree(id), pathChildCount(g, id, 'all')));
  return out;
}

/** Visible but collapsed documents → collapsed count (the scene uses it for cluster size and label count) */
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
 * Visible edges: filter relations one by one first (current view's kinds, both ends visible, source expanded for path relations), then merge per pair.
 * So collapsed primary relations drop out, and if the pair's topic link survives, the line stays as a topic link only.
 */
export function shownEdges(g: BrainGraph, s: ExploreState, visible: Set<string>): Edge[] {
  const kept = g.relations.filter(r => visible.has(r.source) && visible.has(r.target)
    && (!isPathRelation(g, r, s.view) || isOpen(g, s, r.source)));
  return mergeEdges(kept, s.view);
}

/** When picked by search or link: expand only the ancestors on the primary path */
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

/** Number of path children hidden when collapsed (for the panel button) */
export function pathChildCount(g: BrainGraph, id: string, view: EdgeView): number {
  return (g.relOut.get(id) ?? []).filter(r => isPathRelation(g, r, view)).length;
}
