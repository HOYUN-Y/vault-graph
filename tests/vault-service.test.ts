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
/** Simulated atomic save: write a temp file, then rename */
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

test('no settings = demo, then connected: status and graph responses contain no absolute paths or private names', async () => {
  const { fx, settings, svc, done } = setup();
  try {
    rmSync(settings);
    await svc.refresh();
    assert.equal(svc.status().mode, 'demo');
    writeFileSync(settings, JSON.stringify({ vaultPath: fx.vault }));
    await svc.refresh();
    assert.equal(svc.status().state, 'connected');
    assert.equal(svc.status().structure, 'indexed', 'the structure mode (not a path) is in the status');
    assert.deepEqual(clean(svc.status(), fx.base), []);
    assert.deepEqual(clean(svc.graph(), fx.base), []);
    writeFileSync(settings, JSON.stringify({ vaultPath: 'relative/vault' }));
    await svc.refresh();
    assert.equal(svc.status().state, 'invalid');
    assert.equal(paths(svc).length, 0, 'no earlier real data is sent on a settings error');
  } finally { done(); }
});

test('watching: link add, description edit and delete via atomic save apply automatically and bump the version', async () => {
  const { fx, svc, done } = setup();
  try {
    await svc.start();
    const v0 = svc.status().version;
    const work = path.join(fx.vault, 'work.md');
    const original = readFileSync(work, 'utf8');
    atomicWrite(work, original + '\n- [New material](src-work/projects/new.md) — first description');
    await wait(700);
    assert.ok(paths(svc).includes('src-work/projects/new.md'), 'addition applied');
    assert.ok(svc.status().version > v0);
    atomicWrite(work, original + '\n- [New material](src-work/projects/new.md) — edited description');
    await wait(700);
    const files = svc.graph().files as { path: string; summary: string }[];
    assert.equal(files.find(f => f.path === 'src-work/projects/new.md')?.summary, 'edited description');
    atomicWrite(work, original);
    await wait(700);
    assert.ok(!paths(svc).includes('src-work/projects/new.md'), 'deletion applied');
  } finally { done(); }
});

