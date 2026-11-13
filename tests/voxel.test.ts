import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGraph } from '../src/core/graph';
import { layoutGraph } from '../src/core/layout3d';
import { syntheticDataset } from '../src/data/synthetic';
import { demoDataset } from '../src/data/demo';
import { CELL, SHAPE_CELLS, assembly, snapToGrid } from '../src/render/voxel';
import { fitDistance } from '../src/render/fit';
import { voxelFaces } from '../src/ui/voxel-faces';
import type { NodeKind } from '../src/core/types';

const KINDS: NodeKind[] = ['router', 'area', 'subindex', 'guide', 'moc', 'material'];

test('voxel assembly: piece count and shape differ per kind (same cells as the legend), and only files without a body are hollow', () => {
  const counts = KINDS.map(k => assembly(k).pieces.length);
  assert.deepEqual(counts, [31, 8, 4, 6, 7, 1]);
  assert.equal(new Set(KINDS.map(k => JSON.stringify(SHAPE_CELLS[k]))).size, KINDS.length);
  for (const k of KINDS) {
    const a = assembly(k);
    assert.equal(a.hollow, false, k);
    assert.ok(a.half > 0 && a.half < CELL * 4, `${k}: half width ${a.half}`);
    // The legend icon shows three faces per cell
    assert.equal(voxelFaces(k).length, SHAPE_CELLS[k].length * 3, k);
  }
  assert.equal(assembly('material', 'pdf').hollow, true);
  assert.equal(assembly('material', 'image').hollow, true);
  // Guide documents are larger than materials
  for (const k of KINDS.filter(k => k !== 'material')) assert.ok(assembly(k).half > assembly('material').half, k);
});

test('voxel grid: every node of the 5,000 demo gets its own cell, nearly all move less than two cells from the layout, and it is deterministic', () => {
  const g = buildGraph(demoDataset);
  const pos = layoutGraph(g);
  const nodes = g.docs.map(d => ({ kind: d.kind, pos: pos.get(d.id)! }));
  const a = snapToGrid(nodes), b = snapToGrid(nodes);
  assert.deepEqual(a, b);
  assert.equal(a.length, 5000);
  assert.equal(new Set(a.map(p => p.map(v => Math.round(v / CELL)).join())).size, 5000);
  let far = 0;
  for (let i = 0; i < a.length; i++) {
    for (const v of a[i]) assert.ok(Math.abs(v / CELL - Math.round(v / CELL)) < 1e-6, 'on the grid');
    const moved = Math.hypot(a[i][0] - nodes[i].pos[0], a[i][1] - nodes[i].pos[1], a[i][2] - nodes[i].pos[2]);
    assert.ok(moved < CELL * 3.5, `${g.docs[i].path}: ${moved}`);
    if (moved >= CELL * 2) far++;
  }
  // In the 5× denser clusters only a few nodes move a bit further to find a free cell (0.1% or less)
  assert.ok(far <= a.length * 0.001, `nodes moved more than two cells: ${far}`);
  // Piece count differs from node count (counts are per node = document)
  const pieces = g.docs.reduce((t, d) => t + assembly(d.kind, d.format).pieces.length, 0);
  assert.ok(pieces > g.docs.length);
});

test('dimensions: material cubes are 15–20% smaller than before (0.018), neighbor spacing within an index (grid cell) is 10–15% wider than before (0.024) — guide document assemblies unchanged', () => {
  const cube = assembly('material').pieces[0].size;
  assert.ok(cube / 0.018 >= 0.8 && cube / 0.018 <= 0.85, `cube ${cube}`);
  assert.ok(CELL / 0.024 >= 1.1 && CELL / 0.024 <= 1.15, `cell ${CELL}`);
  assert.equal(assembly('subindex').pieces[0].size, 0.016 * 0.88);
  assert.equal(assembly('area').pieces[0].size, 0.023 * 0.9);
  // In the real layout, the median nearest-neighbor distance between materials of one index = one cell (1.125× the old 0.024)
  const g = buildGraph(demoDataset);
  const pos = layoutGraph(g);
  const snapped = snapToGrid(g.docs.map(d => ({ kind: d.kind, pos: pos.get(d.id)! })));
  const at = new Map(g.docs.map((d, i) => [d.id, snapped[i]]));
  const nn: number[] = [];
  for (const kids of g.children.values()) {
    const mats = kids.filter(k => k.kind === 'material').map(k => at.get(k.id)!);
    for (const p of mats) {
      let best = Infinity;
      for (const q of mats) if (q !== p) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      if (Number.isFinite(best)) nn.push(best);
    }
  }
  nn.sort((x, y) => x - y);
  const median = nn[Math.floor(nn.length / 2)];
  assert.ok(median >= 0.024 * 1.1 && median <= 0.024 * 1.15, `neighbor spacing ${median}`);
  // The gap between cubes (spacing − cube) is close to double the old one (0.024 − 0.018 = 0.006)
  assert.ok(median - cube >= 0.006 * 1.8, `gap ${median - cube}`);
});

