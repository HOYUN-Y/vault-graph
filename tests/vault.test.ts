import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatOfPath, kindOfPath, opaqueId } from '../src/core/vault';
import { DEMO_PRIMARY, demoDataset } from '../src/data/demo';
import { demo, vault } from './helpers';

test('경로 규칙: 최상위 CLAUDE.md · 영역.md · 영역--주제.md · moc-주제.md · project-이름.md, 그 밖(src-* 등)은 원문 자료', () => {
  const cases: [string, string][] = [
    ['CLAUDE.md', 'router'], ['work.md', 'area'], ['personal--포트폴리오.md', 'subindex'], ['work--a--b.md', 'subindex'],
    ['moc-배포.md', 'moc'], ['moc-배포--운영.md', 'moc'], ['project-nova.md', 'guide'],
    ['src-work/work.md', 'material'], ['src-work/CLAUDE.md', 'material'], ['src-work/moc-x.md', 'material'], ['보드.png', 'material']
  ];
  for (const [path, kind] of cases) assert.equal(kindOfPath(path), kind, path);
  assert.equal(formatOfPath('src-work/a.PDF'), 'pdf');
  assert.equal(formatOfPath('src-work/a.jpeg'), 'image');
  assert.equal(formatOfPath('src-work/a.key'), null);
});

test('고유 ID: 정규 경로에서 결정적으로 만들고 경로 문자열을 드러내지 않는다', () => {
  const id = opaqueId('src-work/operations/회의록.md');
  assert.equal(id, opaqueId('src-work/operations/회의록.md'));
  assert.notEqual(id, opaqueId('src-personal/operations/회의록.md'));
  assert.match(id, /^d[0-9a-z]+$/);
});

test('공유 원문: 영역 색인 · 다른 영역 색인 · MOC가 서로 다른 표기(인코딩 · 꺾쇠 · NFD · 상대경로)로 연결해도 노드는 하나다', () => {
  const name = '회의록 요약.md';
  const v = vault({
    r: ['CLAUDE.md', '[업무](work.md) [개인](personal.md) [AI](moc-AI.md)'],
    work: ['work.md', '[운영](work--ops.md)'],
    personal: ['personal.md', '[학습](personal--learn.md)'],
    ops: ['work--ops.md', `[회의록](src-work/ops/${encodeURIComponent('회의록 요약')}.md)`],
    learn: ['personal--learn.md', `[함께 보기](<src-work/ops/${name}>) [노트](src-personal/learn/note.md)`],
    ai: ['moc-AI.md', `[프롬프트](src-work/ops/${name.normalize('NFD').replace(/ /g, '%20')}#규칙)`],
    note: ['src-personal/learn/note.md', `[업무 쪽](../../src-work/ops/${name.replace(/ /g, '%20')})`],
    shared: [`src-work/ops/${name}`, '']
  });
  assert.deepEqual(v.g.problems, []);
  assert.equal(v.g.docs.length, 8);
  assert.deepEqual(v.names(v.g.inLinks.get(v.id('shared'))!), ['ai', 'learn', 'note', 'ops']);
  // 주 분류는 영역 축에서 먼저 닿은 색인 하나, 나머지는 색인 연결 · 주제 연결
  assert.equal(v.name(v.g.byId.get(v.id('shared'))!.parent!), 'ops');
  const kinds = v.g.relations.filter(r => r.target === v.id('shared')).map(r => `${v.name(r.source)}:${r.kind}`).sort();
  assert.deepEqual(kinds, ['ai:topic', 'learn:index', 'note:topic', 'ops:primary']);
});

test('동명 다른 경로: 제목 · 파일명이 같아도 경로가 다르면 다른 노드이고, 링크는 경로대로 각자를 고른다', () => {
  const v = vault({
    r: ['CLAUDE.md', '[업무](work.md) [개인](personal.md)'],
    work: ['work.md', '[회고](src-work/weekly-review.md)'],
    personal: ['personal.md', '[회고](src-personal/journal/weekly-review.md)'],
    a: ['src-work/weekly-review.md', '[개인 회고](../src-personal/journal/weekly-review.md)'],
    b: ['src-personal/journal/weekly-review.md', '']
  });
  assert.deepEqual(v.g.problems, []);
  assert.notEqual(v.id('a'), v.id('b'));
  assert.equal(v.name(v.g.byId.get(v.id('a'))!.parent!), 'work');
  assert.equal(v.name(v.g.byId.get(v.id('b'))!.parent!), 'personal');
  assert.deepEqual(v.names(v.g.outLinks.get(v.id('a'))!), ['b']);
});

