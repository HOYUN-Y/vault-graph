import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaEmphasis, edgesInView, linkTarget, pairKey, primaryPath, relationsOf } from '../src/core/graph';
import { demo, vault } from './helpers';

// 작은 볼트: 두 영역 · 하위 색인 · MOC · 원문 자료(src-x · src-z). 링크는 모두 문서 기준 상대경로
const tiny = () => vault({
  r: ['CLAUDE.md', '[a1](a1.md) [a2](a2.md) [m](moc-m.md)'],
  a1: ['a1.md', '[s1](a1--s1.md)'],
  a2: ['a2.md', '[s2](a2--s2.md)'],
  s1: ['a1--s1.md', '[x](src-x/x.md) [y](src-x/y.md)'],
  s2: ['a2--s2.md', '[z](src-z/z.md) [다른 영역 자료](src-x/x.md)'],
  m: ['moc-m.md', '[x](src-x/x.md) [z](src-z/z.md)'],
  x: ['src-x/x.md', '[y](y.md)'],
  y: ['src-x/y.md', '[x](./x.md) 상위 [s1](../a1--s1.md)'],
  z: ['src-z/z.md', '']
});

test('관계 분류: 분류 소속 · 다른 위치 색인 연결 · 주제 연결을 방향별로 남기고, 화면 선은 쌍마다 하나로 합친다', () => {
  const { g, id } = tiny();
  assert.deepEqual(g.problems, []);
  const rel = (a: string, b: string) => g.relations.filter(r => r.source === id(a) && r.target === id(b)).map(r => r.kind);
  assert.deepEqual(rel('r', 'a1'), ['primary']);
  assert.deepEqual(rel('r', 'm'), ['topic'], '라우터 → MOC는 주제 축');
  assert.deepEqual(rel('s1', 'x'), ['primary'], '주 분류를 정한 색인 링크는 분류 소속 관계 하나');
  assert.deepEqual(rel('s2', 'x'), ['index'], '다른 영역 색인이 연결');
  assert.deepEqual(rel('m', 'x'), ['topic']);
  assert.deepEqual(rel('x', 'y'), ['topic']);
  assert.deepEqual(rel('y', 'x'), ['topic'], '반대 방향 링크도 따로 남는다');
  assert.deepEqual(rel('y', 's1'), ['topic'], '자료가 상위 색인을 다시 링크하면 주제 관계로 남는다');
  assert.equal(g.relations.length, 14);
  // 화면 선(전체 보기): 같은 쌍은 하나. y–s1은 분류 소속 선에 합쳐지고 종류 목록에 둘 다 남는다
  assert.equal(g.edges.length, 12);
  assert.deepEqual(g.edgeByKey.get(pairKey(id('s1'), id('y')))?.kinds.sort(), ['primary', 'topic']);
  assert.equal(g.edgeByKey.get(pairKey(id('s1'), id('y')))?.kind, 'primary');
});

test('회귀: 다른 영역 색인 A ↔ B가 서로 링크하면 양쪽 영역 필터가 상대를 강조한다', () => {
  const { g, id } = vault({
    r: ['CLAUDE.md', '[a1](a1.md) [a2](a2.md)'],
    a1: ['a1.md', '[sa](a1--sa.md)'], a2: ['a2.md', '[sb](a2--sb.md)'],
    sa: ['a1--sa.md', '[sb](a2--sb.md)'],
    sb: ['a2--sb.md', '[sa](a1--sa.md)']
  });
  assert.ok(areaEmphasis(g, id('a1')).has(id('sb')), 'a1 쪽 색인이 sb를 연결');
  assert.ok(areaEmphasis(g, id('a2')).has(id('sa')), 'a2 쪽 색인이 sa를 연결');
  assert.equal(g.edges.filter(e => e.key === pairKey(id('sa'), id('sb'))).length, 1, '화면 선은 하나');
});

