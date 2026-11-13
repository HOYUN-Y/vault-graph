import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatOfPath, kindOfPath, opaqueId } from '../src/core/vault';
import { DEMO_PRIMARY, demoDataset } from '../src/data/demo';
import { demo, vault } from './helpers';

test('path rules: top-level CLAUDE.md, area.md, area--topic.md, moc-topic.md, project-name.md; anything else (src-* etc.) is a material', () => {
  const cases: [string, string][] = [
    ['CLAUDE.md', 'router'], ['work.md', 'area'], ['personal--portfolio.md', 'subindex'], ['work--a--b.md', 'subindex'],
    ['moc-deploy.md', 'moc'], ['moc-deploy--ops.md', 'moc'], ['project-nova.md', 'guide'],
    ['src-work/work.md', 'material'], ['src-work/CLAUDE.md', 'material'], ['src-work/moc-x.md', 'material'], ['board.png', 'material']
  ];
  for (const [path, kind] of cases) assert.equal(kindOfPath(path), kind, path);
  assert.equal(formatOfPath('src-work/a.PDF'), 'pdf');
  assert.equal(formatOfPath('src-work/a.jpeg'), 'image');
  assert.equal(formatOfPath('src-work/a.key'), null);
});

test('unique ID: deterministic from the canonical path and does not reveal the path string', () => {
  const id = opaqueId('src-work/operations/minutes.md');
  assert.equal(id, opaqueId('src-work/operations/minutes.md'));
  assert.notEqual(id, opaqueId('src-personal/operations/minutes.md'));
  assert.match(id, /^d[0-9a-z]+$/);
});

test('shared source file: one node even when an area index, another area index and a MOC link it in different forms (encoding, angle brackets, NFD, relative path)', () => {
  const name = '회의록 요약.md'; // Korean on purpose: tests percent-encoding and NFD
  const v = vault({
    r: ['CLAUDE.md', '[Work](work.md) [Personal](personal.md) [AI](moc-AI.md)'],
    work: ['work.md', '[Ops](work--ops.md)'],
    personal: ['personal.md', '[Learning](personal--learn.md)'],
    ops: ['work--ops.md', `[Minutes](src-work/ops/${encodeURIComponent('회의록 요약')}.md)`],
    learn: ['personal--learn.md', `[See also](<src-work/ops/${name}>) [Note](src-personal/learn/note.md)`],
    ai: ['moc-AI.md', `[Prompt](src-work/ops/${name.normalize('NFD').replace(/ /g, '%20')}#rules)`],
    note: ['src-personal/learn/note.md', `[Work side](../../src-work/ops/${name.replace(/ /g, '%20')})`],
    shared: [`src-work/ops/${name}`, '']
  });
  assert.deepEqual(v.g.problems, []);
  assert.equal(v.g.docs.length, 8);
  assert.deepEqual(v.names(v.g.inLinks.get(v.id('shared'))!), ['ai', 'learn', 'note', 'ops']);
  // Primary parent is the first index reached on the area axis; the rest are index and topic links
  assert.equal(v.name(v.g.byId.get(v.id('shared'))!.parent!), 'ops');
  const kinds = v.g.relations.filter(r => r.target === v.id('shared')).map(r => `${v.name(r.source)}:${r.kind}`).sort();
  assert.deepEqual(kinds, ['ai:topic', 'learn:index', 'note:topic', 'ops:primary']);
});

test('same name, different path: same title or file name but different paths are separate nodes, and links pick each by path', () => {
  const v = vault({
    r: ['CLAUDE.md', '[Work](work.md) [Personal](personal.md)'],
    work: ['work.md', '[Review](src-work/weekly-review.md)'],
    personal: ['personal.md', '[Review](src-personal/journal/weekly-review.md)'],
    a: ['src-work/weekly-review.md', '[Personal review](../src-personal/journal/weekly-review.md)'],
    b: ['src-personal/journal/weekly-review.md', '']
  });
  assert.deepEqual(v.g.problems, []);
  assert.notEqual(v.id('a'), v.id('b'));
  assert.equal(v.name(v.g.byId.get(v.id('a'))!.parent!), 'work');
  assert.equal(v.name(v.g.byId.get(v.id('b'))!.parent!), 'personal');
  assert.deepEqual(v.names(v.g.outLinks.get(v.id('a'))!), ['b']);
});

