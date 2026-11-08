// 복셀 표현(순수 계산 — Three.js · 브라우저에 의존하지 않아 Node 테스트에서 그대로 쓴다).
// - 문서 하나 = 노드 하나. 노드는 종류별로 정해진 큐브 조각(piece) 묶음으로 그린다. 조각 수는 문서 수와 다르며 개수 · 검색 · 선택은 노드 기준이다.
// - 노드 자리는 3D 배치(layout3d) 결과를 정육면체 격자(CELL)에 맞춰 놓는다. 같은 칸을 두 노드가 쓰지 않게 가까운 빈칸으로 옮겨
//   이웃 노드가 계단처럼 붙어 보이는 군집이 된다. 이동량은 칸 몇 개 이내라 영역 · 가지 구조는 그대로다.
import type { Vec3 } from '../core/layout3d';
import type { DocFormat, NodeKind } from '../core/types';

/**
 * 격자 한 칸(세계 단위). 배치 반지름은 약 1이다. 같은 색인 아래 이웃 자료는 대개 바로 옆 칸에 놓이므로 칸 크기가 곧 군집 안 문서 간격이다.
 * 0.024 → 0.027(+12.5%): 군집 중심(안내 문서 자리)은 그대로 두고 군집 안 자료 사이만 넓힌다.
 */
export const CELL = 0.027;

export interface Piece {
  /** 노드 중심에서 조각 중심까지(세계 단위) */
  offset: Vec3;
  /** 정육면체 한 변 */
  size: number;
  /** 조각마다 아주 조금 다른 밝기(0~1) — 같은 노드 안에서 면이 한 덩어리로 뭉개지지 않게 */
  tone: number;
}

export interface Assembly {
  pieces: Piece[];
  /** 조각 묶음의 반 너비(가장 바깥 면까지) — 선택 테두리 · 이름표 · 누르기 반경 */
  half: number;
  /** 본문 없는 파일: 면을 비우고 모서리만 밝힌다 */
  hollow: boolean;
}

/** 정수 칸 좌표 목록을 가운데 맞춰 조각으로 만든다(gap: 조각 사이 틈 비율) */
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

/** 종류별 조립 형태. 범례 그림(ui/Glyph의 등각 그림)도 같은 칸 좌표(SHAPE_CELLS)를 쓴다 */
export const SHAPE_CELLS: Record<'router' | 'area' | 'subindex' | 'guide' | 'moc' | 'material', Vec3[]> = {
  // 라우터 핵: 3×3×3에서 꼭짓점 8개를 뺀 둥근 덩어리(19조각)
  router: cube(3).filter(p => p.filter(v => v !== 1).length < 3),
  // 영역 색인: 2×2×2 큰 블록
  area: cube(2),
  // 하위 색인: 2×2 납작한 판
  subindex: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]],
  // 프로젝트 안내: 세 칸 계단
  guide: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0], [2, 1, 0], [2, 2, 0]],
  // 주제 MOC: 여섯 갈래 입체 십자
  moc: [[1, 1, 1], [0, 1, 1], [2, 1, 1], [1, 0, 1], [1, 2, 1], [1, 1, 0], [1, 1, 2]],
  // 자료: 정육면체 하나
  material: [[0, 0, 0]]
};
// 자료 큐브 0.02 → 0.0165(−17.5%): 칸이 넓어진 만큼 큐브 사이 틈이 0.006 → 약 0.012로 벌어진다. 안내 문서 조립은 그대로라 위계가 더 또렷하다
const UNIT: Record<NodeKind, number> = { router: 0.026, area: 0.023, subindex: 0.016, guide: 0.012, moc: 0.017, material: 0.0165 };
const FILL: Record<NodeKind, number> = { router: 0.9, area: 0.9, subindex: 0.88, guide: 0.9, moc: 0.9, material: 0.9 };
/** 라우터 둘레 고리: 수평 원 위의 작은 큐브 12개(라우터 그림의 바깥 고리) */
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
 * 격자에 맞춘 노드 자리. 안내 문서(큰 조립)를 먼저 놓아 그 둘레 칸을 비워 두고, 자료는 가장 가까운 빈칸을 쓴다.
 * 입력 순서 · 좌표가 같으면 결과도 같다(결정적).
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
