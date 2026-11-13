import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripLinks } from '../src/core/markdown';
import { searchDocs } from '../src/core/search';
import { demo, vault } from './helpers';

const { g, id } = demo();
const { docs } = g;
const ids = (query: string) => searchDocs(docs, query).hits.map(h => h.doc.id);

test('search: title matches come before path, summary and body matches, and report the matched field', () => {
  // The 5,000 demo has over 50 title matches alone, so check the full ranking
  const result = searchDocs(docs, 'notes', Infinity);
  assert.ok(result.total >= 3);
  const fields = result.hits.map(h => h.field);
  const firstNonTitle = fields.findIndex(f => f !== 'title');
  assert.ok(firstNonTitle > 0, 'title matches first');
  assert.ok(fields.slice(firstNonTitle).every(f => f !== 'title'), 'title matches are grouped at the front');
  const body = result.hits.find(h => h.field === 'body');
  assert.ok(body?.excerpt?.includes('notes'));
});

test('search: multiple terms match only documents containing all of them, with NFC normalization and case folding', () => {
  const hits = searchDocs(docs, 'Nova accessibility').hits;
  assert.equal(hits[0].doc.id, id('src-work/projects/nova/a11y-checklist.md'));
  for (const h of hits) {
    const all = [h.doc.title, h.doc.path, h.doc.summary, stripLinks(h.doc.body)].join('\n').toLowerCase();
    assert.ok(all.includes('nova') && all.includes('accessibility'), h.doc.id);
  }
  assert.ok(!hits.some(h => h.doc.id === id('src-work/projects/nova/brief.md')), 'documents with only one term are excluded');
  // NFD input (e.g. Korean typed on macOS) matches NFC titles
  const kr = vault({ Router: ['CLAUDE.md', '[Prompts](prompts.md)'], '프롬프트': ['prompts.md', '# 프롬프트'] });
  assert.deepEqual(searchDocs(kr.g.docs, '프롬프트'.normalize('NFD')).hits.map(h => h.doc.id), [kr.id('프롬프트')]);
  assert.ok(ids('CLAUDE').includes(g.routerId));
  assert.ok(ids('claude').includes(g.routerId));
});

test('search: also matches source location (path) and index summary; excerpts drop link syntax and relative paths', () => {
  const byPath = searchDocs(docs, 'operations/prompts').hits[0];
  assert.equal(byPath.doc.id, id('src-work/operations/prompts/meeting-notes-summary-prompt.md'));
  assert.equal(byPath.field, 'path');
  const bySummary = searchDocs(docs, 'emergency fund').hits.find(h => h.doc.id === id('src-personal/life/budget.md'));
  assert.equal(bySummary?.field, 'summary');
  for (const hit of searchDocs(docs, 'information architecture').hits) assert.ok(!hit.excerpt?.includes(']('), hit.doc.path);
});

test('search: an empty query has no results and an unknown term returns 0', () => {
  assert.equal(searchDocs(docs, '   ').total, 0);
  assert.equal(searchDocs(docs, 'nonexistentterm').total, 0);
});
