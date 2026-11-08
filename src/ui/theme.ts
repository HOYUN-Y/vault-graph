// 화면 표현: 종류 이름 · 연결 이름 · 영역별 색. 색은 영역 순서로 정하고(데모 ID에 묶지 않는다), 하위 색인마다 같은 계열 안에서 조금씩 바꾼다.
import type { BrainGraph } from '../core/graph';
import type { EdgeKind, EdgeView, NodeKind } from '../core/types';

export const KIND_LABEL: Record<NodeKind, string> = {
  router: '라우터', area: '영역 색인', subindex: '하위 색인', guide: '프로젝트 안내', moc: '주제 MOC', material: '자료'
};
export const EDGE_LABEL: Record<EdgeKind, string> = { primary: '분류 소속', index: '색인 연결', topic: '주제 연결' };
export const VIEW_LABEL: Record<EdgeView, string> = { all: '전체', structure: '영역 구조', topic: '주제 연결' };

export const ROUTER_COLOR = '#F6F1E7';
export const TOPIC_COLOR = '#FFB52E';
const FALLBACK = '#94A3B8';
// 영역 계열(테마 팔레트 안에서 명도 · 온도로 구분): [영역 색, 하위 색인 1, 2, 3 …]
// 첫 영역은 차가운 슬레이트, 둘째 영역은 따뜻한 아이보리, 그다음은 더 어두운 슬레이트 · 아이보리. 주제(MOC)는 금색 하나.
const FAMILIES = [
  ['#CBD5E1', '#CBD5E1', '#94A3B8', '#E2E8F0', '#B4C0D0'],
  ['#F6F1E7', '#F6F1E7', '#E4D9C3', '#FBF8F2', '#D9CCB2'],
  ['#94A3B8', '#94A3B8', '#7C8BA2', '#AEB9CA', '#8796AC'],
  ['#E4D9C3', '#E4D9C3', '#D2C4A8', '#EFE7D8', '#C8B998']
];

export type Palette = Map<string, string>;

export function buildPalette(g: BrainGraph): Palette {
  const out: Palette = new Map();
  if (g.routerId) out.set(g.routerId, ROUTER_COLOR);
  for (const moc of g.mocs) out.set(moc.id, TOPIC_COLOR);
  g.areas.forEach((area, i) => {
    const family = FAMILIES[i % FAMILIES.length];
    out.set(area.id, family[0]);
    const paint = (id: string, color: string) => {
      for (const kid of g.children.get(id) ?? []) {
        out.set(kid.id, color);
        paint(kid.id, color);
      }
    };
    let branch = 1;
    for (const kid of g.children.get(area.id) ?? []) {
      const color = kid.kind === 'subindex' ? family[1 + ((branch++ - 1) % (family.length - 1))] : family[0];
      out.set(kid.id, color);
      paint(kid.id, color);
    }
  });
  return out;
}

export const colorOf = (palette: Palette, id: string) => palette.get(id) ?? FALLBACK;
