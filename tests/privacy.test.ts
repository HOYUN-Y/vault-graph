import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { LEDGER, PrivacyRuleError, SECRET_RE, isPrivate, isSecretPath, loadPrivatePaths, makeRedactor } from '../server/privacy';

// 공개 저장소에서는 외부 스킬이나 로컬 Python 모듈 없이 고정 사례로 규칙을 검증한다.
function ours(root: string, router: string): string[] | 'error' {
  try { return [...loadPrivatePaths(root, router)].sort(); } catch (e) { if (e instanceof PrivacyRuleError) return 'error'; throw e; }
}
const same = (root: string, router: string, want: string[] | 'error') => {
  assert.deepEqual(ours(root, router), want, router);
};

test('비밀정보 이름 규칙: .key는 Keynote라 제외', () => {
  for (const name of ['env', 'env.txt', 'hermes_env.txt', 'mykey.txt', 'keys.txt', 'local.env', 'cert.p12', 'api_token.txt', '비밀번호.txt']) assert.ok(SECRET_RE.test(name), name);
  for (const name of ['nearby-keyword.ts', 'slides.key', 'notes.md']) assert.ok(!SECRET_RE.test(name), name);
  assert.ok(isSecretPath('src-x/credentials/a.md') && !isSecretPath('src-x/notes/a.md'));
});

test('비공개 합집합 · 장부 오류를 검증하고, 해석할 수 없으면 차단한다(fail closed)', () => {
  const t = mkdtempSync(path.join(tmpdir(), 'sbv-priv-'));
  try {
    mkdirSync(path.join(t, '.secondbrain'));
    const ledger = path.join(t, LEDGER);
    const router = '- 비공개: `legacy`\n- 비공개 장부: .secondbrain/private-paths.txt\n';
    same(t, '- 비공개: `legacy` · `src-x/폴더/`\n', ['legacy', 'src-x/폴더']);
    same(t, router, 'error'); // 장부 없음
    writeFileSync(ledger, '\ufeff# comment\r\nsrc-x/비밀/\r\nnot-created-yet\nsrc-x/[token]\n');
    same(t, router, ['legacy', 'not-created-yet', 'src-x/[token]', 'src-x/비밀']);
    for (const malformed of ['# Router\n', '- **비공개 장부:** .secondbrain/private-paths.txt\n', '- 비공개 장부: other.txt\n',
      '- 비공개 장부: .secondbrain/private-paths.txt\n- 비공개 장부: .secondbrain/private-paths.txt\n']) same(t, malformed, 'error');
    for (const invalid of ['/', '/outside', '../outside', 'a/../b', 'C:/outside', 'a\\b', 'a/*', 'a//b', 'a/?', 'a/./b']) {
      writeFileSync(ledger, invalid);
      same(t, router, 'error');
    }
    writeFileSync(ledger, Buffer.from([0xff]));
    same(t, router, 'error'); // 인코딩 오류
    rmSync(ledger);
    same(t, '- **비공개 장부:** .secondbrain/private-paths.txt\n', 'error');
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test('비공개 판정은 같은 경로이거나 그 아래만(접두 낱말 오인 없음), NFD 표기도 같게 본다', () => {
  const priv = new Set(['src-x/비밀', 'legacy']);
  assert.ok(isPrivate('src-x/비밀', priv) && isPrivate('src-x/비밀/a.md', priv) && isPrivate('src-x/비밀/a.md'.normalize('NFD'), priv));
  assert.ok(!isPrivate('src-x/비밀문서.md', priv) && !isPrivate('legacy2', priv) && !isPrivate('src-y/legacy', priv));
});

test('지우기: 비공개 전체 경로 · 마지막 이름(NFC · NFD, 한 글자 이름 포함) · 로컬 절대경로를 브라우저로 보내기 전에 바꾼다', () => {
  const redact = makeRedactor(new Set(['src-x/연봉 협상', 'legacy', 'src-y/숨', 'Q']));
  const leaks = ['연봉 협상', '연봉 협상'.normalize('NFD'), 'legacy', '/Users/', '~/Documents', 'C:\\', 'D:/', '/mnt/', '/srv/', 'file:', '\\\\nas', '/Volumes/'];
  const sample = [
    'a src-x/연봉 협상/b.md · ' + '연봉 협상'.normalize('NFD') + ' · legacy',
    '이름만: 숨 , (숨) · Q 단독 · ' + '숨'.normalize('NFD') + ' 끝',
    '/Users/someone/Library/CloudStorage/Drive/x.md · ~/Documents/v · C:\\Users\\a · D:/data/b.md',
    '[링크](/mnt/backup/vault/a.md) · /srv/files/x · file:///Volumes/Ext/a.md · \\\\nas\\share\\a · "/Volumes/Ext SSD/x"'
  ].join('\n');
  const out = redact(sample);
  for (const bad of leaks) assert.ok(!out.includes(bad), `${bad}: ${out}`);
  assert.ok(!/(^|[^\p{L}])숨([^\p{L}]|$)/u.test(out) && !/(^|[^\p{L}])Q([^\p{L}]|$)/u.test(out), out);
  // 짧은 이름이 다른 낱말 일부일 때와 상대경로 · 웹 주소 · 낱말 사이 '/'는 그대로 둔다
  const keep = redact('숨결 · Quiet · src-work/a/b.md · https://example.com/a/b · 읽기/쓰기');
  assert.equal(keep, '숨결 · Quiet · src-work/a/b.md · https://example.com/a/b · 읽기/쓰기');
});
