import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaEmphasis, edgesInView, linkTarget, pairKey, primaryPath, relationsOf } from '../src/core/graph';
import { demo, vault } from './helpers';

// Tiny vault: two areas, sub-indexes, a MOC, source files (src-x, src-z). All links are relative to the document
const tiny = () => vault({
  r: ['CLAUDE.md', '[a1](a1.md) [a2](a2.md) [m](moc-m.md)'],
  a1: ['a1.md', '[s1](a1--s1.md)'],
  a2: ['a2.md', '[s2](a2--s2.md)'],
  s1: ['a1--s1.md', '[x](src-x/x.md) [y](src-x/y.md)'],
  s2: ['a2--s2.md', '[z](src-z/z.md) [other-area material](src-x/x.md)'],
  m: ['moc-m.md', '[x](src-x/x.md) [z](src-z/z.md)'],
  x: ['src-x/x.md', '[y](y.md)'],
  y: ['src-x/y.md', '[x](./x.md) parent [s1](../a1--s1.md)'],
  z: ['src-z/z.md', '']
});

test('relation kinds: keeps primary, cross-location index links and topic links per direction; edges merge to one per pair', () => {
  const { g, id } = tiny();
  assert.deepEqual(g.problems, []);
  const rel = (a: string, b: string) => g.relations.filter(r => r.source === id(a) && r.target === id(b)).map(r => r.kind);
  assert.deepEqual(rel('r', 'a1'), ['primary']);
  assert.deepEqual(rel('r', 'm'), ['topic'], 'router → MOC is on the topic axis');
  assert.deepEqual(rel('s1', 'x'), ['primary'], 'the index link that set the primary parent is a single primary relation');
  assert.deepEqual(rel('s2', 'x'), ['index'], 'linked by another area index');
  assert.deepEqual(rel('m', 'x'), ['topic']);
  assert.deepEqual(rel('x', 'y'), ['topic']);
  assert.deepEqual(rel('y', 'x'), ['topic'], 'the reverse link stays separate');
  assert.deepEqual(rel('y', 's1'), ['topic'], 'a material linking back to its parent index stays as a topic relation');
  assert.equal(g.relations.length, 14);
  // Edges (full view): one per pair. y–s1 merges into the primary edge and both kinds stay in its kind list
  assert.equal(g.edges.length, 12);
  assert.deepEqual(g.edgeByKey.get(pairKey(id('s1'), id('y')))?.kinds.sort(), ['primary', 'topic']);
  assert.equal(g.edgeByKey.get(pairKey(id('s1'), id('y')))?.kind, 'primary');
});

test('regression: when indexes A ↔ B in different areas link each other, both area filters highlight the other', () => {
  const { g, id } = vault({
    r: ['CLAUDE.md', '[a1](a1.md) [a2](a2.md)'],
    a1: ['a1.md', '[sa](a1--sa.md)'], a2: ['a2.md', '[sb](a2--sb.md)'],
    sa: ['a1--sa.md', '[sb](a2--sb.md)'],
    sb: ['a2--sb.md', '[sa](a1--sa.md)']
  });
  assert.ok(areaEmphasis(g, id('a1')).has(id('sb')), 'an a1 index links sb');
  assert.ok(areaEmphasis(g, id('a2')).has(id('sa')), 'an a2 index links sa');
  assert.equal(g.edges.filter(e => e.key === pairKey(id('sa'), id('sb'))).length, 1, 'one edge');
});

