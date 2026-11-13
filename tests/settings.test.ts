import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Settings contract: the local settings.json holds the absolute vault path (vaultPath) plus structure and routerPath.
// Source roots (src-*) are not configured separately; they are found in the router's registered table. This test does not read the real file.
const root = new URL('../', import.meta.url);

test('settings example: sets the default structure and router, with an empty vault path', () => {
  const example = JSON.parse(readFileSync(new URL('settings.example.json', root), 'utf8'));
  assert.deepEqual(Object.keys(example), ['vaultPath', 'structure', 'routerPath']);
  assert.equal(example.structure, 'indexed');
  assert.equal(example.routerPath, 'CLAUDE.md');
  assert.equal(example.vaultPath, '');
});

test('settings protection: the real local settings.json is git-ignored', () => {
  const ignore = readFileSync(new URL('.gitignore', root), 'utf8').split('\n').map(l => l.trim());
  assert.ok(ignore.includes('/settings.json'));
});
