import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaEmphasis, linkTarget, pairKey, primaryPath } from '../src/core/graph';
import { parseLinks, resolveHref } from '../src/core/markdown';
import { INDEX_KINDS } from '../src/core/types';
import { searchDocs } from '../src/core/search';
import { DEMO_CORE_COUNT, DEMO_DOC_COUNT, demoCoreFiles, demoDataset } from '../src/data/demo';
import { demo } from './helpers';

const { g, id } = demo();
const SHARED = 'src-work/operations/prompts/회의록 요약 프롬프트.md';

test('데모 데이터: 합성 데이터로 표시되고 구조 문제(같은 경로 중복 · 끊긴 링크 · 닿지 않는 문서)가 없다', () => {
  assert.equal(demoDataset.synthetic, true);
  assert.match(demoDataset.label, /데모/);
  assert.deepEqual(g.problems, []);
  assert.equal(new Set(demoDataset.files.map(f => f.path)).size, demoDataset.files.length);
  assert.equal(g.docs.length, demoDataset.files.length);
  assert.equal(g.docs.filter(d => d.kind === 'router').length, 1);
  assert.equal(g.byId.get(g.routerId)?.path, 'CLAUDE.md');
});

test('데모 데이터: 두 탐색 축(영역 색인 · 하위 색인 · 자료 / 주제 MOC · 관련 자료)을 모두 갖춘다', () => {
  const kinds = new Set(g.docs.map(d => d.kind));
  for (const kind of ['router', 'area', 'subindex', 'guide', 'moc', 'material'] as const) assert.ok(kinds.has(kind), kind);
  assert.ok(g.areas.length >= 2, '영역 둘 이상');
  for (const moc of g.mocs) assert.ok((g.outLinks.get(moc.id) ?? []).length > 0, `${moc.id}: 관련 자료 없음`);
  // 모든 자료는 어떤 영역에 분류된다(주 분류 고정)
  for (const d of g.docs.filter(x => x.kind === 'material')) assert.ok(g.areaOf.get(d.id), `${d.id}: 영역 없음`);
});

test('본문과 연결이 일치한다: 모든 연결은 어느 한쪽 본문의 [이름](상대경로) 링크에서 나온다(디스크 폴더 관계 없음)', () => {
  const writes = (a: string, b: string) => parseLinks(g.byId.get(a)!.body).some(l => linkTarget(g, a, l.href) === b);
  for (const e of g.edges) assert.ok(writes(e.source, e.target) || writes(e.target, e.source), `${e.key}: 근거 없는 연결`);
  // 문서 사이 링크는 하나도 빠짐없이 연결이 된다(외부 주소 · 폴더 링크는 노드가 아니다)
  for (const d of g.docs) {
    for (const link of parseLinks(d.body)) {
      const t = linkTarget(g, d.id, link.href);
      if (t) { if (t !== d.id) assert.ok(g.edgeByKey.has(pairKey(d.id, t)), `${d.path} → ${link.href}: 연결 누락`); }
      else {
        const folder = resolveHref(d.path, link.href);
        assert.ok(folder.type === 'path' && /^src-[^/]+$/.test(folder.path), `${d.path} → ${link.href}: 원문 루트 폴더 링크만 노드가 아니다`);
      }
    }
  }
});

test('공유 원문: 두 영역의 색인과 하나의 MOC가 같은 원문을 연결해도 노드는 하나이고 분류 경로는 하나로 고정된다', () => {
  const shared = g.docs.filter(d => {
    if (d.kind !== 'material') return false;
    const sources = [d.parent!, ...(g.inLinks.get(d.id) ?? [])].map(id => g.byId.get(id)!);
    const indexAreas = new Set(sources.filter(s => INDEX_KINDS.has(s.kind)).map(s => g.areaOf.get(s.id)).filter(Boolean));
    return indexAreas.size >= 2 && sources.some(s => s.kind === 'moc');
  });
  assert.ok(shared.length >= 1, '시나리오 자료가 없음');
  const doc = shared.find(d => d.path === SHARED);
  assert.ok(doc, '회의록 요약 프롬프트가 시나리오에 포함되어야 함');
  assert.equal(demoDataset.files.filter(f => f.path === SHARED).length, 1);
  const path = (x: string) => g.byId.get(x)!.path;
  const kinds = g.edges.filter(e => e.source === doc.id || e.target === doc.id).map(e => `${e.kind}:${path(e.source === doc.id ? e.target : e.source)}`);
  assert.ok(kinds.includes('primary:work--operations.md'), '주 분류(업무 · 운영) 분류 소속');
  assert.ok(kinds.includes('index:personal--learning.md'), '다른 영역(개인 · 학습) 색인 연결');
  assert.ok(kinds.includes('topic:moc-AI-활용.md'), 'AI 활용 MOC 주제 연결');
  assert.equal(g.areaOf.get(doc.id), id('work.md'));
  assert.deepEqual(primaryPath(g, doc.id).map(path), ['CLAUDE.md', 'work.md', 'work--operations.md', SHARED]);
  // 개인 영역 필터에서도 강조된다(그 영역 색인이 명시적으로 연결) — 그러나 분류 영역은 바뀌지 않는다
  assert.ok(areaEmphasis(g, id('personal.md')).has(doc.id));
});