test('regression: with index A → material D (index link) and D → A (topic link), the relation shows in both views', () => {
  // The router links a2 first, so d's primary parent is sb (breadth-first, link order)
  const { g, id } = vault({
    r: ['CLAUDE.md', '[a2](a2.md) [a1](a1.md)'],
    a1: ['a1.md', '[sa](a1--sa.md)'], a2: ['a2.md', '[sb](a2--sb.md)'],
    sa: ['a1--sa.md', '[d](src-b/d.md)'],
    sb: ['a2--sb.md', '[d](src-b/d.md)'],
    d: ['src-b/d.md', 'Source: [sa](../a1--sa.md)']
  });
  assert.equal(g.byId.get(id('d'))!.parent, id('sb'));
  const key = pairKey(id('sa'), id('d'));
  assert.ok(edgesInView(g, 'structure').some(e => e.key === key), 'structure view');
  assert.ok(edgesInView(g, 'topic').some(e => e.key === key), 'topic view');
  const d = relationsOf(g, id('d'));
  assert.deepEqual(d.incoming.find(r => r.doc.id === id('sa'))?.kinds, ['index']);
  assert.deepEqual(d.outgoing.find(r => r.doc.id === id('sa'))?.kinds, ['topic']);
  assert.ok(areaEmphasis(g, id('a1')).has(id('d')));
});

test('area filter: highlights member documents and materials explicitly linked by the area indexes, not topic links alone', () => {
  const { g, id, names } = tiny();
  assert.deepEqual(names(areaEmphasis(g, id('a2'))), ['a2', 's2', 'x', 'z']);
  assert.deepEqual(names(areaEmphasis(g, id('a1'))), ['a1', 's1', 'x', 'y']);
  const d = demo();
  const personal = areaEmphasis(d.g, d.id('personal.md'));
  assert.ok(personal.has(d.id('src-work/content/style-guide.md')), 'work material linked by the personal records index');
  assert.ok(personal.has(d.id('src-work/operations/prompts/meeting-notes-summary-prompt.md')), 'work material linked by the personal learning index');
  assert.ok(!personal.has(d.id('src-work/content/calendar.md')), 'body links from personal materials (topic links) alone do not include it');
  assert.ok(!personal.has(d.id('moc-ai.md')) && !personal.has(d.g.routerId));
});

test('link views: structure keeps primary + index links; topic keeps only router → MOC, MOC → material and document-to-document links', () => {
  const { g } = demo();
  const structure = edgesInView(g, 'structure'), topic = edgesInView(g, 'topic');
  assert.ok(structure.length > 0 && topic.length > 0);
  assert.ok(structure.every(e => e.kind === 'primary' || e.kind === 'index'));
  assert.ok(topic.every(e => e.kind === 'topic'));
  assert.ok(topic.some(e => e.source === g.routerId && g.byId.get(e.target)?.kind === 'moc'));
  assert.ok(!structure.some(e => g.byId.get(e.target)?.kind === 'moc'));
  // A pair can appear in both views, so the union of pairs (not the count sum) equals the full view
  const union = new Set([...structure, ...topic].map(e => e.key));
  assert.deepEqual([...union].sort(), edgesInView(g, 'all').map(e => e.key).sort());
});

test('primary path and relations: the path follows index links to one route; detail panel incoming/outgoing are deduplicated with kinds', () => {
  const { g, id, name } = tiny();
  assert.deepEqual(primaryPath(g, id('x')).map(name), ['r', 'a1', 's1', 'x']);
  const label = (list: { doc: { id: string }; kind: string }[]) => list.map(r => `${name(r.doc.id)}:${r.kind}`).sort();
  const rel = relationsOf(g, id('x'));
  assert.deepEqual(label(rel.incoming), ['m:topic', 's1:primary', 's2:index', 'y:topic']);
  assert.deepEqual(label(rel.outgoing), ['y:topic']);
  assert.deepEqual(label(relationsOf(g, id('y')).outgoing), ['s1:topic', 'x:topic']);
  assert.deepEqual(label(relationsOf(g, id('s2')).outgoing), ['x:index', 'z:primary']);
});

test('body link navigation: detail panel hrefs resolve to the same node relative to the document', () => {
  const { g, id } = tiny();
  assert.equal(linkTarget(g, id('y'), './x.md'), id('x'));
  assert.equal(linkTarget(g, id('y'), '../a1--s1.md'), id('s1'));
  assert.equal(linkTarget(g, id('s2'), 'src-x/x.md#summary'), id('x'));
  assert.equal(linkTarget(g, id('y'), 'https://example.com'), null);
  assert.equal(linkTarget(g, id('y'), 'ghost.md'), null);
});