test('voxel grid: no other node enters the space around a guide document assembly (no piece overlap) — even with 3,000 synthetic nodes', () => {
  for (const ds of [demoDataset, syntheticDataset(3000)]) {
    const g = buildGraph(ds);
    const pos = layoutGraph(g, 60);
    const nodes = g.docs.map(d => ({ kind: d.kind, pos: pos.get(d.id)! }));
    const snapped = snapToGrid(nodes);
    const hubs = g.docs.map((d, i) => ({ d, i })).filter(x => x.d.kind !== 'material');
    for (const { d, i } of hubs) {
      const reach = assembly(d.kind).half;
      for (let j = 0; j < snapped.length; j++) {
        if (j === i) continue;
        const gap = Math.max(...[0, 1, 2].map(k => Math.abs(snapped[i][k] - snapped[j][k])));
        assert.ok(gap + 1e-9 >= Math.min(reach + assembly(g.docs[j].kind).half, CELL), `${d.path} ↔ ${g.docs[j].path}`);
      }
    }
  }
});

test('fit distance: the 5,000 demo stays inside the safe area (minus top bar, legend and toolbar) at every rotation angle, without being farther than needed', () => {
  const g = buildGraph(demoDataset);
  const pos = layoutGraph(g);
  const points = snapToGrid(g.docs.map(d => ({ kind: d.kind, pos: pos.get(d.id)! })));
  const halves = g.docs.map(d => assembly(d.kind, d.format).half);
  const dir: [number, number, number] = [0.12, 0.42, 1];
  const vfov = (40 * Math.PI) / 180;
  // Test projection (camera matrix computed directly, independent of the implementation)
  const worst = (w: number, h: number, ins: { top: number; right: number; bottom: number; left: number }, d: number) => {
    const L = Math.hypot(...dir), c = dir.map(v => (v / L) * d);
    const fz = c.map(v => v / d), rx = [fz[2], 0, -fz[0]].map((v, _, a) => v / Math.hypot(a[0], a[2]));
    const uy = [fz[1] * rx[2] - fz[2] * rx[1], fz[2] * rx[0] - fz[0] * rx[2], fz[0] * rx[1] - fz[1] * rx[0]];
    const f = 1 / Math.tan(vfov / 2);
    let out = 0;
    for (let k = 0; k < 997; k++) {
      const a = (k / 997) * Math.PI * 2;
      for (let i = 0; i < points.length; i++) {
        const [x, y, z] = points[i];
        const p = [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)].map((v, j) => v - c[j]);
        const depth = -(p[0] * fz[0] + p[1] * fz[1] + p[2] * fz[2]);
        const sx = ((p[0] * rx[0] + p[1] * rx[1] + p[2] * rx[2]) * f) / (depth * (w / h));
        const sy = ((p[0] * uy[0] + p[1] * uy[1] + p[2] * uy[2]) * f) / depth;
        // Offset: the safe-area center is the projection center → screen px
        const px = (ins.left + (w - ins.left - ins.right) / 2) + sx * (w / 2);
        const py = (ins.top + (h - ins.top - ins.bottom) / 2) - sy * (h / 2);
        if (px < ins.left || px > w - ins.right || py < ins.top || py > h - ins.bottom) out++;
      }
    }
    return out;
  };
  for (const [w, h, ins] of [
    [1440, 900, { top: 79, right: 24, bottom: 64, left: 332 }],
    [1920, 1080, { top: 79, right: 24, bottom: 64, left: 332 }],
    [360, 740, { top: 120, right: 0, bottom: 64, left: 0 }],
    [844, 390, { top: 79, right: 0, bottom: 64, left: 0 }]
  ] as const) {
    const d = fitDistance({ points, halves, dir, vfov, width: w, height: h, insets: ins });
    assert.equal(worst(w, h, ins, d), 0, `${w}×${h}: node centers off screen`);
    assert.ok(worst(w, h, ins, d * 0.85) > 0, `${w}×${h}: too far (${d.toFixed(2)})`);
  }
});

