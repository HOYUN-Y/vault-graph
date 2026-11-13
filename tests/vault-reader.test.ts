import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { opaqueId, readVault } from '../src/core/vault';
import { readSnapshot, toPublic } from '../server/vault-reader';
import { PRIVATE_WORDS, makeFixture } from './vault-fixture';

const leaks = (value: unknown, extra: string[] = []) => {
  const text = JSON.stringify(value, (_k, v) => (v instanceof Map ? [...v] : v));
  return [...PRIVATE_WORDS, ...extra, '/Users/', '/Volumes/', 'D:\\', 'TOKEN='].filter(w => text.includes(w) || text.includes(w.normalize('NFD')));
};

test('스냅숏: 안내 문서만 읽고, 연결 자료는 색인의 이름 · 설명 · 상대경로로 노드화한다(비공개 · 비밀 · 절대경로 노출 없음)', async () => {
  const fx = makeFixture();
  try {
    const s = await readSnapshot(fx.vault);
    assert.equal(s.state, 'connected', s.reason ?? '');
    assert.deepEqual(leaks(toPublic(s), [fx.base]), [], '응답에 비공개 이름 · 절대경로가 없어야 함');
    assert.ok(!s.files.some(f => f.path === 'moc-이탈.md'), '볼트 밖을 가리키는 안내 문서 링크는 읽지 않음');
    assert.ok(s.problems.some(p => p.includes('안내 문서 1개')), s.problems.join());
    const paths = s.files.map(f => f.path).sort();
    for (const p of ['CLAUDE.md', 'work.md', 'work--projects.md', 'personal.md', 'moc-기획.md', 'project-nova.md']) assert.ok(paths.includes(p), p);
    assert.ok(!paths.includes('AGENTS.md'));
    // 별칭 두 개(src-work · src-alias)와 앵커 · 인코딩 · NFD 표기가 같은 원문 하나로 합쳐진다
    assert.equal(paths.filter(p => p.endsWith('nova/brief.md')).length, 1);
    assert.ok(paths.includes('src-alias/projects/nova/brief.md'), '정규 경로는 이름순 첫 등록 루트');
    assert.equal(paths.filter(p => p.endsWith('회의 메모.md')).length, 1);
    // 공개 별칭으로 비공개 실경로 우회 불가 · 비밀 이름 · 장부 · 라우터 비공개 항목은 노드가 아님
    assert.ok(!paths.some(p => /실경로비공개|api_token|hidden-plan|legacy-diary|연봉협상메모/.test(p)));
    const fmt = (p: string) => s.files.find(f => f.path === p)?.format;
    assert.equal(fmt('src-alias/projects/nova/board.png'), 'image');
    assert.equal(fmt('src-alias/projects/nova/slides.key'), 'other');
    assert.equal(fmt('src-alias/projects/archive'), 'dir');
    const meta = (p: string) => s.materials.get(opaqueId(p))?.meta;
    assert.equal(meta('src-offline/a.md'), 'unreachable', '닿지 않는 루트는 삭제가 아니라 연결 안 됨');
    assert.equal(meta('src-work/gone.md'), 'missing');
    assert.equal(meta('src-work/escape-link/escaped.md'), 'outside', '심볼릭 링크로 등록 루트 밖');
    assert.deepEqual(s.roots.sort(), ['src-alias', 'src-offline', 'src-work']);
    // 본문 지우기: 라우터의 비공개 줄 · 원본 위치 절대경로 · 비공개 링크
    const router = s.files.find(f => f.path === 'CLAUDE.md')!.body;
    assert.ok(!router.includes('비공개 장부') && router.includes('[로컬 경로]'));
    const personal = s.files.find(f => f.path === 'personal.md')!.body;
    assert.equal((personal.match(/\[비공개 링크\]/g) ?? []).length, 2);
    const proj = s.files.find(f => f.path === 'project-nova.md')!.body;
    assert.ok(proj.includes('(src-alias/projects/nova/brief.md)'));
    assert.ok(s.counts.privateRules === 6 && s.counts.hiddenLinks >= 4, JSON.stringify(s.counts));
    // 볼트 밖 상대 링크 · 의도적 제외(AGENTS.md) · 읽지 않은 안내 문서는 이름만 남겨, 화면 변환에서 깨진 링크 경고가 되지 않는다
    const work = s.files.find(f => f.path === 'work.md')!.body;
    assert.ok(work.includes('바깥 프로젝트 [볼트 밖 링크]') && !work.includes('../outside'), work);
    assert.ok(work.includes('에이전트 지침 [연결 제외 문서]') && !work.includes('(AGENTS.md)'));
    assert.ok(router.includes('[읽지 않은 안내 문서]') && !router.includes('(moc-이탈.md)'));
    assert.deepEqual(readVault(toPublic(s).files).problems, [], '화면 변환(readVault) 구조 문제 0');
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test('규칙 실패는 차단(데이터 0), 볼트 접근 불가 · 라우터 없음은 상태로 구분한다', async () => {
  const fx = makeFixture();
  try {
    writeFileSync(path.join(fx.vault, '.secondbrain/private-paths.txt'), '../outside\n');
    const blocked = await readSnapshot(fx.vault);
    assert.equal(blocked.state, 'blocked');
    assert.equal(blocked.files.length + blocked.materials.size, 0);
    assert.deepEqual(leaks(toPublic(blocked), [fx.base]), []);
    assert.equal((await readSnapshot(path.join(fx.base, 'nope'))).state, 'unavailable');
    assert.equal((await readSnapshot('relative/path')).state, 'invalid');
    rmSync(path.join(fx.vault, 'CLAUDE.md'));
    assert.equal((await readSnapshot(fx.vault)).state, 'invalid');
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test('라우터 · 파일 목록에서 닿은 파일 목록은 읽지 않고, 영역 색인이 링크한 수작업 색인과 표식 목록은 처리한다', async () => {
  const fx = makeFixture();
  try {
    writeFileSync(path.join(fx.vault, 'CLAUDE.md'), '[목록](catalog.md)\n[이전 목록](catalog--old.md)\n[업무](work.md)\n- 비공개 장부: .secondbrain/private-paths.txt\n');
    writeFileSync(path.join(fx.vault, 'work.md'), '# 업무\n[수작업](catalog--manual.md)\n[업무 목록](catalog--gen.md)');
    // 표식 없는 이전 형식 목록: 라우터에서 닿으므로 그 아래 쪽까지 모두 따라가지 않는다
    writeFileSync(path.join(fx.vault, 'catalog--old.md'), '# 이전 목록\n[쪽](catalog--old--p1.md)');
    writeFileSync(path.join(fx.vault, 'catalog--old--p1.md'), '# 쪽\n[파일](src-work/a.md)');
    // 영역 색인이 링크한 자동 목록: 문서는 남기되 목록 링크는 확장하지 않는다
    writeFileSync(path.join(fx.vault, 'catalog--gen.md'), '<!-- secondbrain-index-sync:catalog 자동 생성 파일 -->\n# 업무 목록\n[쪽](catalog--gen--p1.md)');
    writeFileSync(path.join(fx.vault, 'catalog--manual.md'), '# 직접 쓴 색인');
    const pages = Array.from({ length: 505 }, (_, i) => `[목록](catalog--p${i}.md)`).join('\n');
    writeFileSync(path.join(fx.vault, 'catalog.md'), '<!-- secondbrain-index-sync:catalog 자동 생성 파일 -->\n# 목록\n' + pages);
    const s = await readSnapshot(fx.vault);
    assert.deepEqual(s.files.map(f => f.path).sort(), ['CLAUDE.md', 'catalog--gen.md', 'catalog--manual.md', 'work.md']);
    assert.equal(s.counts.guides, 4);
    assert.equal(s.materials.size, 0);
    assert.deepEqual(s.problems, []);
    assert.ok(s.files.find(f => f.path === 'catalog--gen.md')?.body.includes('확장하지 않습니다'));
    const router = s.files.find(f => f.path === 'CLAUDE.md')!.body;
    assert.ok(router.includes('목록 [파일 목록 · 연결 제외]') && router.includes('이전 목록 [파일 목록 · 연결 제외]'));
    assert.deepEqual(readVault(toPublic(s).files).problems, []);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test('비공개 이름과 겹친 공개 경로는 주소를 변조하지 않고 링크째 숨긴다', async () => {
  const fx = makeFixture();
  try {
    writeFileSync(path.join(fx.vault, 'CLAUDE.md'), '[업무](work.md)\n- 비공개: `src-work/legacy`\n- 비공개 장부: .secondbrain/private-paths.txt\n');
    // 이 파일은 비공개 폴더 아래가 아니지만 이름을 가리면 주소가 달라진다.
    writeFileSync(path.join(fx.vault, 'work.md'), '[자료](src-work/showcase-legacy/result.json)');
    const s = await readSnapshot(fx.vault);
    assert.equal(s.materials.size, 0);
    assert.ok(s.files.find(f => f.path === 'work.md')?.body.includes('[비공개 링크]'));
    assert.deepEqual(readVault(toPublic(s).files).problems, []);
    assert.ok(!JSON.stringify(toPublic(s)).includes('legacy'));
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});
