// Radial layout for the stage-1 temporary preview (static 2D). The 3D network layout is a separate module.
// Positions depend only on the graph (primary) — filters, link view and selection never move materials.
// Shared materials get one spot, on their primary area's side. Coordinates on the unit circle (x right, y down).
import type { BrainGraph } from './graph';

export interface Placement { x: number; y: number; angle: number; radius: number }

const RADII = [0, 0.3, 0.56, 0.8, 0.98, 1.1];
const MOC_RADIUS = 0.2;
const DEG = Math.PI / 180;
// When many leaves make neighbor spacing at one radius narrower than MIN_ARC, stagger leaves inward in rows (ROW_STEP apart, up to MAX_ROWS)
const MIN_ARC = 0.012;
const ROW_STEP = 0.03;
const MAX_ROWS = 4;
// If that's still not enough (the 5,000 demo has ~1,000 leaves per area), use a dense layout: guide documents on an inner circle (DENSE_HUB ratio),
// leaves fill the outer band (DENSE_BAND) column by column in angle order, several rows each. Row and column spacing are both at least MIN_ARC
const DENSE_HUB = 0.6;
const DENSE_BAND: [number, number] = [0.68, 1.1];

/** Wedge width of one area (radians). Gaps shrink with four or more areas */
export const wedgeWidth = (areas: number) => Math.min(150, 360 / Math.max(areas, 1) - (areas > 3 ? 16 : 30)) * DEG;

export function radialLayout(g: BrainGraph): Map<string, Placement> {
  const out = new Map<string, Placement>();
  const place = (id: string, angle: number, radius: number) =>
    out.set(id, { x: radius * Math.cos(angle), y: -radius * Math.sin(angle), angle, radius });
  if (g.routerId) place(g.routerId, 0, 0);

  // One wedge per area, evenly split, starting with the first area on the left (180°)
  const n = g.areas.length;
  const width = wedgeWidth(n);
  g.areas.forEach((area, i) => {
    const center = (180 + (360 / n) * i) * DEG;
    // Spread slots evenly over leaves (documents with no children), leaving half a slot between sub-index groups
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
    // A parent sits at the middle of its children's angles
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

  // Topic MOCs: alternate in the gaps between area wedges (above/below), near the center
  const gaps = Math.max(n, 1);
  g.mocs.forEach((moc, i) => {
    const gap = i % gaps, round = Math.floor(i / gaps);
    const center = (180 + (360 / gaps) * gap + 360 / gaps / 2) * DEG;
    // With four or more areas the gaps narrow, so shrink by the same ratio to avoid overlapping MOCs in neighboring gaps
    const offset = (round % 2 === 0 ? -1 : 1) * (30 + 14 * Math.floor(round / 2)) * Math.min(1, 3 / gaps) * DEG;
    place(moc.id, center + offset, MOC_RADIUS);
  });
  return out;
}