test('회귀: 색인 A → 자료 D(색인 연결)와 D → A(주제 링크)가 함께 있으면 두 보기 모두에 관계가 남는다', () => {
  // 라우터가 a2를 먼저 연결하므로 d의 주 분류는 sb다(너비 우선 · 링크 순서)
  const { g, id } = vault({
    r: ['CLAUDE.md', '[a2](a2.md) [a1](a1.md)'],
    a1: ['a1.md', '[sa](a1--sa.md)'], a2: ['a2.md', '[sb](a2--sb.md)'],
    sa: ['a1--sa.md', '[d](src-b/d.md)'],
    sb: ['a2--sb.md', '[d](src-b/d.md)'],
    d: ['src-b/d.md', '근거: [sa](../a1--sa.md)']
  });
  assert.equal(g.byId.get(id('d'))!.parent, id('sb'));
  const key = pairKey(id('sa'), id('d'));
  assert.ok(edgesInView(g, 'structure').some(e => e.key === key), '영역 구조 보기');
  assert.ok(edgesInView(g, 'topic').some(e => e.key === key), '주제 연결 보기');
  const d = relationsOf(g, id('d'));
  assert.deepEqual(d.incoming.find(r => r.doc.id === id('sa'))?.kinds, ['index']);
  assert.deepEqual(d.outgoing.find(r => r.doc.id === id('sa'))?.kinds, ['topic']);
  assert.ok(areaEmphasis(g, id('a1')).has(id('d')));
});

test('영역 필터: 소속 문서와 그 영역 색인이 명시적으로 연결한 자료만 강조하고, 주제 연결만으로는 넣지 않는다', () => {
  const { g, id, names } = tiny();
  assert.deepEqual(names(areaEmphasis(g, id('a2'))), ['a2', 's2', 'x', 'z']);
  assert.deepEqual(names(areaEmphasis(g, id('a1'))), ['a1', 's1', 'x', 'y']);
  const d = demo();
  const personal = areaEmphasis(d.g, d.id('personal.md'));
  assert.ok(personal.has(d.id('src-work/content/style-guide.md')), '개인 · 기록 색인이 연결한 업무 자료');
  assert.ok(personal.has(d.id('src-work/operations/prompts/회의록 요약 프롬프트.md')), '개인 · 학습 색인이 연결한 업무 자료');
  assert.ok(!personal.has(d.id('src-work/content/calendar.md')), '개인 자료의 본문 링크(주제 연결)만으로는 포함하지 않음');
  assert.ok(!personal.has(d.id('moc-AI-활용.md')) && !personal.has(d.g.routerId));
});

test('연결 보기: 영역 구조는 분류 소속 + 색인 연결, 주제 연결은 라우터 → MOC · MOC → 자료 · 문서 사이 링크만 남긴다', () => {
  const { g } = demo();
  const structure = edgesInView(g, 'structure'), topic = edgesInView(g, 'topic');
  assert.ok(structure.length > 0 && topic.length > 0);
  assert.ok(structure.every(e => e.kind === 'primary' || e.kind === 'index'));
  assert.ok(topic.every(e => e.kind === 'topic'));
  assert.ok(topic.some(e => e.source === g.routerId && g.byId.get(e.target)?.kind === 'moc'));
  assert.ok(!structure.some(e => g.byId.get(e.target)?.kind === 'moc'));
  // 같은 쌍이 두 보기에 함께 나올 수 있으므로 개수 합이 아니라 쌍의 합집합이 전체와 같다
  const union = new Set([...structure, ...topic].map(e => e.key));
  assert.deepEqual([...union].sort(), edgesInView(g, 'all').map(e => e.key).sort());
});

test('분류 경로 · 관계: 분류 경로는 색인 링크를 따라 하나로 정해지고, 상세 패널의 들어옴 · 나감은 중복 없이 종류를 단다', () => {
  const { g, id, name } = tiny();
  assert.deepEqual(primaryPath(g, id('x')).map(name), ['r', 'a1', 's1', 'x']);
  const label = (list: { doc: { id: string }; kind: string }[]) => list.map(r => `${name(r.doc.id)}:${r.kind}`).sort();
  const rel = relationsOf(g, id('x'));
  assert.deepEqual(label(rel.incoming), ['m:topic', 's1:primary', 's2:index', 'y:topic']);
  assert.deepEqual(label(rel.outgoing), ['y:topic']);
  assert.deepEqual(label(relationsOf(g, id('y')).outgoing), ['s1:topic', 'x:topic']);
  assert.deepEqual(label(relationsOf(g, id('s2')).outgoing), ['x:index', 'z:primary']);
});

test('본문 링크 이동: 상세 패널의 링크 주소는 그 문서 위치 기준으로 같은 노드를 찾는다', () => {
  const { g, id } = tiny();
  assert.equal(linkTarget(g, id('y'), './x.md'), id('x'));
  assert.equal(linkTarget(g, id('y'), '../a1--s1.md'), id('s1'));
  assert.equal(linkTarget(g, id('s2'), 'src-x/x.md#요약'), id('x'));
  assert.equal(linkTarget(g, id('y'), 'https://example.com'), null);
  assert.equal(linkTarget(g, id('y'), 'ghost.md'), null);
});