test('분류는 디스크 폴더가 아니라 색인 링크로 정한다: 원문 위치와 무관하고, 라우터 프로젝트 표는 바로가기로 남는다', () => {
  const v = vault({
    r: ['CLAUDE.md', '## 영역\n[업무](work.md)\n## 프로젝트\n[노바](project-nova.md) [홀로](project-solo.md)\n## 주제\n[기획](moc-plan.md)'],
    work: ['work.md', '[프로젝트](work--projects.md)'],
    projects: ['work--projects.md', '[노바](project-nova.md)'],
    nova: ['project-nova.md', '[기획서](src-personal/떨어진/곳/brief.md)'],
    solo: ['project-solo.md', '[메모](src-work/solo.md)'],
    plan: ['moc-plan.md', '[기획서](src-personal/떨어진/곳/brief.md) [아이디어](src-work/idea.md)'],
    brief: ['src-personal/떨어진/곳/brief.md', ''],
    memo: ['src-work/solo.md', ''],
    idea: ['src-work/idea.md', '']
  });
  assert.deepEqual(v.g.problems, []);
  const parent = (n: string) => v.name(v.g.byId.get(v.id(n))!.parent ?? 'none');
  assert.equal(parent('nova'), 'projects', '영역 색인이 연결한 프로젝트 안내는 그 영역에 분류');
  assert.equal(parent('brief'), 'nova', 'src-personal 안에 있어도 업무 쪽 안내가 분류');
  assert.equal(v.g.areaOf.get(v.id('brief')), v.id('work'));
  assert.equal(parent('solo'), 'r', '영역 색인이 연결하지 않은 프로젝트 안내만 라우터 아래');
  assert.equal(parent('idea'), 'plan', 'MOC만 연결한 자료는 그 MOC 아래(주제 축)');
  assert.deepEqual(v.g.relations.filter(r => r.source === v.id('r') && r.target === v.id('nova')).map(r => r.kind), ['index']);
});

test('구조 문제 보고: 같은 경로 중복 · 끊긴 링크 · 볼트 밖 링크 · 닿지 않는 문서 · 라우터 수. 폴더 링크는 노드가 아니라 원문 루트 목록이 된다', () => {
  const v = vault({
    r: ['CLAUDE.md', '[업무](work.md) [없음](ghost.md) [밖](../outside.md)\n| [src-work](src-work) | 가상 | 업무 |\n[하위 폴더](src-work/ops)'],
    work: ['work.md', '[자료](src-work/ops/a.md)'],
    dup: ['src-work/ops/./a.md', ''],
    a: ['src-work/ops/a.md', ''],
    lost: ['src-work/lost.md', ''],
    r2: ['src-x/../CLAUDE.md', '']
  });
  const text = v.g.problems.join('\n');
  for (const word of ['같은 원문 경로가 두 번 있음: src-work/ops/a.md', '끊긴 링크: CLAUDE.md → ghost.md', '끊긴 링크(볼트 밖 경로)', '닿지 않는 문서: src-work/lost.md'])
    assert.ok(text.includes(word), word);
  assert.deepEqual(v.g.sourceRoots, ['src-work'], 'src-* 최상위 폴더만 원문 루트로 찾는다');
  assert.equal(v.g.docs.length, 4, '정규화 후 같은 경로(./ · ..)는 하나만 남는다: 라우터 · 영역 · 자료 · 닿지 않는 문서');
  const none = vault({ w: ['work.md', ''] });
  assert.ok(none.g.problems.some(p => p.includes('라우터는 하나여야')));
});

test('데모 볼트: 스킬 구조(최상위 안내 문서 · src-* 원문 · 상대경로 링크)이고, 링크만으로 찾은 분류가 작성 정의와 같다', () => {
  const { g, id } = demo();
  assert.deepEqual(g.problems, []);
  assert.deepEqual(g.sourceRoots, ['src-work', 'src-personal', 'src-research']);
  for (const d of g.docs) {
    if (d.kind === 'material') assert.match(d.path, /^src-(work|personal|research)\//, d.path);
    else assert.ok(!d.path.includes('/'), `안내 문서는 최상위: ${d.path}`);
    assert.equal(d.parent ? g.byId.get(d.parent)!.path : null, DEMO_PRIMARY.get(d.path), d.path);
  }
  for (const f of demoDataset.files) assert.ok(!f.body.includes('[['), `데모 전용 [[id]] 표기 없음: ${f.path}`);
  assert.equal(g.byId.get(id('project-nova.md'))!.kind, 'guide');
  // 공유 원문 하나를 영역 색인 · 다른 영역 색인 · MOC가 함께 연결한다(노드 하나)
  const shared = id('src-work/operations/prompts/회의록 요약 프롬프트.md');
  const sources = (g.inLinks.get(shared) ?? []).map(s => g.byId.get(s)!.path);
  for (const p of ['work--operations.md', 'personal--learning.md', 'moc-AI-활용.md']) assert.ok(sources.includes(p), p);
});
