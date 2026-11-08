// 범례 · 검색 · 패널 · 2D 대체 화면의 복셀 표식: 3D 조립(render/voxel.ts SHAPE_CELLS)과 같은 칸 좌표를 등각으로 투영한 면(순수 계산)
import type { NodeKind } from '../core/types';
import { SHAPE_CELLS } from '../render/voxel';

export interface Face { d: string; shade: number }

const C30 = Math.cos(Math.PI / 6);
const project = (x: number, y: number, z: number): [number, number] => [(x - z) * C30, (x + z) * 0.5 - y];

/** 반지름 1 안에 맞춘 등각 면 목록(뒤에서 앞 순서). shade: 윗면 1 · 왼쪽 앞면 0.72 · 오른쪽 앞면 0.5 */
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
  // 자료(큐브 하나)는 다른 표식보다 작게 보이도록 최소 폭을 둔다
  const span = Math.max(maxX - minX, maxY - minY, kind === 'material' ? 2.6 : 0);
  const k = 2 / span, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const f = (v: number) => Math.round(v * 1000) / 1000;
  return raw.map(({ pts, shade }) => ({ d: `M${pts.map(([px, py]) => `${f((px - cx) * k)},${f((py - cy) * k)}`).join('L')}Z`, shade }));
}
const FACES = new Map<NodeKind, Face[]>();
/** 종류별 등각 면(반지름 1 기준, 캐시) */
export function voxelFaces(kind: NodeKind): Face[] {
  let faces = FACES.get(kind);
  if (!faces) { faces = buildFaces(kind); FACES.set(kind, faces); }
  return faces;
}
