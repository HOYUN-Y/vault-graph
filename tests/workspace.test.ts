import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readSnapshot } from '../server/vault-reader';
import { VaultService } from '../server/vault-service';
import { readVault, opaqueId } from '../src/core/vault';

test('workspace mode: opens only declared indexes, classifies internal materials and blocks on settings switch (Korean headers)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-workspace-'));
  const vault = path.join(dir, 'vault');
  const settings = path.join(dir, 'settings.json');
  await fs.mkdir(path.join(vault, 'area', 'nested'), { recursive: true });
  await fs.writeFile(path.join(vault, 'AGENTS.md'), '| 분야 | 폴더 | 먼저 읽을 안내 문서 |\n| --- | --- | --- |\n| Work | `area` | [Work](area/guide.md) |\n');
  await fs.writeFile(path.join(vault, 'area', 'guide.md'), '# Work\n[Sub](nested/INDEX.md)\n[Material](../root.md)\n');
  await fs.writeFile(path.join(vault, 'area', 'nested', 'INDEX.md'), '# Index\n[Material](../../root.md)\n');
  await fs.writeFile(path.join(vault, 'root.md'), '# Material\n[Fake](area/hidden.md)\n');
  await fs.writeFile(path.join(vault, 'area', 'hidden.md'), '# Not read');
  await fs.writeFile(settings, JSON.stringify({ vaultPath: vault, structure: 'workspace', routerPath: 'AGENTS.md' }));
  const service = new VaultService(settings);
  try {
    await service.start();
    const snapshot = await readSnapshot(vault, 'workspace', 'AGENTS.md');
    assert.equal(snapshot.state, 'connected');
    assert.equal(snapshot.counts.guides, 3);
    assert.equal(snapshot.files.find(f => f.path === 'root.md')?.kind, 'material');
    assert.equal(snapshot.files.some(f => f.path === 'area/hidden.md'), false);
    const docs = readVault(snapshot.files).docs;
    assert.equal(docs.find(d => d.path === 'area/guide.md')?.kind, 'area');
    assert.equal(docs.find(d => d.path === 'area/nested/INDEX.md')?.kind, 'subindex');
    assert.equal(docs.find(d => d.path === 'root.md')?.parent, opaqueId('area/guide.md'));
    assert.equal((await service.preview(opaqueId('root.md'))).state, 'ok');
    await fs.writeFile(settings, JSON.stringify({ vaultPath: vault, structure: 'indexed', routerPath: 'AGENTS.md' }));
    assert.equal((await service.preview(opaqueId('root.md'))).state, 'changed');
    await service.refresh();
  } finally { service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('workspace mode: an area table without explicit links is not an empty success', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-invalid-'));
  try {
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '| Area | Folder | Index |\n| --- | --- | --- |\n| Work | `area` | `area/guide.md` |\n');
    assert.equal((await readSnapshot(dir, 'workspace', 'AGENTS.md')).state, 'invalid');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('workspace mode: external symlinks and private aliases are never opened (English private marker)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-boundary-'));
  const vault = path.join(dir, 'vault');
  await fs.mkdir(path.join(vault, 'area'), { recursive: true });
  await fs.writeFile(path.join(dir, 'outside.md'), 'outside source');
  await fs.writeFile(path.join(vault, 'private.md'), 'private source');
  await fs.symlink(path.join(dir, 'outside.md'), path.join(vault, 'outside.md'));
  await fs.symlink(path.join(vault, 'private.md'), path.join(vault, 'alias.md'));
  await fs.writeFile(path.join(vault, 'AGENTS.md'), '| Area | Folder | Index |\n| --- | --- | --- |\n| A | `area` | [Index](area/index.md) |\n\nPrivate: `private.md`\n');
  await fs.writeFile(path.join(vault, 'area', 'index.md'), '[Outside](../outside.md)\n[Alias](../alias.md)\n');
  const settings = path.join(dir, 'settings.json');
  await fs.writeFile(settings, JSON.stringify({ vaultPath: vault, structure: 'workspace', routerPath: 'AGENTS.md' }));
  const service = new VaultService(settings);
  try {
    await service.start();
    assert.equal(service.graph().files.some(f => f.path === 'alias.md'), false);
    assert.equal((await service.preview(opaqueId('outside.md'))).state, 'outside');
    assert.equal(JSON.stringify(service.graph()).includes('private source'), false);
  } finally { service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('workspace mode: a top-level area folder links a top-level index', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-root-index-'));
  try {
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '| Area | Folder | Index |\n| --- | --- | --- |\n| A | `.` | [A](CONTENT.md) |\n');
    await fs.writeFile(path.join(dir, 'CONTENT.md'), '# A');
    const s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    assert.equal(s.state, 'connected');
    assert.equal(s.files.find(f => f.path === 'CONTENT.md')?.kind, 'area');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('invalid structure or router settings do not silently fall back to the demo', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-settings-'));
  const settings = path.join(dir, 'settings.json');
  const service = new VaultService(settings);
  try {
    for (const value of [
      { vaultPath: dir, structure: 'other' },
      { vaultPath: dir, routerPath: '../AGENTS.md' },
      { vaultPath: dir, routerPath: '' },
      { vaultPath: 42 },
    ]) {
      await fs.writeFile(settings, JSON.stringify(value));
      await service.refresh();
      assert.equal(service.status().state, 'invalid');
      assert.equal(service.graph().files.length, 0);
    }
  } finally { service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('relative paths from a nested router and registered external roots', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-nested-router-'));
  const vault = path.join(dir, 'vault');
  const external = path.join(dir, 'external');
  await fs.mkdir(path.join(vault, 'intro'), { recursive: true });
  await fs.mkdir(path.join(vault, 'area'), { recursive: true });
  await fs.mkdir(external);
  await fs.symlink(external, path.join(vault, 'src-extra'));
  await fs.writeFile(path.join(external, 'doc.md'), 'registered external material');
  await fs.writeFile(path.join(vault, 'intro', 'AGENTS.md'), '| Area | Folder | Guide |\n| --- | --- | --- |\n| A | `../area` | [A](../area/guide.md) |\n\n[External](../src-extra/)\n');
  await fs.writeFile(path.join(vault, 'area', 'guide.md'), '[Material](../src-extra/doc.md)');
  const settings = path.join(dir, 'settings.json');
  await fs.writeFile(settings, JSON.stringify({ vaultPath: vault, structure: 'workspace', routerPath: 'intro/AGENTS.md' }));
  const service = new VaultService(settings);
  try {
    await service.start();
    assert.equal(service.status().state, 'connected');
    assert.equal((await service.preview(opaqueId('src-extra/doc.md'))).state, 'ok');
    assert.equal(service.graph().files.find(f => f.path === 'intro/AGENTS.md')?.kind, 'router');
  } finally { service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('atomic saves, deletion and restore of a nested index trigger refresh', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-refresh-'));
  const folder = path.join(dir, 'area');
  await fs.mkdir(folder);
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '| Area | Folder | Index |\n| --- | --- | --- |\n| A | `area` | [A](area/guide.md) |\n');
  await fs.writeFile(path.join(folder, 'guide.md'), '[Sub](INDEX.md)');
  const index = path.join(folder, 'INDEX.md');
  await fs.writeFile(index, '[Material](one.md)');
  await fs.writeFile(path.join(folder, 'one.md'), 'one');
  await fs.writeFile(path.join(folder, 'two.md'), 'two');
  const settings = path.join(dir, 'settings.json');
  await fs.writeFile(settings, JSON.stringify({ vaultPath: dir, structure: 'workspace', routerPath: 'AGENTS.md' }));
  const service = new VaultService(settings, { pollMs: 30, debounceMs: 10 });
  const waitFor = async (predicate: () => boolean) => {
    const deadline = Date.now() + 3000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(predicate());
  };
  try {
    await service.start();
    await fs.writeFile(index + '.new', '[Material](two.md)');
    await fs.rename(index + '.new', index);
    await waitFor(() => service.graph().files.some(f => f.path === 'area/two.md'));
    await fs.unlink(index);
    await waitFor(() => !service.graph().files.some(f => f.path === 'area/two.md'));
    await fs.writeFile(index, '[Material](one.md)');
    await waitFor(() => service.graph().files.some(f => f.path === 'area/one.md'));
  } finally { service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('C: material folders and index locations are independent and may share a folder', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-c-'));
  try {
    await fs.mkdir(path.join(dir, 'content'));
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '| Guide | Area | Folder |\n| --- | --- | --- |\n| [Content](CONTENT.md) | Content | `content/` |\n| [Clients](CLIENTS.md) | Clients | `.` |\n| [Other](OTHER.md) | Other | `.` |\n');
    for (const file of ['CONTENT.md', 'CLIENTS.md', 'OTHER.md']) await fs.writeFile(path.join(dir, file), '# Index');
    const s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    assert.equal(s.state, 'connected');
    assert.equal(s.files.filter(f => f.kind === 'area').length, 3);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('the ledger and aliases of its real path are excluded from the graph and preview (English ledger marker)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-ledger-'));
  await fs.mkdir(path.join(dir, '.secondbrain'));
  await fs.mkdir(path.join(dir, 'area'));
  await fs.writeFile(path.join(dir, '.secondbrain/private-paths.txt'), '# synthetic ledger comment\nprivate-stuff\n');
  await fs.symlink(path.join(dir, '.secondbrain/private-paths.txt'), path.join(dir, 'alias.txt'));
  await fs.writeFile(path.join(dir, 'AGENTS.md'), 'Private ledger: .secondbrain/private-paths.txt\n| Area | Folder | Index |\n| --- | --- | --- |\n| A | `area` | [A](area/guide.md) |');
  await fs.writeFile(path.join(dir, 'area/guide.md'), '[Ledger](../.secondbrain/private-paths.txt)\n[Alias](../alias.txt)');
  const settings = path.join(dir, 'settings.json');
  await fs.writeFile(settings, JSON.stringify({ vaultPath: dir, structure: 'workspace', routerPath: 'AGENTS.md' }));
  const service = new VaultService(settings);
  try {
    await service.start();
    const output = JSON.stringify(service.graph());
    assert.equal(output.includes('alias.txt'), false);
    assert.equal(output.includes('private-paths.txt'), false);
    assert.equal(output.includes('synthetic ledger comment'), false);
    assert.equal((await service.preview(opaqueId('alias.txt'))).state, 'gone');
    assert.equal((await service.preview(opaqueId('.secondbrain/private-paths.txt'))).state, 'gone');
  } finally { service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('only exact guide tables and INDEX inside the area are opened; MOCs under an area are classified', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-read-boundary-'));
  await fs.mkdir(path.join(dir, 'work'));
  await fs.mkdir(path.join(dir, 'personal'));
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '| Folder | Guide | Area |\n| --- | --- | --- |\n| `work` | [Work](work/work.md) | Work |\n');
  await fs.writeFile(path.join(dir, 'work/work.md'), '| Topic | Index |\n| --- | --- |\n| Topic | [MOC](moc-meet.md) |\n\n| Date | Minutes guide |\n| --- | --- |\n| Today | [Meeting](minutes.md) |\n\n[Outside index](../personal/INDEX.md)\n[Inside index](INDEX.md)\n');
  await fs.writeFile(path.join(dir, 'work/moc-meet.md'), '[Material](meeting.md)');
  await fs.writeFile(path.join(dir, 'work/meeting.md'), 'plain material');
  await fs.writeFile(path.join(dir, 'work/minutes.md'), '[Hidden doc](deep.md)');
  await fs.writeFile(path.join(dir, 'work/INDEX.md'), '# Inside index');
  await fs.writeFile(path.join(dir, 'personal/INDEX.md'), '[Hidden doc](deep.md)');
  const original = fs.readFile;
  const reads: string[] = [];
  fs.readFile = (async (...args: Parameters<typeof fs.readFile>) => { reads.push(String(args[0])); return original(...args); }) as typeof fs.readFile;
  try {
    const s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    const result = readVault(s.files);
    assert.equal(result.docs.find(d => d.path === 'work/meeting.md')?.parent, opaqueId('work/moc-meet.md'));
    assert.equal(result.docs.find(d => d.path === 'work/INDEX.md')?.kind, 'subindex');
    assert.equal(result.docs.find(d => d.path === 'personal/INDEX.md')?.kind, 'material');
    assert.equal(result.docs.find(d => d.path === 'work/minutes.md')?.kind, 'material');
    assert.ok(!reads.some(p => p.endsWith('/minutes.md') || p.endsWith('/personal/INDEX.md') || p.endsWith('/meeting.md')));
    assert.ok(!s.files.some(f => f.path.endsWith('deep.md')));
  } finally { fs.readFile = original; await fs.rm(dir, { recursive: true, force: true }); }
});

test('keeps the invalid area declaration warning and duplicate index conflicts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-invalid-area-'));
  try {
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '| Area | Folder | Index |\n| --- | --- | --- |\n| A | `.` | `A.md` |\n');
    let s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    assert.equal(s.state, 'invalid');
    assert.equal(s.counts.problems, 1);
    assert.match(s.problems[0], /area declaration/);
    await fs.writeFile(path.join(dir, 'A.md'), '# A');
    await fs.symlink(path.join(dir, 'A.md'), path.join(dir, 'alias.md'));
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '| Area | Folder | Index |\n| --- | --- | --- |\n| A | `.` | [A](A.md) |\n| B | `.` | [B](alias.md) |\n');
    s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    assert.equal(s.state, 'invalid');
    assert.match(s.problems[0], /Skipped 2 /);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('the 500 guide limit warns once', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-limit-'));
  try {
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '| Area | Folder | Index |\n| --- | --- | --- |\n| A | `.` | [A](area.md) |\n');
    const links = Array.from({ length: 505 }, (_, i) => `| [Index](g${i}.md) |`).join('\n');
    await fs.writeFile(path.join(dir, 'area.md'), `| Index |\n| --- |\n${links}\n`);
    await Promise.all(Array.from({ length: 505 }, (_, i) => fs.writeFile(path.join(dir, `g${i}.md`), '| Index |\n| --- |\n| [Another guide](extra.md) |')));
    await fs.writeFile(path.join(dir, 'extra.md'), '# Guide');
    const s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    assert.equal(s.counts.guides, 500);
    assert.equal(s.problems.filter(p => p.includes('500 guide document limit')).length, 1);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('handles NFD paths, encoding, column order and tables in comments or code', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-nfd-'));
  const name = '분야'.normalize('NFD');
  await fs.mkdir(path.join(dir, name));
  await fs.writeFile(path.join(dir, name, '안내.md'.normalize('NFD')), '# Guide');
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '<!--\n| Area | Folder | Index |\n| --- | --- | --- |\n| Fake | `.` | [Fake](fake.md) |\n-->\n```md\n| Area | Folder | Index |\n| --- | --- | --- |\n| Fake | `.` | [Fake](fake.md) |\n```\n| Index | Area | Folder |\n| --- | --- | --- |\n| [Guide](%EB%B6%84%EC%95%BC/%EC%95%88%EB%82%B4.md#top) | Field | `분야` |\n');
  try {
    const s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    assert.equal(s.state, 'connected');
    assert.equal(s.files.filter(f => f.kind === 'area').length, 1);
    assert.equal(s.files.some(f => f.path === 'fake.md' && f.kind !== 'material'), false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('switching the router setting during a preview read does not return the old body', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-preview-race-'));
  await fs.mkdir(path.join(dir, 'area'));
  const router = '| Area | Folder | Index |\n| --- | --- | --- |\n| A | `area` | [A](area/a.md) |\n';
  await fs.writeFile(path.join(dir, 'AGENTS.md'), router);
  await fs.writeFile(path.join(dir, 'OTHER.md'), router);
  await fs.writeFile(path.join(dir, 'area/a.md'), '[Material](doc.md)');
  await fs.writeFile(path.join(dir, 'area/doc.md'), 'synthetic source');
  const settings = path.join(dir, 'settings.json');
  const config = (routerPath: string) => JSON.stringify({ vaultPath: dir, structure: 'workspace', routerPath });
  await fs.writeFile(settings, config('AGENTS.md'));
  const service = new VaultService(settings, { beforePreviewReturn: async () => { await fs.writeFile(settings, config('OTHER.md')); } });
  try {
    await service.start();
    const firstKey = service.status().vaultKey;
    assert.equal((await service.preview(opaqueId('area/doc.md'))).state, 'changed');
    await service.refresh();
    assert.notEqual(service.status().vaultKey, firstKey);
  } finally { service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('indexed mode keeps materials and src root links inside HTML comments', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-a-comment-'));
  try {
    await fs.mkdir(path.join(dir, 'src-a'));
    await fs.writeFile(path.join(dir, 'src-a/c.md'), 'synthetic material');
    await fs.writeFile(path.join(dir, 'CLAUDE.md'), '[Work](work.md)\n<!-- [Root](src-a/) -->');
    await fs.writeFile(path.join(dir, 'work.md'), '<!-- [Commented material](src-a/c.md) -->');
    const s = await readSnapshot(dir);
    assert.equal(s.state, 'connected');
    assert.ok(s.roots.includes('src-a'));
    assert.ok(s.files.some(f => f.path === 'src-a/c.md'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('the policy folder and its physical aliases are blocked; a same-named outside folder is allowed (Korean ledger marker in AGENTS.md)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-policy-dir-'));
  const vault = path.join(dir, 'vault');
  const ext = path.join(dir, 'external');
  await fs.mkdir(path.join(vault, '.secondbrain'), { recursive: true });
  await fs.mkdir(path.join(vault, 'area'));
  await fs.mkdir(path.join(ext, '.secondbrain'), { recursive: true });
  await fs.writeFile(path.join(vault, '.secondbrain/private-paths.txt'), '# ledger\n');
  await fs.writeFile(path.join(vault, '.secondbrain/note.md'), 'internal policy');
  await fs.writeFile(path.join(ext, '.secondbrain/public.md'), 'outside synthetic material');
  await fs.symlink(path.join(vault, '.secondbrain'), path.join(vault, 'policy-alias'));
  await fs.symlink(ext, path.join(vault, 'src-ext'));
  await fs.writeFile(path.join(vault, 'AGENTS.md'), '비공개 장부: .secondbrain/private-paths.txt\n| Area | Folder | Index |\n| --- | --- | --- |\n| A | `area` | [A](area/a.md) |\n[External](src-ext/)');
  await fs.writeFile(path.join(vault, 'area/a.md'), '[Policy folder](../.secondbrain/)\n[Policy file](../.secondbrain/note.md)\n[Folder alias](../policy-alias/)\n[File alias](../policy-alias/note.md)\n[External](../src-ext/.secondbrain/public.md)');
  const settings = path.join(dir, 'settings.json');
  const service = new VaultService(settings);
  try {
    for (const config of [
      { vaultPath: vault, structure: 'workspace', routerPath: 'AGENTS.md' },
      { vaultPath: vault, structure: 'indexed', routerPath: 'CLAUDE.md' },
    ]) {
      if (config.structure === 'indexed') {
        await fs.writeFile(path.join(vault, 'CLAUDE.md'), 'Private ledger: .secondbrain/private-paths.txt\n[Work](work.md)\n[External](src-ext/)');
        await fs.writeFile(path.join(vault, 'work.md'), '[Policy folder](.secondbrain/)\n[File](policy-alias/note.md)\n[External](src-ext/.secondbrain/public.md)');
      }
      await fs.writeFile(settings, JSON.stringify(config));
      await service.refresh();
      const graph = service.graph();
      assert.equal(graph.state, 'connected');
      assert.ok(!graph.files.some(f => f.path.startsWith('policy-alias') || f.path === '.secondbrain' || f.path.startsWith('.secondbrain/')));
      assert.ok(graph.files.some(f => f.path === 'src-ext/.secondbrain/public.md'));
      assert.equal((await service.preview(opaqueId('src-ext/.secondbrain/public.md'))).state, 'ok');
      assert.equal((await service.preview(opaqueId('policy-alias/note.md'))).state, 'gone');
    }
  } finally { service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('workspace mode enforces guide size, UTF-8 and time limits and the material preview boundary', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-guide-limits-'));
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '| Area | Folder | Index |\n| --- | --- | --- |\n| A | `.` | [A](area.md) |');
  await fs.writeFile(path.join(dir, 'area.md'), '| Guide |\n| --- |\n| [Size](large.md) |\n| [Encoding](bad.md) |\n| [Time](slow.md) |\n\n[Big material](large.txt)\n[Broken material](bad.txt)');
  await fs.writeFile(path.join(dir, 'large.md'), 'x'.repeat(1024 * 1024 + 1));
  await fs.writeFile(path.join(dir, 'bad.md'), Buffer.from([0xff]));
  await fs.writeFile(path.join(dir, 'slow.md'), 'waiting');
  await fs.writeFile(path.join(dir, 'large.txt'), 'x'.repeat(512 * 1024 + 1));
  await fs.writeFile(path.join(dir, 'bad.txt'), Buffer.from([0xff]));
  const settings = path.join(dir, 'settings.json');
  await fs.writeFile(settings, JSON.stringify({ vaultPath: dir, structure: 'workspace', routerPath: 'AGENTS.md' }));
  const original = fs.readFile;
  const reads: string[] = [];
  fs.readFile = (async (...args: Parameters<typeof fs.readFile>) => {
    reads.push(String(args[0]));
    if (String(args[0]).endsWith('/slow.md')) return new Promise<never>(() => {});
    return original(...args);
  }) as typeof fs.readFile;
  const service = new VaultService(settings);
  try {
    await service.start();
    assert.equal(service.status().state, 'connected');
    assert.equal(service.status().counts?.guides, 2);
    assert.ok(service.status().problems.some(p => p.includes('Did not read 3 ')));
    assert.ok(!reads.some(p => p.endsWith('/large.md')));
    assert.equal((await service.preview(opaqueId('large.txt'))).state, 'too-large');
    assert.equal((await service.preview(opaqueId('bad.txt'))).state, 'not-text');
  } finally { fs.readFile = original; service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});