test('private changes: adding to the ledger removes the node and preview; a rule error blocks (no data) and recovers once fixed', async () => {
  const { fx, svc, done } = setup();
  try {
    await svc.refresh();
    assert.ok(paths(svc).includes(BRIEF));
    assert.equal((await svc.preview(opaqueId(BRIEF))).state, 'ok');
    appendFileSync(path.join(fx.vault, LEDGER), 'src-work/projects/nova/brief.md\n');
    assert.equal((await svc.preview(opaqueId(BRIEF))).state, 'private', 'latest rules apply per request even before publishing (by alias)');
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

test('disconnection is not deletion: the last verified result stays as disconnected and recovers on return; switching vaults drops earlier data', async () => {
  const { fx, settings, svc, done } = setup();
  const other = makeFixture();
  try {
    await svc.refresh();
    const count = paths(svc).length;
    renameSync(fx.vault, fx.vault + '-away');
    await svc.refresh();
    assert.equal(svc.status().state, 'unavailable');
    assert.equal(svc.status().stale, true);
    assert.equal(paths(svc).length, count, 'last verified view kept while disconnected');
    renameSync(fx.vault + '-away', fx.vault);
    await svc.refresh();
    assert.equal(svc.status().state, 'connected');
    assert.equal(svc.status().stale, false);
    const key = svc.status().vaultKey;
    writeFileSync(path.join(other.vault, 'work.md'), '# Work\n- [Other vault material](src-work/other-only.md)\n');
    writeFileSync(settings, JSON.stringify({ vaultPath: other.vault }));
    await svc.refresh();
    assert.notEqual(svc.status().vaultKey, key, 'when the vault key changes the UI drops earlier real data');
    assert.ok(paths(svc).includes('src-work/other-only.md'));
  } finally { done(); rmSync(other.base, { recursive: true, force: true }); }
});

test('pre-publish policy check: if the ledger changes during a build, the old-policy result is not published', async () => {
  let fx: ReturnType<typeof makeFixture> | null = null;
  let once = false;
  const s = setup({ beforePublish: () => { if (!once && fx) { once = true; appendFileSync(path.join(fx.vault, LEDGER), 'src-work/projects/nova/brief.md\n'); } } });
  fx = s.fx;
  try {
    await s.svc.refresh();
    assert.ok(once);
    assert.ok(!paths(s.svc).includes(BRIEF), 'only the result rebuilt with the new policy is published');
  } finally { s.done(); }
});

test('preview: reads by opaque ID only and reports distinct states; no old body is returned if the policy changes mid-read', async () => {
  let hook: (() => void) | null = null;
  const s = setup({ beforePreviewReturn: () => { hook?.(); } });
  try {
    await s.svc.refresh();
    const p = (rel: string) => s.svc.preview(opaqueId(rel));
    const ok = await p(BRIEF);
    assert.equal(ok.state, 'ok');
    assert.ok(ok.body!.includes('Sample source body') && ok.body!.includes('[local path]') && !ok.body!.includes('/Users/'));
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

test('request boundary: loopback, Host and same origin only; POST requires Origin', () => {
  const base = { remoteAddress: '127.0.0.1', port: 5180, method: 'GET', headers: { host: '127.0.0.1:5180' } as Record<string, string> };
  assert.equal(guard(base), null);
  assert.equal(guard({ ...base, remoteAddress: '192.168.0.9' }), 403);
  assert.equal(guard({ ...base, headers: { host: 'evil.example:5180' } }), 403, 'DNS rebinding');
  assert.equal(guard({ ...base, headers: { host: '127.0.0.1:5180', origin: 'http://evil.example' } }), 403);
  assert.equal(guard({ ...base, headers: { host: '127.0.0.1:5180', 'sec-fetch-site': 'cross-site' } }), 403);
  assert.equal(guard({ ...base, method: 'POST' }), 403);
  assert.equal(guard({ ...base, method: 'POST', headers: { host: 'localhost:5180', origin: 'http://localhost:5180' } }), null);
});

test('unparseable request targets (e.g. absolute form http://[) are rejected with 400 instead of crashing the server', () => {
  for (const bad of ['http://[', 'http://[::1', '//[', '', undefined]) assert.equal(badTarget(bad), true, String(bad));
  assert.equal(foreignAuthority('http://evil.com/api/vault/graph', 5180), true, 'different authority');
  assert.equal(foreignAuthority('http://127.0.0.1:9999/api/vault/graph', 5180), true, 'different port');
  assert.equal(foreignAuthority('file:///etc/hosts', 5180), true);
  assert.equal(foreignAuthority('http://127.0.0.1:5180/api/vault/graph', 5180), false);
  assert.equal(foreignAuthority('/api/vault/graph', 5180), false);
  for (const ok of ['/', '/api/vault/status', '/src/main.tsx?t=1', '/%E0%A4%A', 'http://127.0.0.1:5180/']) assert.equal(badTarget(ok), false, ok);
});

test('I/O failure kinds: only absence is missing, permission is denied, others are read-error; a disconnected vault is offline (not deleted)', async () => {
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
  } finally { try { chmodSync(file, 0o644); } catch { /* already restored */ } s.done(); }
});

test('private real-path bypass blocked: when a whole root, nested folder, file or unregistered private alias points at the same physical source, no public alias yields a node or body', async () => {
  const MATS = ['src-alias/projects/nova/brief.md', 'src-alias/projects/nova/board.png', 'src-alias/projects/nova/회의 메모.md', 'src-alias/projects/archive', 'src-alias/big.md'];
  const cases: [string, (vault: string, extA: string) => void, string[]][] = [
    ['whole registered root (src-work)', v => appendFileSync(path.join(v, LEDGER), 'src-work\n'), MATS],
    ['nested folder prefix (other alias)', v => appendFileSync(path.join(v, LEDGER), 'src-alias/projects/nova\n'), MATS.slice(0, 3)],
    ['single file (other alias)', v => appendFileSync(path.join(v, LEDGER), 'src-work/projects/nova/brief.md\n'), MATS.slice(0, 1)],
    // Turn the router's private 'legacy-diary' into an unregistered alias of the same physical folder
    ['unregistered private alias (legacy-diary)', (v, extA) => symlinkSync(path.join(extA, 'projects'), path.join(v, 'legacy-diary')), MATS.slice(0, 4)]
  ];
  for (const [name, apply, gone] of cases) {
    const s = setup();
    try {
      await s.svc.refresh();
      const ids = gone.map(rel => opaqueId(rel));
      assert.ok(ids.every(id => (s.svc.graph().meta as Record<string, string>)[id]), `${name}: public at first`);
      apply(s.fx.vault, s.fx.extA);
      await s.svc.refresh();
      const now = paths(s.svc);
      for (const rel of gone) assert.ok(!now.includes(rel), `${name}: node remains ${rel}`);
      for (const id of ids) { const r = await s.svc.preview(id); assert.notEqual(r.state, 'ok', name); assert.equal(r.body, undefined, name); }
      assert.ok(now.includes('src-alias/binary.md') || name.startsWith('whole registered root'), `${name}: unrelated materials remain`);
      assert.deepEqual(clean(s.svc.graph(), s.fx.base), [], `${name}: response leak`);
    } finally { s.done(); }
  }
});

test('policy change right before return (whole root made private): the read body is not returned', async () => {
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