test('동명 자료: 제목이 같은 자료는 다른 노드이며 경로로 구분되고, 검색 결과에 둘 다 나온다', () => {
  const byTitle = new Map<string, string[]>();
  for (const d of g.docs) byTitle.set(d.title, [...(byTitle.get(d.title) ?? []), d.id]);
  const twins = [...byTitle.values()].filter(ids => ids.length > 1);
  assert.ok(twins.length >= 1, '동명 자료 시나리오 없음');
  for (const ids of twins) {
    const paths = ids.map(id => g.byId.get(id)!.path);
    assert.equal(new Set(paths).size, ids.length);
    const found = searchDocs(g.docs, g.byId.get(ids[0])!.title).hits.filter(h => ids.includes(h.doc.id));
    assert.equal(found.length, ids.length);
  }
});

test('형식: 본문을 보여 줄 수 없는 PDF · 이미지는 본문 없이 설명만 갖고, Markdown 자료는 설명과 본문을 갖는다', () => {
  for (const d of g.docs) {
    assert.ok(d.summary.trim(), `${d.id}: 설명 없음`);
    if (d.format === 'md') assert.ok(d.body.trim(), `${d.id}: 본문 없음`);
    else assert.equal(d.body, '', `${d.id}: 비텍스트 형식에 본문이 있음`);
  }
  assert.ok(g.docs.some(d => d.format !== 'md'), '비텍스트 형식 예시 없음');
});

test('홍보 데모 규모: 정확히 5,000개 가상 문서이고 네 영역 · 여러 MOC · 하위 색인 · 프로젝트 안내로 군집을 이룬다', () => {
  assert.equal(DEMO_DOC_COUNT, 5000);
  assert.equal(demoDataset.files.length, 5000);
  assert.equal(g.docs.length, 5000);
  const count = (kind: string) => g.docs.filter(d => d.kind === kind).length;
  assert.equal(g.areas.length, 4);
  assert.ok(g.mocs.length >= 14, 'MOC 14개 이상');
  assert.ok(count('subindex') >= 80, '하위 색인 80개 이상');
  assert.ok(count('guide') >= 20, '프로젝트 안내 20개 이상');
  for (const area of g.areas) assert.ok(g.docs.filter(d => g.areaOf.get(d.id) === area.id).length >= 500, `${area.path}: 문서 500개 이상`);
  // 한 색인에 몰지 않는다: 주 분류로 올린 하위 문서는 색인마다 90개 이하
  for (const d of g.docs) assert.ok((g.children.get(d.id) ?? []).length <= 90, `${d.path}: 하위 ${(g.children.get(d.id) ?? []).length}개`);
  // 안내 문서 층위: 라우터 → 영역 → 하위 색인 → 하위 하위 색인 · 안내 → 자료(깊이 5까지)
  assert.ok(Math.max(...g.docs.map(d => g.depth.get(d.id) ?? 0)) >= 5);
  // MOC는 두 영역 이상의 자료를 잇는다(교차 연결)
  for (const moc of g.mocs) {
    const areas = new Set((g.outLinks.get(moc.id) ?? []).map(t => g.areaOf.get(t)).filter(Boolean));
    assert.ok(areas.size >= 2, `${moc.path}: 한 영역 자료만 연결`);
  }
  // 자료끼리의 본문 링크(같은 시리즈 앞 기록 · 다른 영역 관련 자료)가 문서 수보다 많다
  assert.ok(g.relations.length > 2 * g.docs.length, `관계 ${g.relations.length}`);
});

