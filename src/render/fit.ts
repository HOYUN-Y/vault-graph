// 전체 보기 거리(순수 계산 — Three.js에 의존하지 않아 Node 테스트에서 그대로 쓴다).
// 기본 시선 방향에서 자동 회전 한 바퀴(세로축 둘레) 동안 모든 노드 조립이 상단바 · 도구줄 · 범례를 뺀 안전 영역 안에 들어오는 가장 가까운 거리.
// 카메라는 원점을 보고, 화면 중심은 안전 영역 가운데로 옮겨져 있다(BrainScene의 화면 치우침).
import type { Vec3 } from '../core/layout3d';

export interface FitInput {
  /** 노드 중심(세계 좌표, 회전 전) */
  points: Vec3[];
  /** 노드 조립의 반 너비(가장 바깥 면까지) */
  halves: ArrayLike<number>;
  /** 원점에서 카메라 쪽 시선 방향(정규화하지 않아도 된다) */
  dir: Vec3;
  /** 세로 시야각(라디안) */
  vfov: number;
  /** 캔버스 가로/세로(px) */
  width: number;
  height: number;
  /** 가려지는 가장자리(px) */
  insets: { top: number; right: number; bottom: number; left: number };
  /** 안전 영역 안쪽 여백(px) */
  margin?: number;
  /** 한 바퀴를 나눈 표본 각도 수(표본 사이 이동량은 여유로 더해 어느 각도에서도 안전 영역 안이다) */
  steps?: number;
  /** 오른쪽 아래 구석을 가리는 도구줄(휴대폰 세로 조작 막대)의 크기(px, 캔버스 오른쪽 · 아래 가장자리부터) */
  corner?: { w: number; h: number };
  /** 투영 중심의 화면 치우침(px, 중심 = 화면 가운데 − offset). corner가 있을 때 막대와의 거리 계산에 쓴다 */
  offset?: { x: number; y: number };
}

export function fitDistance({ points, halves, dir, vfov, width, height, insets, margin = 14, steps = 120, corner, offset = { x: 0, y: 0 } }: FitInput): number {
  const len = Math.hypot(...dir) || 1;
  const z: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];
  // 카메라 기준 축: 오른쪽 = up × z, 위 = z × 오른쪽 (up = +y)
  const xl = Math.hypot(z[2], z[0]) || 1;
  const x: Vec3 = [z[2] / xl, 0, -z[0] / xl];
  const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const tv = Math.tan(vfov / 2), th = tv * (width / height);
  // 안전 영역의 반 너비를 화면 반 너비에 대한 비율로(치우침으로 안전 영역 가운데가 투영 중심이다)
  const ax = Math.max(0.2, (width - insets.left - insets.right - 2 * margin) / width);
  const ay = Math.max(0.2, (height - insets.top - insets.bottom - 2 * margin) / height);
  // 구석 막대: 노드가 막대 왼쪽 끝보다 왼쪽이거나 막대 위끝보다 위에 있으면 된다(둘 중 하나). 투영 중심에서 그 선까지의 거리를 화면 반 너비 · 반 높이 비율로
  const bx = corner ? (width - corner.w - margin - (width / 2 - offset.x)) / (width / 2) : 0;
  const by = corner ? (height - corner.h - margin - (height / 2 - offset.y)) / (height / 2) : 0;
  const useCorner = !!corner && corner.w > 0 && corner.h > 0 && (bx > 0 || by > 0);
  let d = 0;
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const px = p[0] * c + p[2] * sn, pz = -p[0] * sn + p[2] * c, py = p[1];
      const cx = px * x[0] + py * x[1] + pz * x[2];
      const cy = px * y[0] + py * y[1] + pz * y[2];
      const cz = px * z[0] + py * z[1] + pz * z[2];
      // 조립 모서리까지(정육면체 대각 방향 여유 포함) + 표본 각도 사이에서 움직이는 최대 거리(호 길이)
      const r = (halves[i] ?? 0) * 1.4 + Math.hypot(p[0], p[2]) * (Math.PI / steps);
      d = Math.max(d, (Math.abs(cx) + r) / (ax * th) + cz + r, (Math.abs(cy) + r) / (ay * tv) + cz + r);
      if (useCorner) {
        // 오른쪽 끝(cx + r)이 막대 왼쪽 선 안에 드는 거리, 아래 끝(−cy + r)이 막대 위 선 위로 오는 거리 중 가까운 쪽
        const ex = cx + r, ey = r - cy;
        const dx = ex <= 0 ? 0 : bx > 0 ? ex / (bx * th) + cz + r : Infinity;
        const dy = ey <= 0 ? 0 : by > 0 ? ey / (by * tv) + cz + r : Infinity;
        const need = Math.min(dx, dy);
        if (need < Infinity) d = Math.max(d, need);
      }
    }
  }
  return d;
}
