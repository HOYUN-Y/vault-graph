import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGraph } from '../src/core/graph';
import { radialLayout, wedgeWidth } from '../src/core/layout2d';
import { demoDataset } from '../src/data/demo';

test('temporary 2D layout: every document gets one spot, same data gives same spots, and spots never overlap', () => {
  const g = buildGraph(demoDataset);
  const a = radialLayout(g), b = radialLayout(buildGraph(demoDataset));
  assert.equal(a.size, g.docs.length);
  for (const [id, p] of a) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), id);
    assert.ok(Math.hypot(p.x, p.y) <= 1.11, id);
    assert.deepEqual(b.get(id), p);
  }
  const pts = [...a.values()];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > 0.01);
});

test('temporary 2D layout: materials stay inside their primary area wedge — including shared materials linked by other area indexes or MOCs', () => {
  const g = buildGraph(demoDataset);
  const pos = radialLayout(g);
  const n = g.areas.length;
  const half = wedgeWidth(n) / 2 + 1e-9;
  const gap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const [first] = g.areas;
  assert.ok(pos.get(first.id)!.x < 0, 'first area on the left');
  // Center of area i's wedge = 180° + 360°/n × i (the area node sits at its children's middle angle, which may differ)
  const wedgeOf = (id: string) => g.areas.findIndex((_, i) => gap(pos.get(id)!.angle, (180 + (360 / n) * i) * (Math.PI / 180)) <= half);
  for (const d of g.docs) {
    const area = g.areaOf.get(d.id);
    if (area && d.id !== area) assert.equal(wedgeOf(d.id), g.areas.findIndex(a => a.id === area), d.path);
  }
  assert.equal(wedgeOf(g.idOfPath.get('src-work/operations/prompts/meeting-notes-summary-prompt.md')!), wedgeOf(g.idOfPath.get('work.md')!));
});
