import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaEmphasis, linkTarget, pairKey, primaryPath } from '../src/core/graph';
import { parseLinks, resolveHref } from '../src/core/markdown';
import { INDEX_KINDS } from '../src/core/types';
import { searchDocs } from '../src/core/search';
import { DEMO_CORE_COUNT, DEMO_DOC_COUNT, demoCoreFiles, demoDataset } from '../src/data/demo';
import { demo } from './helpers';

const { g, id } = demo();
const SHARED = 'src-work/operations/prompts/meeting-notes-summary-prompt.md';

test('demo data: labeled as synthetic, with no structural problems (duplicate paths, broken links, unreachable documents)', () => {
  assert.equal(demoDataset.synthetic, true);
  assert.match(demoDataset.label, /demo/i);
  assert.deepEqual(g.problems, []);
  assert.equal(new Set(demoDataset.files.map(f => f.path)).size, demoDataset.files.length);
  assert.equal(g.docs.length, demoDataset.files.length);
  assert.equal(g.docs.filter(d => d.kind === 'router').length, 1);
  assert.equal(g.byId.get(g.routerId)?.path, 'CLAUDE.md');
});

test('demo data: has both navigation axes (area index · sub-index · material / topic MOC · related materials)', () => {
  const kinds = new Set(g.docs.map(d => d.kind));
  for (const kind of ['router', 'area', 'subindex', 'guide', 'moc', 'material'] as const) assert.ok(kinds.has(kind), kind);
  assert.ok(g.areas.length >= 2, 'at least two areas');
  for (const moc of g.mocs) assert.ok((g.outLinks.get(moc.id) ?? []).length > 0, `${moc.id}: no related materials`);
  // every material is classified under some area (fixed primary classification)
  for (const d of g.docs.filter(x => x.kind === 'material')) assert.ok(g.areaOf.get(d.id), `${d.id}: no area`);
});

test('bodies and edges agree: every edge comes from a [name](relative path) link in one of the two bodies (not from disk folders)', () => {
  const writes = (a: string, b: string) => parseLinks(g.byId.get(a)!.body).some(l => linkTarget(g, a, l.href) === b);
  for (const e of g.edges) assert.ok(writes(e.source, e.target) || writes(e.target, e.source), `${e.key}: edge without a source link`);
  // every link between documents becomes an edge (external URLs and folder links are not nodes)
  for (const d of g.docs) {
    for (const link of parseLinks(d.body)) {
      const t = linkTarget(g, d.id, link.href);
      if (t) { if (t !== d.id) assert.ok(g.edgeByKey.has(pairKey(d.id, t)), `${d.path} → ${link.href}: missing edge`); }
      else {
        const folder = resolveHref(d.path, link.href);
        assert.ok(folder.type === 'path' && /^src-[^/]+$/.test(folder.path), `${d.path} → ${link.href}: only source root folder links may resolve to no node`);
      }
    }
  }
});

test('shared source file: when indexes in two areas and one MOC link the same source file, it is one node with one fixed classification path', () => {
  const shared = g.docs.filter(d => {
    if (d.kind !== 'material') return false;
    const sources = [d.parent!, ...(g.inLinks.get(d.id) ?? [])].map(id => g.byId.get(id)!);
    const indexAreas = new Set(sources.filter(s => INDEX_KINDS.has(s.kind)).map(s => g.areaOf.get(s.id)).filter(Boolean));
    return indexAreas.size >= 2 && sources.some(s => s.kind === 'moc');
  });
  assert.ok(shared.length >= 1, 'no material for this scenario');
  const doc = shared.find(d => d.path === SHARED);
  assert.ok(doc, 'the meeting notes summary prompt must be part of the scenario');
  assert.equal(demoDataset.files.filter(f => f.path === SHARED).length, 1);
  const path = (x: string) => g.byId.get(x)!.path;
  const kinds = g.edges.filter(e => e.source === doc.id || e.target === doc.id).map(e => `${e.kind}:${path(e.source === doc.id ? e.target : e.source)}`);
  assert.ok(kinds.includes('primary:work--operations.md'), 'primary classification (Work · Operations)');
  assert.ok(kinds.includes('index:personal--learning.md'), 'index link from another area (Personal · Learning)');
  assert.ok(kinds.includes('topic:moc-ai.md'), 'topic link from the AI in practice MOC');
  assert.equal(g.areaOf.get(doc.id), id('work.md'));
  assert.deepEqual(primaryPath(g, doc.id).map(path), ['CLAUDE.md', 'work.md', 'work--operations.md', SHARED]);
  // also emphasized under the personal area filter (that area's index links it explicitly), but its classified area does not change
  assert.ok(areaEmphasis(g, id('personal.md')).has(doc.id));
});

test('same-title materials: materials sharing a title are separate nodes told apart by path, and both appear in search results', () => {
  const byTitle = new Map<string, string[]>();
  for (const d of g.docs) byTitle.set(d.title, [...(byTitle.get(d.title) ?? []), d.id]);
  const twins = [...byTitle.values()].filter(ids => ids.length > 1);
  assert.ok(twins.length >= 1, 'no same-title scenario');
  for (const ids of twins) {
    const paths = ids.map(id => g.byId.get(id)!.path);
    assert.equal(new Set(paths).size, ids.length);
    const found = searchDocs(g.docs, g.byId.get(ids[0])!.title).hits.filter(h => ids.includes(h.doc.id));
    assert.equal(found.length, ids.length);
  }
});

test('formats: PDFs and images whose contents cannot be shown have only a description, while Markdown materials have a description and a body', () => {
  for (const d of g.docs) {
    assert.ok(d.summary.trim(), `${d.id}: no description`);
    if (d.format === 'md') assert.ok(d.body.trim(), `${d.id}: no body`);
    else assert.equal(d.body, '', `${d.id}: non-text format has a body`);
  }
  assert.ok(g.docs.some(d => d.format !== 'md'), 'no non-text format example');
});

