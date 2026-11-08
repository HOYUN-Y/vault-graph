import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripLinks } from '../src/core/markdown';
import { searchDocs } from '../src/core/search';
import { demo } from './helpers';

const { g, id } = demo();
const { docs } = g;
const ids = (query: string) => searchDocs(docs, query).hits.map(h => h.doc.id);

test('검색: 제목 일치가 경로 · 설명 · 본문 일치보다 먼저 나오고 어느 칸에서 찾았는지 알려 준다', () => {
  // 5,000개 데모에는 제목 일치만 50건이 넘으므로 전체 순위를 본다
  const result = searchDocs(docs, '회의록', Infinity);
  assert.ok(result.total >= 3);
  const fields = result.hits.map(h => h.field);
  const firstNonTitle = fields.findIndex(f => f !== 'title');
  assert.ok(firstNonTitle > 0, '제목 일치가 먼저');
  assert.ok(fields.slice(firstNonTitle).every(f => f !== 'title'), '제목 일치는 앞쪽에 모인다');
  const body = result.hits.find(h => h.field === 'body');
  assert.ok(body?.excerpt?.includes('회의록'));
});

test('검색: 여러 낱말은 모두 들어 있는 문서만, 정규화(NFC)와 대소문자를 맞춰 찾는다', () => {
  const hits = searchDocs(docs, '노바 접근성').hits;
  assert.equal(hits[0].doc.id, id('src-work/projects/nova/a11y-checklist.md'));
  for (const h of hits) {
    const all = [h.doc.title, h.doc.path, h.doc.summary, stripLinks(h.doc.body)].join('\n');
    assert.ok(all.includes('노바') && all.includes('접근성'), h.doc.id);
  }
  assert.ok(!hits.some(h => h.doc.id === id('src-work/projects/nova/brief.md')), '한 낱말만 있는 문서는 제외');
  const decomposed = '프롬프트'.normalize('NFD');
  assert.deepEqual(ids(decomposed), ids('프롬프트'));
  assert.ok(ids('CLAUDE').includes(g.routerId));
  assert.ok(ids('claude').includes(g.routerId));
});

test('검색: 원문 위치(경로)와 색인 설명으로도 찾고, 발췌에는 링크 문법 · 상대경로를 남기지 않는다', () => {
  const byPath = searchDocs(docs, 'operations/prompts').hits[0];
  assert.equal(byPath.doc.id, id('src-work/operations/prompts/회의록 요약 프롬프트.md'));
  assert.equal(byPath.field, 'path');
  const bySummary = searchDocs(docs, '비상금').hits.find(h => h.doc.id === id('src-personal/life/budget.md'));
  assert.equal(bySummary?.field, 'summary');
  for (const hit of searchDocs(docs, '정보 구조').hits) assert.ok(!hit.excerpt?.includes(']('), hit.doc.path);
});

test('검색: 빈 검색어는 결과가 없고, 없는 낱말은 0개를 돌려준다', () => {
  assert.equal(searchDocs(docs, '   ').total, 0);
  assert.equal(searchDocs(docs, '존재하지않는낱말').total, 0);
});
