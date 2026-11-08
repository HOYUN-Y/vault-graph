import assert from 'node:assert/strict';
import { appendFileSync, chmodSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { opaqueId } from '../src/core/vault';
import { badTarget, foreignAuthority, guard } from '../server/vault-plugin';
import { ioKind } from '../server/vault-reader';
import { VaultService } from '../server/vault-service';
import { PRIVATE_WORDS, makeFixture } from './vault-fixture';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const BRIEF = 'src-alias/projects/nova/brief.md';
const LEDGER = '.secondbrain/private-paths.txt';
/** 원자적 저장 흉내: 임시 파일에 쓰고 이름 바꾸기 */
const atomicWrite = (file: string, text: string) => { writeFileSync(file + '.tmp~', text); renameSync(file + '.tmp~', file); };
const paths = (svc: VaultService) => (svc.graph().files as { path: string }[]).map(f => f.path);
const clean = (value: unknown, base: string) => {
  const text = JSON.stringify(value);
  return [...PRIVATE_WORDS, base, '/Users/', '/Volumes/'].filter(w => text.includes(w));
};

function setup(opts = {}) {
  const fx = makeFixture();
  const settings = path.join(fx.base, 'settings.json');
  writeFileSync(settings, JSON.stringify({ vaultPath: fx.vault }));
  const svc = new VaultService(settings, { pollMs: 150, debounceMs: 40, ...opts });
  return { fx, settings, svc, done: () => { svc.close(); rmSync(fx.base, { recursive: true, force: true }); } };
}

test('설정 없음 = 데모, 설정 후 연결: 상태 · 그래프 응답에 절대경로 · 비공개 이름이 없다', async () => {
  const { fx, settings, svc, done } = setup();
  try {
    rmSync(settings);
    await svc.refresh();
    assert.equal(svc.status().mode, 'demo');
    writeFileSync(settings, JSON.stringify({ vaultPath: fx.vault }));
    await svc.refresh();
    assert.equal(svc.status().state, 'connected');
    assert.deepEqual(clean(svc.status(), fx.base), []);
    assert.deepEqual(clean(svc.graph(), fx.base), []);
    writeFileSync(settings, JSON.stringify({ vaultPath: 'relative/vault' }));
    await svc.refresh();
    assert.equal(svc.status().state, 'invalid');
    assert.equal(paths(svc).length, 0, '설정 오류 때 이전 실제 데이터를 내보내지 않음');
  } finally { done(); }
});

test('변경 감시: 원자적 저장으로 링크 추가 · 설명 수정 · 삭제가 자동 반영되고 버전이 오른다', async () => {
  const { fx, svc, done } = setup();
  try {
    await svc.start();
    const v0 = svc.status().version;
    const work = path.join(fx.vault, 'work.md');
    const original = readFileSync(work, 'utf8');
    atomicWrite(work, original + '\n- [새 자료](src-work/projects/new.md) — 처음 설명');
    await wait(700);
    assert.ok(paths(svc).includes('src-work/projects/new.md'), '추가 반영');
    assert.ok(svc.status().version > v0);
    atomicWrite(work, original + '\n- [새 자료](src-work/projects/new.md) — 고친 설명');
    await wait(700);
    const files = svc.graph().files as { path: string; summary: string }[];
    assert.equal(files.find(f => f.path === 'src-work/projects/new.md')?.summary, '고친 설명');
    atomicWrite(work, original);
    await wait(700);
    assert.ok(!paths(svc).includes('src-work/projects/new.md'), '삭제 반영');
  } finally { done(); }
});

test('비공개 변경: 장부에 추가하면 노드 · 미리보기에서 사라지고, 규칙 오류는 차단(데이터 0) 뒤 고치면 복구된다', async () => {
  const { fx, svc, done } = setup();
  try {
    await svc.refresh();
    assert.ok(paths(svc).includes(BRIEF));
    assert.equal((await svc.preview(opaqueId(BRIEF))).state, 'ok');
    appendFileSync(path.join(fx.vault, LEDGER), 'src-work/projects/nova/brief.md\n');
    assert.equal((await svc.preview(opaqueId(BRIEF))).state, 'private', '게시 전이라도 요청 때 최신 규칙 적용(별칭 기준)');
    await svc.refresh();
    assert.ok(!paths(svc).includes(BRIEF));
    const ledger = readFileSync(path.join(fx.vault, LEDGER), 'utf8');
    writeFileSync(path.join(fx.vault, LEDGER), ledger + '/absolute/not-allowed\n');
    await svc.refresh();
    assert.equal(svc.status().state, 'blocked');
    assert.equal(paths(svc).length, 0);
    assert.equal((await svc.preview(opaqueId('src-alias/projects/nova/회의 메모.md'))).state, 'gone');
    writeFileSync(path.join(fx.vault, LEDGER), ledger);
    await svc.refresh();
    assert.equal(svc.status().state, 'connected');
  } finally { done(); }
});

test('연결 끊김은 삭제가 아니다: 마지막 검증 결과를 끊김으로 유지하고, 돌아오면 복구한다. 볼트를 바꾸면 이전 데이터를 버린다', async () => {
  const { fx, settings, svc, done } = setup();
  const other = makeFixture();
  try {
    await svc.refresh();
    const count = paths(svc).length;
    renameSync(fx.vault, fx.vault + '-away');
    await svc.refresh();
    assert.equal(svc.status().state, 'unavailable');
    assert.equal(svc.status().stale, true);
    assert.equal(paths(svc).length, count, '끊김 동안 마지막 검증 화면 유지');
    renameSync(fx.vault + '-away', fx.vault);
    await svc.refresh();
    assert.equal(svc.status().state, 'connected');
    assert.equal(svc.status().stale, false);
    const key = svc.status().vaultKey;
    writeFileSync(path.join(other.vault, 'work.md'), '# 업무\n- [다른 볼트 자료](src-work/other-only.md)\n');
    writeFileSync(settings, JSON.stringify({ vaultPath: other.vault }));
    await svc.refresh();
    assert.notEqual(svc.status().vaultKey, key, '볼트 식별값이 바뀌면 화면은 이전 실제 데이터를 버린다');
    assert.ok(paths(svc).includes('src-work/other-only.md'));
  } finally { done(); rmSync(other.base, { recursive: true, force: true }); }
});

test('게시 직전 정책 확인: 만드는 사이 장부가 바뀌면 이전 정책 결과를 게시하지 않는다', async () => {
  let fx: ReturnType<typeof makeFixture> | null = null;
  let once = false;
  const s = setup({ beforePublish: () => { if (!once && fx) { once = true; appendFileSync(path.join(fx.vault, LEDGER), 'src-work/projects/nova/brief.md\n'); } } });
  fx = s.fx;
  try {
    await s.svc.refresh();
    assert.ok(once);
    assert.ok(!paths(s.svc).includes(BRIEF), '바뀐 정책으로 다시 만든 결과만 게시');
  } finally { s.done(); }
});

test('미리보기: 불투명 ID로만 읽고 상태를 구분한다. 읽는 사이 정책이 바뀌면 이전 본문을 돌려주지 않는다', async () => {
  let hook: (() => void) | null = null;
  const s = setup({ beforePreviewReturn: () => { hook?.(); } });
  try {
    await s.svc.refresh();
    const p = (rel: string) => s.svc.preview(opaqueId(rel));
    const ok = await p(BRIEF);
    assert.equal(ok.state, 'ok');
    assert.ok(ok.body!.includes('원문 본문 예시') && ok.body!.includes('[로컬 경로]') && !ok.body!.includes('/Users/'));
    assert.equal((await p('src-alias/big.md')).state, 'too-large');
    assert.equal((await p('src-alias/binary.md')).state, 'not-text');
    assert.equal((await p('src-work/gone.md')).state, 'missing');
    assert.equal((await p('src-offline/a.md')).state, 'root-unavailable');
    assert.equal((await p('src-work/escape-link/escaped.md')).state, 'outside');
    assert.equal((await p('src-alias/projects/nova/board.png')).state, 'unsupported');
    assert.equal((await s.svc.preview('d-not-in-graph')).state, 'gone');
    hook = () => { hook = null; appendFileSync(path.join(s.fx.vault, LEDGER), 'src-work/projects/nova/회의 메모.md\n'); };
    const raced = await p('src-alias/projects/nova/회의 메모.md');
    assert.equal(raced.state, 'changed');
    assert.equal(raced.body, undefined);
  } finally { s.done(); }
});

test('요청 경계: 루프백 · Host · 같은 출처만, POST는 Origin 필수', () => {
  const base = { remoteAddress: '127.0.0.1', port: 5180, method: 'GET', headers: { host: '127.0.0.1:5180' } as Record<string, string> };
  assert.equal(guard(base), null);
  assert.equal(guard({ ...base, remoteAddress: '192.168.0.9' }), 403);
  assert.equal(guard({ ...base, headers: { host: 'evil.example:5180' } }), 403, 'DNS 재바인딩');
  assert.equal(guard({ ...base, headers: { host: '127.0.0.1:5180', origin: 'http://evil.example' } }), 403);
  assert.equal(guard({ ...base, headers: { host: '127.0.0.1:5180', 'sec-fetch-site': 'cross-site' } }), 403);
  assert.equal(guard({ ...base, method: 'POST' }), 403);
  assert.equal(guard({ ...base, method: 'POST', headers: { host: 'localhost:5180', origin: 'http://localhost:5180' } }), null);
});

test('요청 대상 해석 실패(예: 절대 형식 http://[)는 서버를 멈추지 않고 400으로 거절할 대상이다', () => {
  for (const bad of ['http://[', 'http://[::1', '//[', '', undefined]) assert.equal(badTarget(bad), true, String(bad));
  assert.equal(foreignAuthority('http://evil.com/api/vault/graph', 5180), true, '다른 authority');
  assert.equal(foreignAuthority('http://127.0.0.1:9999/api/vault/graph', 5180), true, '다른 포트');
  assert.equal(foreignAuthority('file:///etc/hosts', 5180), true);
  assert.equal(foreignAuthority('http://127.0.0.1:5180/api/vault/graph', 5180), false);
  assert.equal(foreignAuthority('/api/vault/graph', 5180), false);
  for (const ok of ['/', '/api/vault/status', '/src/main.tsx?t=1', '/%E0%A4%A', 'http://127.0.0.1:5180/']) assert.equal(badTarget(ok), false, ok);
});

test('입출력 실패 구분: 없음만 missing, 권한은 denied, 그 밖은 read-error. 볼트 끊김은 offline(삭제로 단정하지 않음)', async () => {
  assert.equal(ioKind({ code: 'ENOENT' }), 'missing');
  assert.equal(ioKind({ code: 'ENOTDIR' }), 'missing');
  assert.equal(ioKind({ code: 'EACCES' }), 'denied');
  assert.equal(ioKind({ code: 'EPERM' }), 'denied');
  assert.equal(ioKind({ code: 'EIO' }), 'error');
  assert.equal(ioKind(new Error('x')), 'error');
  const s = setup();
  const file = path.join(s.fx.extA, 'projects/nova/brief.md');
  try {
    await s.svc.refresh();
    chmodSync(file, 0o000);
    const denied = await s.svc.preview(opaqueId(BRIEF));
    assert.equal(denied.state, 'denied');
    assert.equal(denied.body, undefined);
    chmodSync(file, 0o644);
    assert.equal((await s.svc.preview(opaqueId(BRIEF))).state, 'ok');
    renameSync(s.fx.vault, s.fx.vault + '.off');
    assert.equal((await s.svc.preview(opaqueId(BRIEF))).state, 'offline');
    renameSync(s.fx.vault + '.off', s.fx.vault);
  } finally { try { chmodSync(file, 0o644); } catch { /* 이미 복구 */ } s.done(); }
});

test('비공개 실경로 우회 차단: 등록 루트 전체 · 중첩 폴더 · 파일 · 미등록 비공개 별칭이 같은 물리 원문을 가리키면 어떤 공개 별칭으로도 노드 · 본문 0', async () => {
  const MATS = ['src-alias/projects/nova/brief.md', 'src-alias/projects/nova/board.png', 'src-alias/projects/nova/회의 메모.md', 'src-alias/projects/archive', 'src-alias/big.md'];
  const cases: [string, (vault: string, extA: string) => void, string[]][] = [
    ['등록 루트 전체(src-work)', v => appendFileSync(path.join(v, LEDGER), 'src-work\n'), MATS],
    ['중첩 폴더 prefix(다른 별칭 표기)', v => appendFileSync(path.join(v, LEDGER), 'src-alias/projects/nova\n'), MATS.slice(0, 3)],
    ['파일 하나(다른 별칭 표기)', v => appendFileSync(path.join(v, LEDGER), 'src-work/projects/nova/brief.md\n'), MATS.slice(0, 1)],
    // 라우터 비공개 목록의 'legacy-diary'를 같은 물리 폴더로 가는 미등록 별칭으로 만든다
    ['미등록 비공개 별칭(legacy-diary)', (v, extA) => symlinkSync(path.join(extA, 'projects'), path.join(v, 'legacy-diary')), MATS.slice(0, 4)]
  ];
  for (const [name, apply, gone] of cases) {
    const s = setup();
    try {
      await s.svc.refresh();
      const ids = gone.map(rel => opaqueId(rel));
      assert.ok(ids.every(id => (s.svc.graph().meta as Record<string, string>)[id]), `${name}: 처음에는 공개`);
      apply(s.fx.vault, s.fx.extA);
      await s.svc.refresh();
      const now = paths(s.svc);
      for (const rel of gone) assert.ok(!now.includes(rel), `${name}: 노드 남음 ${rel}`);
      for (const id of ids) { const r = await s.svc.preview(id); assert.notEqual(r.state, 'ok', name); assert.equal(r.body, undefined, name); }
      assert.ok(now.includes('src-alias/binary.md') || name.startsWith('등록 루트'), `${name}: 관련 없는 자료는 남음`);
      assert.deepEqual(clean(s.svc.graph(), s.fx.base), [], `${name}: 응답 노출`);
    } finally { s.done(); }
  }
});

test('반환 직전 정책 변경(등록 루트 전체를 비공개로): 읽은 본문을 돌려주지 않는다', async () => {
  let hook: (() => void) | null = null;
  const s = setup({ beforePreviewReturn: () => { hook?.(); } });
  try {
    await s.svc.refresh();
    hook = () => { hook = null; appendFileSync(path.join(s.fx.vault, LEDGER), 'src-work\n'); };
    const r = await s.svc.preview(opaqueId(BRIEF));
    assert.equal(r.state, 'changed');
    assert.equal(r.body, undefined);
    await s.svc.refresh();
    assert.notEqual((await s.svc.preview(opaqueId(BRIEF))).state, 'ok');
  } finally { s.done(); }
});
