import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGraph } from '../src/core/graph';
import { directions, layoutGraph } from '../src/core/layout3d';
import type { VaultFile } from '../src/core/vault';

test('unbalanced areas keep their base directions during layout, and primary parents and MOCs are preserved', () => {
  for (const areas of [1, 4, 7]) {
    const file = (path: string, kind: VaultFile['kind'], body: string): VaultFile => ({ path, kind, body, title: path, summary: '', updated: '' });
    const files = [file('router.md', 'router', Array.from({ length: areas }, (_, i) => `[area](a${i}.md)`).join('\n') + '\n[topic](moc.md)')];
    for (let i = 0; i < areas; i++) {
      const n = i === 0 ? 160 : 10;
      files.push(file(`a${i}.md`, 'area', (areas > 1 ? `[cross](a${(i + 1) % areas}.md)\n` : '') + Array.from({ length: n }, (_, j) => `[material](d${i}-${j}.md)`).join('\n')));
      for (let j = 0; j < n; j++) files.push(file(`d${i}-${j}.md`, 'material', ''));
    }
    files.push(file('moc.md', 'moc', '[shared](d0-0.md)\n[area](a0.md)'));
    const g = buildGraph({ label: 'Synthetic skew', synthetic: true, files });
    const before = JSON.stringify([g.docs, g.relations]);
    const a = layoutGraph(g), b = layoutGraph(g);
    assert.deepEqual(a, b);
    assert.deepEqual(a.get(g.routerId), [0, 0, 0]);
    for (const p of a.values()) assert.ok(p.every(Number.isFinite));
    const { anchors } = directions(g);
    for (const area of g.areas) {
      const p = a.get(area.id)!, d = anchors.get(area.id)!;
      const r = Math.hypot(...p);
      assert.ok(r > 0);
      assert.ok(p.reduce((sum, x, i) => sum + x * d[i], 0) / r > 0.999999);
    }
    const roots = g.areas.map(area => a.get(area.id)!);
    for (let i = 0; i < roots.length; i++) for (let j = 0; j < i; j++) {
      const cosine = roots[i].reduce((sum, x, k) => sum + x * roots[j][k], 0) / Math.hypot(...roots[i]) / Math.hypot(...roots[j]);
      assert.ok(cosine < Math.cos(Math.PI / 6));
    }
    const rms = Math.sqrt([...a.values()].reduce((sum, v) => sum + v.reduce((n, x) => n + x * x, 0), 0) / a.size);
    for (const root of roots) assert.ok(Math.hypot(...root) > rms * 0.35);
    assert.equal(JSON.stringify([g.docs, g.relations]), before);
    assert.equal(g.mocs.length, 1);
    assert.equal(g.mocs[0].parent, g.routerId);
  }
});