test('홍보 데모 확장: 기존 1,000개는 경로 · 제목 · 자료 본문이 그대로이고, 기존 색인 줄도 모두 남는다. 새 자료 제목은 겹치지 않는다', () => {
  const core = demoCoreFiles();
  assert.equal(core.length, DEMO_CORE_COUNT);
  const byPath = new Map(demoDataset.files.map(f => [f.path, f]));
  for (const f of core) {
    const now = byPath.get(f.path);
    assert.ok(now, f.path);
    assert.equal(now.title, f.title, f.path);
    assert.equal(now.summary, f.summary, f.path);
    if (f.path.includes('/')) assert.equal(now.body, f.body, `${f.path}: 자료 본문 보존`);
    else { const lines = new Set(now.body.split('\n')); for (const line of f.body.split('\n')) assert.ok(lines.has(line), `${f.path}: 색인 줄 보존 — ${line.slice(0, 40)}`); }
  }
  const corePaths = new Set(core.map(f => f.path)), coreTitles = new Set(core.map(f => f.title));
  const added = demoDataset.files.filter(f => !corePaths.has(f.path));
  assert.equal(added.length, DEMO_DOC_COUNT - DEMO_CORE_COUNT);
  const titles = added.map(f => f.title);
  assert.equal(new Set(titles).size, titles.length, '새 자료 제목 중복');
  for (const t of titles) assert.ok(!coreTitles.has(t), `기존 제목과 겹침: ${t}`);
  // 형식도 섞여 있다(본문 없는 PDF · 이미지)
  assert.ok(added.some(f => /\.pdf$/.test(f.path)) && added.some(f => /\.jpg$/.test(f.path)));
});

test('홍보 데모 색인 규칙: 안내 문서는 100줄을 넘지 않고, 링크는 볼트 안 상대경로만 쓴다', () => {
  for (const f of demoDataset.files) {
    if (!f.path.includes('/')) assert.ok(f.body.split('\n').length <= 100, `${f.path}: ${f.body.split('\n').length}줄`);
    for (const link of parseLinks(f.body)) {
      assert.ok(!/^([a-z]+:|\/|~)/i.test(link.href), `${f.path} → ${link.href}: 절대 · 외부 주소`);
      const r = resolveHref(f.path, link.href);
      assert.equal(r.type, 'path', `${f.path} → ${link.href}`);
    }
  }
});

test('홍보 데모: 수작업 대표 문서 · 공유 원문 · 시연 경로의 제목과 본문이 그대로이고, 합성 표시가 남는다', () => {
  const keep: [string, string, string][] = [
    ['CLAUDE.md', 'CLAUDE.md', '데모용 가상 볼트'],
    ['work.md', '업무', '업무 영역의 색인'],
    ['personal.md', '개인', '개인 영역의 색인'],
    ['project-nova.md', '노바 웹사이트 개편 안내', '기획서 → 정보 구조 → 회의록'],
    ['project-ml-study.md', '머신러닝 스터디 안내', '주차별 정리'],
    ['moc-AI-활용.md', 'AI 활용', '업무에서 쓰는 지시문'],
    ['src-work/projects/nova/brief.md', '노바 개편 기획서', '첫 방문자가 30초 안에'],
    [SHARED, '회의록 요약 프롬프트', '확인 필요'],
    ['src-work/content/style-guide.md', '글쓰기 스타일 가이드', '한 문장에는 한 가지 내용만'],
    ['src-personal/journal/weekly-review.md', '주간 회고', '업무 회고와 이름은 같지만']
  ];
  for (const [path, title, text] of keep) {
    const f = demoDataset.files.find(x => x.path === path);
    assert.ok(f, path);
    assert.equal(f.title, title, path);
    assert.ok(f.body.includes(text), `${path}: 본문 보존`);
  }
  assert.equal(demoDataset.synthetic, true);
  const router = demoDataset.files.find(f => f.path === 'CLAUDE.md')!;
  assert.match(router.body, /가상/);
  assert.equal((router.body.match(/^\| \[src-/gm) ?? []).length, 3, '외부 자료 폴더 3개(가상)');
});
