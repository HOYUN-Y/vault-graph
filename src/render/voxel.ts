// Voxel representation (pure — no Three.js or browser dependency, used as-is in Node tests).
// - One document = one node. Each node is drawn as a per-kind set of cube pieces. Piece count differs from document count; counts, search and selection are per node.
// - Node positions snap the 3D layout (layout3d) to a cube grid (CELL). Two nodes never share a cell; a node moves to the nearest free cell,
//   so neighbors form stair-like clusters. Moves stay within a few cells, so area and branch structure is preserved.
import type { Vec3 } from '../core/layout3d';
import type { DocFormat, NodeKind } from '../core/types';

/**
 * One grid cell (world units). Layout radius is about 1. Neighbor materials under one index usually land in adjacent cells, so cell size is the spacing inside a cluster.
 * 0.024 → 0.027 (+12.5%): cluster centers (guide document spots) stay put; only spacing between materials inside a cluster widens.
 */
export const CELL = 0.027;

export interface Piece {
  /** From node center to piece center (world units) */
  offset: Vec3;
  /** Cube edge length */
  size: number;
  /** Slightly different brightness per piece (0–1) — so faces in one node don't blur into one block */
  tone: number;
}

export interface Assembly {
  pieces: Piece[];
  /** Half width of the piece set (to the outermost face) — selection outline, label and hit radius */
  half: number;
  /** File without a body: empty faces, lit edges only */
  hollow: boolean;
}

/** Turn integer cell coordinates into centered pieces (gap: spacing ratio between pieces) */
function build(cells: Vec3[], unit: number, fill = 0.9): Piece[] {
  const c = [0, 1, 2].map(k => (Math.min(...cells.map(p => p[k])) + Math.max(...cells.map(p => p[k]))) / 2);
  return cells.map(p => ({
    offset: [(p[0] - c[0]) * unit, (p[1] - c[1]) * unit, (p[2] - c[2]) * unit] as Vec3,
    size: unit * fill,
    tone: ((p[0] * 7 + p[1] * 13 + p[2] * 5) % 5) / 4
  }));
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const cube = (n: number) => range(n).flatMap(x => range(n).flatMap(y => range(n).map(z => [x, y, z] as Vec3)));

/** Assembly shape per kind. The legend icons (isometric drawings in ui/Glyph) use the same cell coordinates (SHAPE_CELLS) */
export const SHAPE_CELLS: Record<'router' | 'area' | 'subindex' | 'guide' | 'moc' | 'material', Vec3[]> = {
  // Router core: a rounded 3×3×3 block minus its 8 corners (19 pieces)
  router: cube(3).filter(p => p.filter(v => v !== 1).length < 3),
  // Area index: a large 2×2×2 block
  area: cube(2),
  // Sub-index: a flat 2×2 plate
  subindex: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]],
  // Project guide: a three-step staircase
  guide: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0], [2, 1, 0], [2, 2, 0]],
  // Topic MOC: a six-armed 3D cross
  moc: [[1, 1, 1], [0, 1, 1], [2, 1, 1], [1, 0, 1], [1, 2, 1], [1, 1, 0], [1, 1, 2]],
  // Material: a single cube
  material: [[0, 0, 0]]
};
// Material cube 0.02 → 0.0165 (−17.5%): with wider cells the gap between cubes grows 0.006 → ~0.012. Guide document assemblies are unchanged, so hierarchy reads more clearly
const UNIT: Record<NodeKind, number> = { router: 0.026, area: 0.023, subindex: 0.016, guide: 0.012, moc: 0.017, material: 0.0165 };
const FILL: Record<NodeKind, number> = { router: 0.9, area: 0.9, subindex: 0.88, guide: 0.9, moc: 0.9, material: 0.9 };
/** Ring around the router: 12 small cubes on a horizontal circle (the outer ring of the router icon) */
const RING = 12, RING_R = 0.082, RING_SIZE = 0.011;

export function assembly(kind: NodeKind, format: DocFormat = 'md'): Assembly {
  const pieces = build(SHAPE_CELLS[kind], UNIT[kind], FILL[kind]);
  if (kind === 'router') {
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * Math.PI * 2;
      pieces.push({ offset: [Math.cos(a) * RING_R, 0, Math.sin(a) * RING_R], size: RING_SIZE, tone: (i % 3) / 2 });
    }
  }
  const half = Math.max(...pieces.map(p => Math.max(...p.offset.map(Math.abs)) + p.size / 2));
  return { pieces, half, hollow: kind === 'material' && format !== 'md' };
}

/**
 * Grid-snapped node positions. Guide documents (large assemblies) go first and reserve surrounding cells; materials take the nearest free cell.
 * Same input order and coordinates give the same result (deterministic).
 */
export function snapToGrid(nodes: { kind: NodeKind; pos: Vec3 }[], cell = CELL): Vec3[] {
  const used = new Set<string>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const out: Vec3[] = new Array(nodes.length);
  const order = nodes.map((_, i) => i).sort((a, b) => (nodes[a].kind === 'material' ? 1 : 0) - (nodes[b].kind === 'material' ? 1 : 0) || a - b);
  for (const i of order) {
    const n = nodes[i];
    const reach = n.kind === 'material' ? 0 : Math.max(1, Math.ceil(assembly(n.kind).half / cell - 0.5));
    const base = n.pos.map(v => Math.round(v / cell)) as Vec3;
    const free = (c: Vec3) => {
      for (let x = -reach; x <= reach; x++) for (let y = -reach; y <= reach; y++) for (let z = -reach; z <= reach; z++)
        if (used.has(key(c[0] + x, c[1] + y, c[2] + z))) return false;
      return true;
    };
    let best: Vec3 | null = free(base) ? base : null;
    for (let r = 1; !best && r <= 6; r++) {
      let bestD = Infinity;
      for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) {
        if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== r) continue;
        const c: Vec3 = [base[0] + x, base[1] + y, base[2] + z];
        const d = Math.hypot(c[0] * cell - n.pos[0], c[1] * cell - n.pos[1], c[2] * cell - n.pos[2]);
        if (d < bestD && free(c)) { bestD = d; best = c; }
      }
    }
    const c = best ?? base;
    for (let x = -reach; x <= reach; x++) for (let y = -reach; y <= reach; y++) for (let z = -reach; z <= reach; z++) used.add(key(c[0] + x, c[1] + y, c[2] + z));
    out[i] = [c[0] * cell, c[1] * cell, c[2] * cell];
  }
  return out;
}
