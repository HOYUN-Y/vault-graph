import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pairKey } from '../src/core/graph';
import { defaultExpanded, expandable, foldCounts, foldedVisible, revealPrimaryPath, shownEdges, toggleExpanded, visibleSet } from '../src/core/explore';
import { foldScale, labelText } from '../src/render/fold';
import type { ExploreState } from '../src/core/explore';
import { layoutGraph } from '../src/core/layout3d';
import type { EdgeView } from '../src/core/types';
import { demo, vault } from './helpers';

// x는 s1이 주 분류이며 다른 영역 색인 s2와 MOC m도 연결한다(공유 원문). y는 s1에만 속한다
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

test('처음 상태: 모두 펼쳐 전체 신경망이 보인다', () => {
  const s = state(defaultExpanded(g));
  assert.deepEqual(names(visibleSet(g, s)), ['a1', 'a2', 'm', 'r', 's1', 's2', 'x', 'y', 'z']);
  assert.equal(keys(s).length, g.edges.length);
});

test('경로별 접기: s1을 접어도 다른 펼친 경로(s2 · m)로 닿는 공유 원문 x는 남고, s1에서 나가는 선만 감춘다', () => {
  const s = state(toggleExpanded(defaultExpanded(g), id('s1')));
  const v = visibleSet(g, s);
  assert.ok(v.has(id('x')), '공유 원문 유지');
  assert.ok(!v.has(id('y')), 's1에만 속한 자료는 감춤');
  const shown = keys(s);
  assert.ok(!shown.includes(pairKey(id('s1'), id('x'))), '접은 경로의 선은 감춤');
  assert.ok(shown.includes(pairKey(id('s2'), id('x'))) && shown.includes(pairKey(id('m'), id('x'))), '다른 경로의 선은 유지');
  assert.ok(shown.includes(pairKey(id('a1'), id('s1'))), '접은 문서 자체로 가는 선은 유지');
});

test('모든 경로를 접으면 공유 원문도 감추지만, 선택한 자료는 선택 해제 전까지 남는다', () => {
  let expanded = defaultExpanded(g);
  for (const n of ['s1', 's2', 'm']) expanded = toggleExpanded(expanded, id(n));
  assert.ok(!visibleSet(g, state(expanded)).has(id('x')));
  assert.ok(visibleSet(g, state(expanded, 'all', id('x'))).has(id('x')), '선택 고정');
});

test('검색 선택은 주 분류 경로만 펼친다(여러 MOC · 다른 색인이 연결해도 그 경로는 열지 않는다)', () => {
  const opened = revealPrimaryPath(g, new Set<string>(), id('x'));
  assert.deepEqual(names(opened), ['a1', 's1']);
  assert.ok(visibleSet(g, state(opened)).has(id('x')));
  assert.ok(!opened.has(id('m')) && !opened.has(id('s2')));
});

test('연결 보기에 따라 경로 축이 바뀐다: 주제 보기는 라우터 → MOC → 자료, 영역 구조 보기는 MOC를 거치지 않는다', () => {
  const all = defaultExpanded(g);
  assert.deepEqual(names(visibleSet(g, state(all, 'topic'))), ['m', 'r', 'x']);
  const structure = visibleSet(g, state(all, 'structure'));
  assert.ok(!structure.has(id('m')) && structure.has(id('x')) && structure.has(id('z')));
});

