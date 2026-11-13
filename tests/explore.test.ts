import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pairKey } from '../src/core/graph';
import { defaultExpanded, expandable, foldCounts, foldedVisible, revealPrimaryPath, shownEdges, toggleExpanded, visibleSet } from '../src/core/explore';
import { foldScale, labelText } from '../src/render/fold';
import type { ExploreState } from '../src/core/explore';
import { layoutGraph } from '../src/core/layout3d';
import type { EdgeView } from '../src/core/types';
import { demo, vault } from './helpers';

// x has primary parent s1 and is also linked by another area's index s2 and MOC m (shared source file). y belongs only to s1
const { g, id, names } = vault({
  r: ['CLAUDE.md', '[a1](a1.md) [a2](a2.md) [m](moc-m.md)'],
  a1: ['a1.md', '[s1](a1--s1.md)'], a2: ['a2.md', '[s2](a2--s2.md)'],
  s1: ['a1--s1.md', '[x](src-x/x.md) [y](src-x/y.md)'],
  s2: ['a2--s2.md', '[z](src-z/z.md) [x](src-x/x.md)'],
  m: ['moc-m.md', '[x](src-x/x.md)'],
  x: ['src-x/x.md', '[y](y.md)'], y: ['src-x/y.md', ''], z: ['src-z/z.md', '']
});
const state = (expanded: Set<string>, view: EdgeView = 'all', pinned: string | null = null): ExploreState => ({ expanded, view, pinned });
const keys = (s: ExploreState) => shownEdges(g, s, visibleSet(g, s)).map(e => e.key).sort();

test('initial state: everything expanded, the whole network is visible', () => {
  const s = state(defaultExpanded(g));
  assert.deepEqual(names(visibleSet(g, s)), ['a1', 'a2', 'm', 'r', 's1', 's2', 'x', 'y', 'z']);
  assert.equal(keys(s).length, g.edges.length);
});

test('per-path collapse: collapsing s1 keeps shared source x reached via other expanded paths (s2, m) and hides only lines leaving s1', () => {
  const s = state(toggleExpanded(defaultExpanded(g), id('s1')));
  const v = visibleSet(g, s);
  assert.ok(v.has(id('x')), 'shared source file stays');
  assert.ok(!v.has(id('y')), 'material only under s1 is hidden');
  const shown = keys(s);
  assert.ok(!shown.includes(pairKey(id('s1'), id('x'))), 'lines of the collapsed path are hidden');
  assert.ok(shown.includes(pairKey(id('s2'), id('x'))) && shown.includes(pairKey(id('m'), id('x'))), 'lines of other paths stay');
  assert.ok(shown.includes(pairKey(id('a1'), id('s1'))), 'the line to the collapsed document itself stays');
});

test('collapsing every path hides the shared source too, but a selected material stays until deselected', () => {
  let expanded = defaultExpanded(g);
  for (const n of ['s1', 's2', 'm']) expanded = toggleExpanded(expanded, id(n));
  assert.ok(!visibleSet(g, state(expanded)).has(id('x')));
  assert.ok(visibleSet(g, state(expanded, 'all', id('x'))).has(id('x')), 'selection pinned');
});

test('a search pick expands only the primary path (paths via other MOCs or indexes stay closed)', () => {
  const opened = revealPrimaryPath(g, new Set<string>(), id('x'));
  assert.deepEqual(names(opened), ['a1', 's1']);
  assert.ok(visibleSet(g, state(opened)).has(id('x')));
  assert.ok(!opened.has(id('m')) && !opened.has(id('s2')));
});

test('the path axis follows the link view: topic view is router → MOC → material; structure view skips MOCs', () => {
  const all = defaultExpanded(g);
  assert.deepEqual(names(visibleSet(g, state(all, 'topic'))), ['m', 'r', 'x']);
  const structure = visibleSet(g, state(all, 'structure'));
  assert.ok(!structure.has(id('m')) && structure.has(id('x')) && structure.has(id('z')));
});

