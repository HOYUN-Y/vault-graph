// 1단계 임시 미리보기(정적 2D)용 방사형 배치. 3D 신경망 배치는 다음 단계에서 이 모듈과 별도로 만든다.
// 위치는 그래프(분류 소속)만으로 정한다 — 필터 · 연결 보기 · 선택이 바뀌어도 자료가 움직이지 않는다.
// 공유 자료도 주 소속 영역 쪽 자리 하나만 갖는다. 좌표는 단위 원 기준(x 오른쪽, y 아래쪽).
import type { BrainGraph } from './graph';

export interface Placement { x: number; y: number; angle: number; radius: number }

const RADII = [0, 0.3, 0.56, 0.8, 0.98, 1.1];
const MOC_RADIUS = 0.2;
const DEG = Math.PI / 180;
// 잎이 많아 같은 반지름의 이웃 간격이 MIN_ARC보다 좁아지면 잎을 안쪽으로 몇 줄(ROW_STEP 간격, 최대 MAX_ROWS)에 엇갈려 둔다
const MIN_ARC = 0.012;
const ROW_STEP = 0.03;
const MAX_ROWS = 4;
// 그래도 모자라면(5,000개 데모는 영역마다 잎 1,000개 남짓) 촘촘한 배치: 안내 문서는 안쪽 원(DENSE_HUB 비율)에 두고,
// 잎은 바깥 띠(DENSE_BAND)에 각도 순서대로 열(列)마다 여러 줄씩 채운다. 이웃 간격은 줄 · 열 모두 MIN_ARC 이상이다
const DENSE_HUB = 0.6;
const DENSE_BAND: [number, number] = [0.68, 1.1];

/** 영역 하나의 부채꼴 너비(라디안). 영역이 넷 이상이면 사이 여백을 줄인다 */
export const wedgeWidth = (areas: number) => Math.min(150, 360 / Math.max(areas, 1) - (areas > 3 ? 16 : 30)) * DEG;

export function radialLayout(g: BrainGraph): Map<string, Placement> {
  const out = new Map<string, Placement>();
  const place = (id: string, angle: number, radius: number) =>
    out.set(id, { x: radius * Math.cos(angle), y: -radius * Math.sin(angle), angle, radius });
  if (g.routerId) place(g.routerId, 0, 0);

  // 영역마다 부채꼴 하나. 첫 영역이 왼쪽(180°)에서 시작해 고르게 나눈다
  const n = g.areas.length;
  const width = wedgeWidth(n);
  g.areas.forEach((area, i) => {
    const center = (180 + (360 / n) * i) * DEG;
    // 잎(하위가 없는 문서)에 자리를 고르게 나누고, 하위 색인 묶음 사이에는 반 칸을 비운다
    const leaves: { id: string; slot: number }[] = [];
    let slot = 0;
    const walk = (id: string, top: boolean) => {
      const kids = g.children.get(id) ?? [];
      if (!kids.length) { leaves.push({ id, slot }); slot += 1; return; }
      kids.forEach((kid, k) => { if (top && k > 0) slot += 0.5; walk(kid.id, false); });
    };
    walk(area.id, true);
    const total = Math.max(slot, 1);
    const angleOf = new Map<string, number>();
    for (const leaf of leaves) angleOf.set(leaf.id, center - width / 2 + ((leaf.slot + 0.5) / total) * width);
    const need = Math.max(1, Math.ceil(MIN_ARC / ((RADII[3] * width) / total)));
    const rows = Math.min(MAX_ROWS, need);
    const inset = new Map(leaves.map((leaf, k) => [leaf.id, (k % rows) * ROW_STEP]));
    const dense = need > MAX_ROWS;
    // 상위 문서는 하위 각도의 가운데
    const settle = (id: string): number => {
      const kids = g.children.get(id) ?? [];
      if (!kids.length) return angleOf.get(id)!;
      const angles = kids.map(k => settle(k.id));
      const a = (Math.min(...angles) + Math.max(...angles)) / 2;
      angleOf.set(id, a);
      return a;
    };
    settle(area.id);
    if (!dense) {
      for (const [id, angle] of angleOf) place(id, angle, RADII[Math.min(g.depth.get(id) ?? 1, RADII.length - 1)] - (inset.get(id) ?? 0));
      return;
    }
    const isLeaf = new Set(leaves.map(l => l.id));
    for (const [id, angle] of angleOf) if (!isLeaf.has(id)) place(id, angle, RADII[Math.min(g.depth.get(id) ?? 1, RADII.length - 1)] * DENSE_HUB);
    const [r0, r1] = DENSE_BAND;
    const cols = Math.max(1, Math.floor((r0 * width) / MIN_ARC));
    const lines = Math.ceil(leaves.length / cols);
    const rstep = lines > 1 ? (r1 - r0) / (lines - 1) : 0;
    const cstep = width / cols;
    leaves.forEach((leaf, k) => {
      const col = Math.floor(k / lines), row = k % lines;
      place(leaf.id, center - width / 2 + (col + 0.5) * cstep, r1 - row * rstep);
    });
  });

  // 주제 MOC: 영역 부채꼴 사이(위 · 아래)에 번갈아, 가운데 가까이
  const gaps = Math.max(n, 1);
  g.mocs.forEach((moc, i) => {
    const gap = i % gaps, round = Math.floor(i / gaps);
    const center = (180 + (360 / gaps) * gap + 360 / gaps / 2) * DEG;
    // 영역이 넷 이상이면 틈이 좁아지므로 같은 비율로 좁혀 이웃 틈의 MOC와 겹치지 않게 한다
    const offset = (round % 2 === 0 ? -1 : 1) * (30 + 14 * Math.floor(round / 2)) * Math.min(1, 3 / gaps) * DEG;
    place(moc.id, center + offset, MOC_RADIUS);
  });
  return out;
}