test('fit distance: with the portrait phone control bar (bottom-right corner), node assemblies never touch the bar through a full turn, and stay inside the safe area with the projection center raised', () => {
  const g = buildGraph(demoDataset);
  const pos = layoutGraph(g);
  const points = snapToGrid(g.docs.map(d => ({ kind: d.kind, pos: pos.get(d.id)! })));
  const halves = g.docs.map(d => assembly(d.kind, d.format).half);
  const dir: [number, number, number] = [0.12, 0.42, 1];
  const vfov = (40 * Math.PI) / 180;
  const [w, h] = [360, 740];
  const ins = { top: 120, right: 0, bottom: 64, left: 0 };
  const corner = { w: 58, h: 287 }; // bar 46×275 + 12px right and bottom
  const base = { x: (ins.right - ins.left) / 2, y: (ins.bottom - ins.top) / 2 };
  // Test projection (camera matrix computed directly, independent of the implementation). Node assemblies are treated as circles of half width × 1.4 on screen
  const check = (d: number, lift: number) => {
    const L = Math.hypot(...dir), c = dir.map(v => (v / L) * d);
    const fz = c.map(v => v / d), rx = [fz[2], 0, -fz[0]].map((v, _, a) => v / Math.hypot(a[0], a[2]));
    const uy = [fz[1] * rx[2] - fz[2] * rx[1], fz[2] * rx[0] - fz[0] * rx[2], fz[0] * rx[1] - fz[1] * rx[0]];
    const f = 1 / Math.tan(vfov / 2);
    const cx0 = w / 2 - base.x, cy0 = h / 2 - (base.y + lift);
    let inDock = 0, out = 0;
    for (let k = 0; k < 997; k++) {
      const a = (k / 997) * Math.PI * 2;
      for (let i = 0; i < points.length; i++) {
        const [x, y, z] = points[i];
        const p = [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)].map((v, j) => v - c[j]);
        const depth = -(p[0] * fz[0] + p[1] * fz[1] + p[2] * fz[2]);
        const px = cx0 + (((p[0] * rx[0] + p[1] * rx[1] + p[2] * rx[2]) * f) / (depth * (w / h))) * (w / 2);
        const py = cy0 - (((p[0] * uy[0] + p[1] * uy[1] + p[2] * uy[2]) * f) / depth) * (h / 2);
        const rpx = (halves[i] * 1.4 * f / depth) * (h / 2);
        if (px + rpx > w - corner.w && py + rpx > h - corner.h) inDock++;
        if (px < ins.left || px > w - ins.right || py < ins.top || py > h - ins.bottom) out++;
      }
    }
    return { inDock, out };
  };
  const plain = fitDistance({ points, halves, dir, vfov, width: w, height: h, insets: ins });
  // Without excluding the bar (old behavior) some angles put nodes under it
  assert.ok(check(plain, 0).inDock > 0, 'no node under the bar at the distance ignoring the bar (test premise check)');
  for (const lift of [0, 48]) {
    const d = fitDistance({ points, halves, dir, vfov, width: w, height: h, insets: { ...ins, top: ins.top + lift, bottom: ins.bottom + lift }, corner, offset: { x: base.x, y: base.y + lift } });
    const r = check(d, lift);
    assert.equal(r.inDock, 0, `center raised ${lift}px: node assemblies under the bar`);
    assert.equal(r.out, 0, `center raised ${lift}px: node centers outside the safe area`);
    assert.ok(d >= plain - 1e-9, 'excluding the bar gives the same or a larger distance');
  }
});
