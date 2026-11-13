// Presentation: kind names · edge names · per-area colors. Colors follow area order (not tied to demo IDs) and vary slightly within the same family for each sub-index.
import type { BrainGraph } from '../core/graph';
import type { EdgeKind, EdgeView, NodeKind } from '../core/types';

export const KIND_LABEL: Record<NodeKind, string> = {
  router: 'Router', area: 'Area index', subindex: 'Sub-index', guide: 'Project guide', moc: 'Topic MOC', material: 'Material'
};
export const EDGE_LABEL: Record<EdgeKind, string> = { primary: 'Hierarchy', index: 'Index link', topic: 'Topic link' };
export const VIEW_LABEL: Record<EdgeView, string> = { all: 'All', structure: 'Area structure', topic: 'Topic links' };

export const ROUTER_COLOR = '#F6F1E7';
export const TOPIC_COLOR = '#FFB52E';
const FALLBACK = '#94A3B8';
// Area families (told apart by lightness · temperature within the theme palette): [area color, sub-index 1, 2, 3 …]
// First area is cool slate, second is warm ivory, then darker slate · ivory. Topics (MOCs) are a single gold.
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
