import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { LEDGER, PrivacyRuleError, SECRET_RE, isPrivate, isSecretPath, loadPrivatePaths, makeRedactor } from '../server/privacy';

// The public repo checks the rules with fixed cases, without the external skill or a local Python module.
function ours(root: string, router: string): string[] | 'error' {
  try { return [...loadPrivatePaths(root, router)].sort(); } catch (e) { if (e instanceof PrivacyRuleError) return 'error'; throw e; }
}
const same = (root: string, router: string, want: string[] | 'error') => {
  assert.deepEqual(ours(root, router), want, router);
};

test('secret name rule: .key is excluded because it is Keynote', () => {
  for (const name of ['env', 'env.txt', 'hermes_env.txt', 'mykey.txt', 'keys.txt', 'local.env', 'cert.p12', 'api_token.txt', '비밀번호.txt']) assert.ok(SECRET_RE.test(name), name);
  for (const name of ['nearby-keyword.ts', 'slides.key', 'notes.md']) assert.ok(!SECRET_RE.test(name), name);
  assert.ok(isSecretPath('src-x/credentials/a.md') && !isSecretPath('src-x/notes/a.md'));
});

test('Korean markers: private union and ledger errors are checked; unparseable rules block (fail closed)', () => {
  const t = mkdtempSync(path.join(tmpdir(), 'sbv-priv-'));
  try {
    mkdirSync(path.join(t, '.secondbrain'));
    const ledger = path.join(t, LEDGER);
    const router = '- 비공개: `legacy`\n- 비공개 장부: .secondbrain/private-paths.txt\n';
    same(t, '- 비공개: `legacy` · `src-x/folder/`\n', ['legacy', 'src-x/folder']);
    same(t, router, 'error'); // ledger missing
    writeFileSync(ledger, '\ufeff# comment\r\nsrc-x/hidden/\r\nnot-created-yet\nsrc-x/[token]\n');
    same(t, router, ['legacy', 'not-created-yet', 'src-x/[token]', 'src-x/hidden']);
    for (const malformed of ['# Router\n', '- **비공개 장부:** .secondbrain/private-paths.txt\n', '- 비공개 장부: other.txt\n',
      '- 비공개 장부: .secondbrain/private-paths.txt\n- 비공개 장부: .secondbrain/private-paths.txt\n']) same(t, malformed, 'error');
    for (const invalid of ['/', '/outside', '../outside', 'a/../b', 'C:/outside', 'a\\b', 'a/*', 'a//b', 'a/?', 'a/./b']) {
      writeFileSync(ledger, invalid);
      same(t, router, 'error');
    }
    writeFileSync(ledger, Buffer.from([0xff]));
    same(t, router, 'error'); // encoding error
    rmSync(ledger);
    same(t, '- **비공개 장부:** .secondbrain/private-paths.txt\n', 'error');
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test('English markers: lines with the word "private" and "Private ledger:" (any case) work like the Korean ones', () => {
  const t = mkdtempSync(path.join(tmpdir(), 'sbv-priv-en-'));
  try {
    mkdirSync(path.join(t, '.secondbrain'));
    // whole word only: "privately" and "Public" lines are not private
    same(t, '- Private: `legacy` · `src-x/folder/`\n- PRIVATE notes `diary`\n- privately `nope`\n- Public: `open`\n', ['diary', 'legacy', 'src-x/folder']);
    const router = '- private: `legacy`\n- Private ledger: .secondbrain/private-paths.txt\n';
    same(t, router, 'error'); // ledger missing
    writeFileSync(path.join(t, LEDGER), 'src-x/hidden\n');
    same(t, router, ['legacy', 'src-x/hidden']);
    same(t, '- PRIVATE LEDGER: .secondbrain/private-paths.txt\n', ['src-x/hidden']);
    // last case: one Korean plus one English marker is still two markers
    for (const malformed of ['# Router\n', '- Private ledger: other.txt\n', '- **Private ledger:** .secondbrain/private-paths.txt\n',
      '- Private ledger: .secondbrain/private-paths.txt\n- 비공개 장부: .secondbrain/private-paths.txt\n']) same(t, malformed, 'error');
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test('private match is the same path or below only (no prefix confusion), and NFD forms match too', () => {
  const priv = new Set(['src-x/비밀', 'legacy']);
  assert.ok(isPrivate('src-x/비밀', priv) && isPrivate('src-x/비밀/a.md', priv) && isPrivate('src-x/비밀/a.md'.normalize('NFD'), priv));
  assert.ok(!isPrivate('src-x/비밀문서.md', priv) && !isPrivate('legacy2', priv) && !isPrivate('src-y/legacy', priv));
});

test('redaction: private full paths, last names (NFC and NFD, one-letter names too) and local absolute paths are replaced before reaching the browser', () => {
  const redact = makeRedactor(new Set(['src-x/연봉 협상', 'legacy', 'src-y/숨', 'Q']));
  const leaks = ['연봉 협상', '연봉 협상'.normalize('NFD'), 'legacy', '/Users/', '~/Documents', 'C:\\', 'D:/', '/mnt/', '/srv/', 'file:', '\\\\nas', '/Volumes/'];
  const sample = [
    'a src-x/연봉 협상/b.md · ' + '연봉 협상'.normalize('NFD') + ' · legacy',
    'name only: 숨 , (숨) · Q alone · ' + '숨'.normalize('NFD') + ' end',
    '/Users/someone/Library/CloudStorage/Drive/x.md · ~/Documents/v · C:\\Users\\a · D:/data/b.md',
    '[link](/mnt/backup/vault/a.md) · /srv/files/x · file:///Volumes/Ext/a.md · \\\\nas\\share\\a · "/Volumes/Ext SSD/x"'
  ].join('\n');
  const out = redact(sample);
  for (const bad of leaks) assert.ok(!out.includes(bad), `${bad}: ${out}`);
  assert.ok(!/(^|[^\p{L}])숨([^\p{L}]|$)/u.test(out) && !/(^|[^\p{L}])Q([^\p{L}]|$)/u.test(out), out);
  // Short names inside other words, relative paths, web URLs and '/' between words stay as is
  const keep = redact('숨결 · Quiet · src-work/a/b.md · https://example.com/a/b · read/write');
  assert.equal(keep, '숨결 · Quiet · src-work/a/b.md · https://example.com/a/b · read/write');
});