test('showcase demo size: exactly 5,000 fictional documents clustered into four areas, many MOCs, sub-indexes, and project guides', () => {
  assert.equal(DEMO_DOC_COUNT, 5000);
  assert.equal(demoDataset.files.length, 5000);
  assert.equal(g.docs.length, 5000);
  const count = (kind: string) => g.docs.filter(d => d.kind === kind).length;
  assert.equal(g.areas.length, 4);
  assert.ok(g.mocs.length >= 14, 'at least 14 MOCs');
  assert.ok(count('subindex') >= 80, 'at least 80 sub-indexes');
  assert.ok(count('guide') >= 20, 'at least 20 project guides');
  for (const area of g.areas) assert.ok(g.docs.filter(d => g.areaOf.get(d.id) === area.id).length >= 500, `${area.path}: at least 500 documents`);
  // no single index is overloaded: at most 90 primary children per index
  for (const d of g.docs) assert.ok((g.children.get(d.id) ?? []).length <= 90, `${d.path}: ${(g.children.get(d.id) ?? []).length} children`);
  // guide document levels: router → area → sub-index → nested sub-index · guide → material (depth up to 5)
  assert.ok(Math.max(...g.docs.map(d => g.depth.get(d.id) ?? 0)) >= 5);
  // each MOC links materials from two or more areas (cross-links)
  for (const moc of g.mocs) {
    const areas = new Set((g.outLinks.get(moc.id) ?? []).map(t => g.areaOf.get(t)).filter(Boolean));
    assert.ok(areas.size >= 2, `${moc.path}: links materials from only one area`);
  }
  // body links between materials (previous entry in a series · related materials in other areas) outnumber the documents
  assert.ok(g.relations.length > 2 * g.docs.length, `relations ${g.relations.length}`);
});

test('showcase demo expansion: the original 1,000 keep their paths, titles, and material bodies, and every original index line remains. New material titles do not overlap', () => {
  const core = demoCoreFiles();
  assert.equal(core.length, DEMO_CORE_COUNT);
  const byPath = new Map(demoDataset.files.map(f => [f.path, f]));
  for (const f of core) {
    const now = byPath.get(f.path);
    assert.ok(now, f.path);
    assert.equal(now.title, f.title, f.path);
    assert.equal(now.summary, f.summary, f.path);
    if (f.path.includes('/')) assert.equal(now.body, f.body, `${f.path}: material body preserved`);
    else { const lines = new Set(now.body.split('\n')); for (const line of f.body.split('\n')) assert.ok(lines.has(line), `${f.path}: index line preserved — ${line.slice(0, 40)}`); }
  }
  const corePaths = new Set(core.map(f => f.path)), coreTitles = new Set(core.map(f => f.title));
  const added = demoDataset.files.filter(f => !corePaths.has(f.path));
  assert.equal(added.length, DEMO_DOC_COUNT - DEMO_CORE_COUNT);
  const titles = added.map(f => f.title);
  assert.equal(new Set(titles).size, titles.length, 'duplicate new material title');
  for (const t of titles) assert.ok(!coreTitles.has(t), `overlaps an existing title: ${t}`);
  // formats are mixed too (PDFs and images without a body)
  assert.ok(added.some(f => /\.pdf$/.test(f.path)) && added.some(f => /\.jpg$/.test(f.path)));
});

test('showcase demo index rules: guide documents stay within 100 lines, and links only use relative paths inside the vault', () => {
  for (const f of demoDataset.files) {
    if (!f.path.includes('/')) assert.ok(f.body.split('\n').length <= 100, `${f.path}: ${f.body.split('\n').length} lines`);
    for (const link of parseLinks(f.body)) {
      assert.ok(!/^([a-z]+:|\/|~)/i.test(link.href), `${f.path} → ${link.href}: absolute or external address`);
      const r = resolveHref(f.path, link.href);
      assert.equal(r.type, 'path', `${f.path} → ${link.href}`);
    }
  }
});

test('showcase demo: hand-written representative documents, the shared source file, and demo path titles and bodies are intact, and the synthetic label remains', () => {
  const keep: [string, string, string][] = [
    ['CLAUDE.md', 'CLAUDE.md', 'Fictional demo vault'],
    ['work.md', 'Work', 'index for the work area'],
    ['personal.md', 'Personal', 'index for the personal area'],
    ['project-nova.md', 'Nova website redesign guide', 'brief → information architecture → meeting notes'],
    ['project-ml-study.md', 'Machine learning study group guide', 'weekly notes'],
    ['moc-ai.md', 'AI in practice', 'prompts used at work'],
    ['src-work/projects/nova/brief.md', 'Nova redesign brief', 'within 30 seconds'],
    [SHARED, 'Meeting notes summary prompt', 'needs confirmation'],
    ['src-work/content/style-guide.md', 'Writing style guide', 'only one idea in each sentence'],
    ['src-personal/journal/weekly-review.md', 'Weekly review', 'Same name as the work retrospective']
  ];
  for (const [path, title, text] of keep) {
    const f = demoDataset.files.find(x => x.path === path);
    assert.ok(f, path);
    assert.equal(f.title, title, path);
    assert.ok(f.body.includes(text), `${path}: body preserved`);
  }
  assert.equal(demoDataset.synthetic, true);
  const router = demoDataset.files.find(f => f.path === 'CLAUDE.md')!;
  assert.match(router.body, /fictional/i);
  assert.equal((router.body.match(/^\| \[src-/gm) ?? []).length, 3, '3 external source folders (fictional)');
});
