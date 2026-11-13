// Voxel glyphs for legend · search · panel · 2D fallback: isometric faces projected from the same cell coordinates as the 3D assemblies (render/voxel.ts SHAPE_CELLS); pure computation
import type { NodeKind } from '../core/types';
import { SHAPE_CELLS } from '../render/voxel';

export interface Face { d: string; shade: number }

const C30 = Math.cos(Math.PI / 6);
const project = (x: number, y: number, z: number): [number, number] => [(x - z) * C30, (x + z) * 0.5 - y];

/** Isometric faces fitted within radius 1 (back-to-front order). shade: top 1 · left front 0.72 · right front 0.5 */
function buildFaces(kind: NodeKind): Face[] {
  const cells = [...SHAPE_CELLS[kind]].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]) || a[1] - b[1]);
  const raw: { pts: [number, number][]; shade: number }[] = [];
  for (const [x, y, z] of cells) {
    const P = (a: number, b: number, c: number) => project(x + a, y + b, z + c);
    raw.push({ pts: [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)], shade: 0.72 });
    raw.push({ pts: [P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)], shade: 0.5 });
    raw.push({ pts: [P(0, 1, 0), P(1, 1, 0), P(1, 1, 1), P(0, 1, 1)], shade: 1 });
  }
  const all = raw.flatMap(f => f.pts);
  const minX = Math.min(...all.map(p => p[0])), maxX = Math.max(...all.map(p => p[0]));
  const minY = Math.min(...all.map(p => p[1])), maxY = Math.max(...all.map(p => p[1]));
  // Give material (a single cube) a minimum width so it reads smaller than the other glyphs
  const span = Math.max(maxX - minX, maxY - minY, kind === 'material' ? 2.6 : 0);
  const k = 2 / span, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const f = (v: number) => Math.round(v * 1000) / 1000;
  return raw.map(({ pts, shade }) => ({ d: `M${pts.map(([px, py]) => `${f((px - cx) * k)},${f((py - cy) * k)}`).join('L')}Z`, shade }));
}
const FACES = new Map<NodeKind, Face[]>();
/** Isometric faces per kind (radius 1, cached) */
export function voxelFaces(kind: NodeKind): Face[] {
  let faces = FACES.get(kind);
  if (!faces) { faces = buildFaces(kind); FACES.set(kind, faces); }
  return faces;
}
