import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// 설정 계약(후속 연결 준비): 로컬 settings.json에는 볼트 절대경로 vaultPath 하나만 둔다.
// 원문 루트(src-*)는 따로 설정하지 않고 후속 연결기가 vaultPath/CLAUDE.md의 등록 표에서 찾는다. 지금은 이 파일을 읽지 않는다.
const root = new URL('../', import.meta.url);

test('설정 예시: settings.example.json은 vaultPath 하나만 갖고 값은 비어 있다(개인 절대경로 없음)', () => {
  const example = JSON.parse(readFileSync(new URL('settings.example.json', root), 'utf8'));
  assert.deepEqual(Object.keys(example), ['vaultPath']);
  assert.equal(example.vaultPath, '');
});

test('설정 보호: 실제 로컬 settings.json은 git에서 제외한다', () => {
  const ignore = readFileSync(new URL('.gitignore', root), 'utf8').split('\n').map(l => l.trim());
  assert.ok(ignore.includes('/settings.json'));
});