test('classification follows index links, not disk folders: source location is irrelevant and the router project table stays as shortcuts', () => {
  const v = vault({
    r: ['CLAUDE.md', '## Areas\n[Work](work.md)\n## Projects\n[Nova](project-nova.md) [Solo](project-solo.md)\n## Topics\n[Planning](moc-plan.md)'],
    work: ['work.md', '[Projects](work--projects.md)'],
    projects: ['work--projects.md', '[Nova](project-nova.md)'],
    nova: ['project-nova.md', '[Brief](src-personal/far/away/brief.md)'],
    solo: ['project-solo.md', '[Memo](src-work/solo.md)'],
    plan: ['moc-plan.md', '[Brief](src-personal/far/away/brief.md) [Idea](src-work/idea.md)'],
    brief: ['src-personal/far/away/brief.md', ''],
    memo: ['src-work/solo.md', ''],
    idea: ['src-work/idea.md', '']
  });
  assert.deepEqual(v.g.problems, []);
  const parent = (n: string) => v.name(v.g.byId.get(v.id(n))!.parent ?? 'none');
  assert.equal(parent('nova'), 'projects', 'a project guide linked from an area index belongs to that area');
  assert.equal(parent('brief'), 'nova', 'the work guide claims it even though it sits in src-personal');
  assert.equal(v.g.areaOf.get(v.id('brief')), v.id('work'));
  assert.equal(parent('solo'), 'r', 'only project guides no area index links go under the router');
  assert.equal(parent('idea'), 'plan', 'a material linked only from a MOC goes under that MOC (topic axis)');
  assert.deepEqual(v.g.relations.filter(r => r.source === v.id('r') && r.target === v.id('nova')).map(r => r.kind), ['index']);
});

test('structural problems: duplicate paths, broken links, links outside the vault, unreachable documents, router count; folder links become source roots, not nodes', () => {
  const v = vault({
    r: ['CLAUDE.md', '[Work](work.md) [Missing](ghost.md) [Outside](../outside.md)\n| [src-work](src-work) | virtual | Work |\n[Subfolder](src-work/ops)'],
    work: ['work.md', '[Material](src-work/ops/a.md)'],
    dup: ['src-work/ops/./a.md', ''],
    a: ['src-work/ops/a.md', ''],
    lost: ['src-work/lost.md', ''],
    r2: ['src-x/../CLAUDE.md', '']
  });
  const text = v.g.problems.join('\n');
  for (const word of ['Duplicate source path: src-work/ops/a.md', 'Broken link: CLAUDE.md → ghost.md', 'Broken link (outside vault)', 'not reachable from the router via index links: src-work/lost.md'])
    assert.ok(text.includes(word), word);
  assert.deepEqual(v.g.sourceRoots, ['src-work'], 'only top-level src-* folders are source roots');
  assert.equal(v.g.docs.length, 4, 'after normalization the same path (./, ..) appears once: router, area, material, unreachable document');
  const none = vault({ w: ['work.md', ''] });
  assert.ok(none.g.problems.some(p => p.includes('exactly one router')));
});

test('demo vault: follows the skill layout (top-level guide documents, src-* source files, relative links) and link-derived classification matches the authored one', () => {
  const { g, id } = demo();
  assert.deepEqual(g.problems, []);
  assert.deepEqual(g.sourceRoots, ['src-work', 'src-personal', 'src-research']);
  for (const d of g.docs) {
    if (d.kind === 'material') assert.match(d.path, /^src-(work|personal|research)\//, d.path);
    else assert.ok(!d.path.includes('/'), `guide documents are top-level: ${d.path}`);
    assert.equal(d.parent ? g.byId.get(d.parent)!.path : null, DEMO_PRIMARY.get(d.path), d.path);
  }
  for (const f of demoDataset.files) assert.ok(!f.body.includes('[['), `no demo-only [[id]] syntax: ${f.path}`);
  assert.equal(g.byId.get(id('project-nova.md'))!.kind, 'guide');
  // One shared source file is linked from an area index, another area index and a MOC (one node)
  const sources = (docId: string) => (g.inLinks.get(docId) ?? []).map(s => g.byId.get(s)!);
  const shared = g.docs.find(d => d.kind === 'material' && sources(d.id).some(s => s.kind === 'moc')
    && ['work--operations.md', 'personal--learning.md'].every(p => sources(d.id).some(s => s.path === p)));
  assert.ok(shared, 'a material shared by two area indexes and a MOC');
});
