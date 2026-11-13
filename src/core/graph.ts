// Virtual vault files → navigation graph. Relations come only from standard Markdown links [name](relative path) in bodies (markdown.ts · vault.ts rules).
// The primary parent is a logical parent set by index links, not a disk folder.
//
// Two layers:
//   1) relations: directed, typed raw data. An A→B index link and a B→A topic link both stay as separate relations.
//      Area filter, detail panel and link-view checks use this layer.
//   2) edges: per link view, keep only the matching relations and merge each pair into one line (drawing only).
// A material linked by several indexes or MOCs is still one node.
import { INDEX_KINDS } from './types';
import type { BrainDoc, Dataset, Edge, EdgeKind, EdgeView } from './types';
import { resolveHref } from './markdown';
import { readVault } from './vault';

export interface Relation {
  source: string;
  target: string;
  kind: EdgeKind;
  /** Relation from the primary link (primary index → document) */
  parent: boolean;
}

export interface BrainGraph {
  label: string;
  synthetic: boolean;
  docs: BrainDoc[];
  byId: Map<string, BrainDoc>;
  routerId: string;
  /** Children by primary parent (sorted by kind, then title) */
  children: Map<string, BrainDoc[]>;
  /** Directed, typed relations (deduplicated only for same direction and kind) */
  relations: Relation[];
  relOut: Map<string, Relation[]>;
  relIn: Map<string, Relation[]>;
  /** Edges of the full view (one per pair) */
  edges: Edge[];
  edgeByKey: Map<string, Edge>;
  /** Body links (directed, same-direction duplicates removed) */
  outLinks: Map<string, string[]>;
  inLinks: Map<string, string[]>;
  /** Primary area (area index id). null for the router and MOCs */
  areaOf: Map<string, string | null>;
  depth: Map<string, number>;
  areas: BrainDoc[];
  mocs: BrainDoc[];
  /** Normalized path (NFC) → unique ID */
  idOfPath: Map<string, string>;
  /** src-* roots found in the router's external source folder table (virtual) */
  sourceRoots: string[];
  /** Structural problems (duplicate paths, broken links, unreachable documents, etc.). Should be empty */
  problems: string[];
  /** Per-view edge cache */
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

/** Relations → edges: keep relations in the view and merge each pair. Representative kind: primary > index > topic */
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
  if (routers.length !== 1) problems.push(`There must be exactly one router (found ${routers.length})`);
  const routerId = routers[0]?.id ?? '';

  const children = new Map<string, BrainDoc[]>();
  for (const doc of docs) {
    if (doc.parent === null) continue;
    const list = children.get(doc.parent) ?? [];
    list.push(doc);
    children.set(doc.parent, list);
  }
  for (const list of children.values()) list.sort(byKindThenTitle);

  // Depth and primary area: walk up the parents (stop and report on a cycle)
  const depth = new Map<string, number>(), areaOf = new Map<string, string | null>();
  for (const doc of docs) {
    const seen = new Set<string>();
    let d = 0, area: string | null = null, cur: BrainDoc | undefined = doc;
    while (cur) {
      if (seen.has(cur.id)) { problems.push(`Parent cycle: ${doc.id}`); break; }
      seen.add(cur.id);
      if (cur.kind === 'area' && area === null) area = cur.id;
      if (cur.parent === null) break;
      cur = byId.get(cur.parent);
      d++;
    }
    depth.set(doc.id, d);
    areaOf.set(doc.id, area);
  }

  // Body links (the adapter already mapped normalized paths → IDs)
  const outLinks = new Map<string, string[]>(), inLinks = new Map<string, string[]>();
  for (const [source, targets] of vault.links) {
    outLinks.set(source, targets);
    for (const t of targets) inLinks.set(t, [...(inLinks.get(t) ?? []), source]);
  }

  // Relations: primary (primary index → document) + other body links (index vs topic by the linking document's kind).
  // The link that set the primary parent stays only as one primary relation. MOC-side parents (router → MOC, MOC → document) are topic links.
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

/** Primary path: router → area → sub-index → (guide) → material. A logical path set by index links; fixed even if several MOCs link it */
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
 * Area filter highlight set: documents in the area + documents explicitly linked by the area's indexes (index links).
 * Uses directed relations, so if indexes A ↔ B in different areas link each other, both filters highlight the other.
 * Topic links alone (MOC or document-to-document) don't count. Other documents are dimmed, not hidden (the view's job).
 */
export function areaEmphasis(g: BrainGraph, areaId: string): Set<string> {
  const out = new Set<string>();
  for (const doc of g.docs) if (g.areaOf.get(doc.id) === areaId) out.add(doc.id);
  for (const r of g.relations) if (r.kind === 'index' && g.areaOf.get(r.source) === areaId) out.add(r.target);
  return out;
}

/** Edges per link view: structure = primary + index links; topic = router → MOC, MOC → material, document-to-document links */
export function edgesInView(g: BrainGraph, view: EdgeView): Edge[] {
  let edges = g.viewEdges.get(view);
  if (!edges) { edges = mergeEdges(g.relations, view); g.viewEdges.set(view, edges); }
  return edges;
}

/** Documents directly connected along the given edges */
export function neighborsOf(edges: Edge[], id: string): Set<string> {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.source === id) out.add(e.target);
    else if (e.target === id) out.add(e.source);
  }
  return out;
}

export interface Related { doc: BrainDoc; kind: EdgeKind; kinds: EdgeKind[] }

/** For the detail panel: incoming and outgoing relations (one per other document, all kinds shown) */
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

/** Body link href → linked document ID (relative to the document). null for external URLs, anchors and broken links */
export function linkTarget(g: BrainGraph, fromId: string, href: string): string | null {
  const from = g.byId.get(fromId);
  if (!from) return null;
  const t = resolveHref(from.path, href);
  return t.type === 'path' ? g.idOfPath.get(t.path) ?? null : null;
}