test('고정 자리: 3D 배치는 같은 데이터면 같고, 펼침 · 보기와 무관하며 공유 원문은 주 분류 영역 쪽에 있다', () => {
  const d = demo(), again = demo();
  const a = layoutGraph(d.g, 120), b = layoutGraph(again.g, 120);
  assert.equal(a.size, d.g.docs.length);
  for (const [key, p] of a) {
    assert.ok(p.every(Number.isFinite), key);
    assert.deepEqual(b.get(key), p);
  }
  assert.deepEqual(a.get(d.g.routerId), [0, 0, 0]);
  const shared = d.id('src-work/operations/prompts/회의록 요약 프롬프트.md');
  const centroid = (area: string) => {
    const pts = d.g.docs.filter(x => d.g.areaOf.get(x.id) === area && x.id !== shared).map(x => a.get(x.id)!);
    return [0, 1, 2].map(i => pts.reduce((s, p) => s + p[i], 0) / pts.length);
  };
  const dist = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const work = d.id('work.md'), personal = d.id('personal.md');
  assert.ok(dist(a.get(shared)!, centroid(work)) < dist(a.get(shared)!, centroid(personal)), '업무 쪽에 자리');
  // 업무 · 개인 영역이 서로 다른 쪽(좌우 반구)에 모인다
  assert.ok(centroid(work)[0] < 0 && centroid(personal)[0] > 0);
});

test('회귀: 자료 d가 자기 주 분류 색인 s를 다시 링크하고 열린 MOC가 d를 연결할 때, s만 접으면 d는 MOC 경로로 남고 s–d 선은 주제 연결로만 남는다', () => {
  const h = vault({
    r: ['CLAUDE.md', '[a](a.md) [m](moc-m.md)'], a: ['a.md', '[s](a--s.md)'], s: ['a--s.md', '[d](src-a/d.md)'],
    m: ['moc-m.md', '[d](src-a/d.md)'], d: ['src-a/d.md', '근거: [s](../a--s.md)']
  });
  const st = state(toggleExpanded(defaultExpanded(h.g), h.id('s')));
  const v = visibleSet(h.g, st);
  assert.ok(v.has(h.id('d')), 'MOC 경로로 보임');
  const edge = shownEdges(h.g, st, v).find(e => e.key === pairKey(h.id('s'), h.id('d')));
  assert.ok(edge, '주제 링크 선은 남는다');
  assert.deepEqual(edge.kinds, ['topic'], '접힌 분류 소속은 빠진다');
  assert.equal(edge.kind, 'topic');
  // 영역 구조 보기에서는 주제 링크가 보기 밖이고 분류 소속은 접혀 있으므로 선이 없다
  const sv = state(toggleExpanded(defaultExpanded(h.g), h.id('s')), 'structure', h.id('d'));
  assert.ok(!shownEdges(h.g, sv, visibleSet(h.g, sv)).some(e => e.key === pairKey(h.id('s'), h.id('d'))));
});

test('덩어리 방식(작업폴더 연결)은 영역 색인만 펼친 채 시작하고, 기본(색인 방식 · 데모)은 모두 펼친다', () => {
  assert.deepEqual(defaultExpanded(g), expandable(g));
  const start = defaultExpanded(g, true);
  assert.deepEqual(names(start), ['a1', 'a2']);
  assert.deepEqual(names(visibleSet(g, state(start))), ['a1', 'a2', 'm', 'r', 's1', 's2'], '영역 아래 하위 색인 · MOC까지만 보인다');
});

test('접힌 개수: 영역은 주 분류 자손 전체, MOC는 바로 아래 주제 링크 수. 보이면서 접힌 것만 덩어리가 된다', () => {
  const counts = foldCounts(g);
  assert.equal(counts.get(id('a1')), 3, 'a1 → s1 → x · y');
  assert.equal(counts.get(id('s1')), 2);
  assert.equal(counts.get(id('m')), 1, 'MOC는 주 분류 하위가 없어도 연결 수');
  const s = state(new Set([id('a1')]));
  const folded = foldedVisible(visibleSet(g, s), s.expanded, counts);
  assert.deepEqual(names(new Set(folded.keys())), ['a2', 'm', 's1'], '펼친 a1 · 보이지 않는 s2는 빠진다');
});

test('덩어리 크기 · 이름표: 하위가 많을수록 크되 상한이 있고, 이름표에 +개수가 붙는다', () => {
  assert.ok(foldScale(10) > 1 && foldScale(1000) > foldScale(10));
  assert.equal(foldScale(1e9), 2.4);
  assert.equal(labelText('업무 색인', 1240), '업무 색인 +1,240');
  assert.equal(labelText('업무 색인', undefined), '업무 색인');
});