test('fixed positions: the 3D layout is the same for the same data, independent of expand and view, with shared sources on their primary area side', () => {
  const d = demo(), again = demo();
  const a = layoutGraph(d.g, 120), b = layoutGraph(again.g, 120);
  assert.equal(a.size, d.g.docs.length);
  for (const [key, p] of a) {
    assert.ok(p.every(Number.isFinite), key);
    assert.deepEqual(b.get(key), p);
  }
  assert.deepEqual(a.get(d.g.routerId), [0, 0, 0]);
  const shared = d.id('src-work/operations/prompts/meeting-notes-summary-prompt.md');
  const centroid = (area: string) => {
    const pts = d.g.docs.filter(x => d.g.areaOf.get(x.id) === area && x.id !== shared).map(x => a.get(x.id)!);
    return [0, 1, 2].map(i => pts.reduce((s, p) => s + p[i], 0) / pts.length);
  };
  const dist = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const work = d.id('work.md'), personal = d.id('personal.md');
  assert.ok(dist(a.get(shared)!, centroid(work)) < dist(a.get(shared)!, centroid(personal)), 'placed on the work side');
  // Work and personal areas gather on opposite sides (left/right hemispheres)
  assert.ok(centroid(work)[0] < 0 && centroid(personal)[0] > 0);
});

test('regression: when material d links back to its primary index s and an open MOC links d, collapsing s keeps d via the MOC path and the s–d line as a topic link only', () => {
  const h = vault({
    r: ['CLAUDE.md', '[a](a.md) [m](moc-m.md)'], a: ['a.md', '[s](a--s.md)'], s: ['a--s.md', '[d](src-a/d.md)'],
    m: ['moc-m.md', '[d](src-a/d.md)'], d: ['src-a/d.md', 'Source: [s](../a--s.md)']
  });
  const st = state(toggleExpanded(defaultExpanded(h.g), h.id('s')));
  const v = visibleSet(h.g, st);
  assert.ok(v.has(h.id('d')), 'visible via the MOC path');
  const edge = shownEdges(h.g, st, v).find(e => e.key === pairKey(h.id('s'), h.id('d')));
  assert.ok(edge, 'the topic link line stays');
  assert.deepEqual(edge.kinds, ['topic'], 'the collapsed primary relation drops out');
  assert.equal(edge.kind, 'topic');
  // In the structure view the topic link is out of view and the primary is collapsed, so there's no line
  const sv = state(toggleExpanded(defaultExpanded(h.g), h.id('s')), 'structure', h.id('d'));
  assert.ok(!shownEdges(h.g, sv, visibleSet(h.g, sv)).some(e => e.key === pairKey(h.id('s'), h.id('d'))));
});

test('cluster mode (workspace mode) starts with only area indexes expanded; the default (indexed mode, demo) expands all', () => {
  assert.deepEqual(defaultExpanded(g), expandable(g));
  const start = defaultExpanded(g, true);
  assert.deepEqual(names(start), ['a1', 'a2']);
  assert.deepEqual(names(visibleSet(g, state(start))), ['a1', 'a2', 'm', 'r', 's1', 's2'], 'only sub-indexes and MOCs under the areas are visible');
});

test('collapsed counts: areas count all primary descendants, MOCs their direct topic links. Only visible collapsed nodes become clusters', () => {
  const counts = foldCounts(g);
  assert.equal(counts.get(id('a1')), 3, 'a1 → s1 → x · y');
  assert.equal(counts.get(id('s1')), 2);
  assert.equal(counts.get(id('m')), 1, 'a MOC counts links even without primary children');
  const s = state(new Set([id('a1')]));
  const folded = foldedVisible(visibleSet(g, s), s.expanded, counts);
  assert.deepEqual(names(new Set(folded.keys())), ['a2', 'm', 's1'], 'expanded a1 and hidden s2 are excluded');
});

test('cluster size and label: grows with child count up to a cap, and the label gets +count', () => {
  assert.ok(foldScale(10) > 1 && foldScale(1000) > foldScale(10));
  assert.equal(foldScale(1e9), 2.4);
  assert.equal(labelText('Work index', 1240), 'Work index +1,240');
  assert.equal(labelText('Work index', undefined), 'Work index');
});
