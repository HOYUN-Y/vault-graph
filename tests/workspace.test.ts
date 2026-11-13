import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readSnapshot } from '../server/vault-reader';
import { VaultService } from '../server/vault-service';
import { readVault, opaqueId } from '../src/core/vault';

test('작업폴더: 명시된 색인만 열고 내부 자료를 분류하며 설정 전환을 차단한다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-workspace-'));
  const vault = path.join(dir, 'vault');
  const settings = path.join(dir, 'settings.json');
  await fs.mkdir(path.join(vault, 'area', 'nested'), { recursive: true });
  await fs.writeFile(path.join(vault, 'AGENTS.md'), '| 분야 | 폴더 | 먼저 읽을 안내 문서 |\n| --- | --- | --- |\n| 업무 | `area` | [업무](area/guide.md) |\n');
  await fs.writeFile(path.join(vault, 'area', 'guide.md'), '# 업무\n[하위](nested/INDEX.md)\n[자료](../root.md)\n');
  await fs.writeFile(path.join(vault, 'area', 'nested', 'INDEX.md'), '# 색인\n[자료](../../root.md)\n');
  await fs.writeFile(path.join(vault, 'root.md'), '# 자료\n[가짜](area/hidden.md)\n');
  await fs.writeFile(path.join(vault, 'area', 'hidden.md'), '# 읽지 않음');
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

test('작업폴더: 명시 링크 없는 분야 표는 빈 성공이 아니다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-invalid-'));
  try {
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '| 분야 | 폴더 | 색인 |\n| --- | --- | --- |\n| 업무 | `area` | `area/guide.md` |\n');
    assert.equal((await readSnapshot(dir, 'workspace', 'AGENTS.md')).state, 'invalid');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('작업폴더: 외부 심볼릭 링크와 비공개 별칭은 본문을 열지 않는다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-boundary-'));
  const vault = path.join(dir, 'vault');
  await fs.mkdir(path.join(vault, 'area'), { recursive: true });
  await fs.writeFile(path.join(dir, 'outside.md'), '외부 원문');
  await fs.writeFile(path.join(vault, 'private.md'), '비공개 원문');
  await fs.symlink(path.join(dir, 'outside.md'), path.join(vault, 'outside.md'));
  await fs.symlink(path.join(vault, 'private.md'), path.join(vault, 'alias.md'));
  await fs.writeFile(path.join(vault, 'AGENTS.md'), '| 영역 | 폴더 | 색인 |\n| --- | --- | --- |\n| A | `area` | [색인](area/index.md) |\n\n비공개: `private.md`\n');
  await fs.writeFile(path.join(vault, 'area', 'index.md'), '[외부](../outside.md)\n[별칭](../alias.md)\n');
  const settings = path.join(dir, 'settings.json');
  await fs.writeFile(settings, JSON.stringify({ vaultPath: vault, structure: 'workspace', routerPath: 'AGENTS.md' }));
  const service = new VaultService(settings);
  try {
    await service.start();
    assert.equal(service.graph().files.some(f => f.path === 'alias.md'), false);
    assert.equal((await service.preview(opaqueId('outside.md'))).state, 'outside');
    assert.equal(JSON.stringify(service.graph()).includes('비공개 원문'), false);
  } finally { service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('작업폴더: 최상위 분야 폴더에서 최상위 색인을 연결한다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-root-index-'));
  try {
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '| Area | Folder | Index |\n| --- | --- | --- |\n| A | `.` | [A](CONTENT.md) |\n');
    await fs.writeFile(path.join(dir, 'CONTENT.md'), '# A');
    const s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    assert.equal(s.state, 'connected');
    assert.equal(s.files.find(f => f.path === 'CONTENT.md')?.kind, 'area');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('잘못된 구조와 라우터 설정은 데모로 조용히 전환하지 않는다', async () => {
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

test('하위 라우터의 상대경로와 등록 외부 루트', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-nested-router-'));
  const vault = path.join(dir, 'vault');
  const external = path.join(dir, 'external');
  await fs.mkdir(path.join(vault, 'intro'), { recursive: true });
  await fs.mkdir(path.join(vault, 'area'), { recursive: true });
  await fs.mkdir(external);
  await fs.symlink(external, path.join(vault, 'src-extra'));
  await fs.writeFile(path.join(external, 'doc.md'), '등록 외부 자료');
  await fs.writeFile(path.join(vault, 'intro', 'AGENTS.md'), '| Area | Folder | Guide |\n| --- | --- | --- |\n| A | `../area` | [A](../area/guide.md) |\n\n[외부](../src-extra/)\n');
  await fs.writeFile(path.join(vault, 'area', 'guide.md'), '[자료](../src-extra/doc.md)');
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

test('중첩 색인의 원자적 저장과 삭제·복구를 갱신에 반영한다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-refresh-'));
  const folder = path.join(dir, 'area');
  await fs.mkdir(folder);
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '| 분야 | 폴더 | 색인 |\n| --- | --- | --- |\n| A | `area` | [A](area/guide.md) |\n');
  await fs.writeFile(path.join(folder, 'guide.md'), '[하위](INDEX.md)');
  const index = path.join(folder, 'INDEX.md');
  await fs.writeFile(index, '[자료](one.md)');
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
    await fs.writeFile(index + '.new', '[자료](two.md)');
    await fs.rename(index + '.new', index);
    await waitFor(() => service.graph().files.some(f => f.path === 'area/two.md'));
    await fs.unlink(index);
    await waitFor(() => !service.graph().files.some(f => f.path === 'area/two.md'));
    await fs.writeFile(index, '[자료](one.md)');
    await waitFor(() => service.graph().files.some(f => f.path === 'area/one.md'));
  } finally { service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('C: 자료 폴더와 색인 위치가 독립이며 같은 폴더를 공유할 수 있다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-c-'));
  try {
    await fs.mkdir(path.join(dir, 'content'));
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '| Guide | Area | Folder |\n| --- | --- | --- |\n| [콘텐츠](CONTENT.md) | 콘텐츠 | `content/` |\n| [고객](CLIENTS.md) | 고객 | `.` |\n| [기타](OTHER.md) | 기타 | `.` |\n');
    for (const file of ['CONTENT.md', 'CLIENTS.md', 'OTHER.md']) await fs.writeFile(path.join(dir, file), '# 색인');
    const s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    assert.equal(s.state, 'connected');
    assert.equal(s.files.filter(f => f.kind === 'area').length, 3);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('장부와 장부 실경로의 별칭은 그래프와 미리보기에서 제외한다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-ledger-'));
  await fs.mkdir(path.join(dir, '.secondbrain'));
  await fs.mkdir(path.join(dir, 'area'));
  await fs.writeFile(path.join(dir, '.secondbrain/private-paths.txt'), '# 합성 장부 주석\n비공개자료\n');
  await fs.symlink(path.join(dir, '.secondbrain/private-paths.txt'), path.join(dir, 'alias.txt'));
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '비공개 장부: .secondbrain/private-paths.txt\n| 분야 | 폴더 | 색인 |\n| --- | --- | --- |\n| A | `area` | [A](area/guide.md) |');
  await fs.writeFile(path.join(dir, 'area/guide.md'), '[장부](../.secondbrain/private-paths.txt)\n[별칭](../alias.txt)');
  const settings = path.join(dir, 'settings.json');
  await fs.writeFile(settings, JSON.stringify({ vaultPath: dir, structure: 'workspace', routerPath: 'AGENTS.md' }));
  const service = new VaultService(settings);
  try {
    await service.start();
    const output = JSON.stringify(service.graph());
    assert.equal(output.includes('alias.txt'), false);
    assert.equal(output.includes('private-paths.txt'), false);
    assert.equal(output.includes('합성 장부 주석'), false);
    assert.equal((await service.preview(opaqueId('alias.txt'))).state, 'gone');
    assert.equal((await service.preview(opaqueId('.secondbrain/private-paths.txt'))).state, 'gone');
  } finally { service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('정확한 안내 표와 분야 안 INDEX만 본문을 열며 영역 아래 MOC를 분류한다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-read-boundary-'));
  await fs.mkdir(path.join(dir, 'work'));
  await fs.mkdir(path.join(dir, 'personal'));
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '| Folder | Guide | Area |\n| --- | --- | --- |\n| `work` | [업무](work/work.md) | 업무 |\n');
  await fs.writeFile(path.join(dir, 'work/work.md'), '| 주제 | 색인 |\n| --- | --- |\n| 주제 | [MOC](moc-meet.md) |\n\n| 날짜 | 회의록 안내 |\n| --- | --- |\n| 오늘 | [회의](minutes.md) |\n\n[외부 색인](../personal/INDEX.md)\n[내부 색인](INDEX.md)\n');
  await fs.writeFile(path.join(dir, 'work/moc-meet.md'), '[자료](meeting.md)');
  await fs.writeFile(path.join(dir, 'work/meeting.md'), '일반 자료');
  await fs.writeFile(path.join(dir, 'work/minutes.md'), '[숨은 문서](deep.md)');
  await fs.writeFile(path.join(dir, 'work/INDEX.md'), '# 내부 색인');
  await fs.writeFile(path.join(dir, 'personal/INDEX.md'), '[숨은 문서](deep.md)');
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

test('잘못된 분야 선언 경고와 중복 색인 충돌을 보존한다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-invalid-area-'));
  try {
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '| 분야 | 폴더 | 색인 |\n| --- | --- | --- |\n| A | `.` | `A.md` |\n');
    let s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    assert.equal(s.state, 'invalid');
    assert.equal(s.counts.problems, 1);
    assert.match(s.problems[0], /분야 선언/);
    await fs.writeFile(path.join(dir, 'A.md'), '# A');
    await fs.symlink(path.join(dir, 'A.md'), path.join(dir, 'alias.md'));
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '| 분야 | 폴더 | 색인 |\n| --- | --- | --- |\n| A | `.` | [A](A.md) |\n| B | `.` | [B](alias.md) |\n');
    s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    assert.equal(s.state, 'invalid');
    assert.match(s.problems[0], /2개/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('500개 안내 상한은 경고를 한 번 남긴다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-limit-'));
  try {
    await fs.writeFile(path.join(dir, 'AGENTS.md'), '| 분야 | 폴더 | 색인 |\n| --- | --- | --- |\n| A | `.` | [A](area.md) |\n');
    const links = Array.from({ length: 505 }, (_, i) => `| [색인](g${i}.md) |`).join('\n');
    await fs.writeFile(path.join(dir, 'area.md'), `| 색인 |\n| --- |\n${links}\n`);
    await Promise.all(Array.from({ length: 505 }, (_, i) => fs.writeFile(path.join(dir, `g${i}.md`), '| 색인 |\n| --- |\n| [또 다른 안내](extra.md) |')));
    await fs.writeFile(path.join(dir, 'extra.md'), '# 안내');
    const s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    assert.equal(s.counts.guides, 500);
    assert.equal(s.problems.filter(p => p.includes('상한 500')).length, 1);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('NFD 경로·인코딩·열 순서와 주석/코드 표를 처리한다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-nfd-'));
  const name = '분야'.normalize('NFD');
  await fs.mkdir(path.join(dir, name));
  await fs.writeFile(path.join(dir, name, '안내.md'.normalize('NFD')), '# 안내');
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '<!--\n| 분야 | 폴더 | 색인 |\n| --- | --- | --- |\n| 가짜 | `.` | [가짜](fake.md) |\n-->\n```md\n| 분야 | 폴더 | 색인 |\n| --- | --- | --- |\n| 가짜 | `.` | [가짜](fake.md) |\n```\n| Index | Area | Folder |\n| --- | --- | --- |\n| [안내](%EB%B6%84%EC%95%BC/%EC%95%88%EB%82%B4.md#top) | 분야 | `분야` |\n');
  try {
    const s = await readSnapshot(dir, 'workspace', 'AGENTS.md');
    assert.equal(s.state, 'connected');
    assert.equal(s.files.filter(f => f.kind === 'area').length, 1);
    assert.equal(s.files.some(f => f.path === 'fake.md' && f.kind !== 'material'), false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('미리보기 읽는 중 라우터 설정 전환 시 이전 본문을 반환하지 않는다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-preview-race-'));
  await fs.mkdir(path.join(dir, 'area'));
  const router = '| 분야 | 폴더 | 색인 |\n| --- | --- | --- |\n| A | `area` | [A](area/a.md) |\n';
  await fs.writeFile(path.join(dir, 'AGENTS.md'), router);
  await fs.writeFile(path.join(dir, 'OTHER.md'), router);
  await fs.writeFile(path.join(dir, 'area/a.md'), '[자료](doc.md)');
  await fs.writeFile(path.join(dir, 'area/doc.md'), '합성 원문');
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

test('기존 indexed 모드는 HTML 주석 속 자료와 src 루트 링크를 유지한다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-a-comment-'));
  try {
    await fs.mkdir(path.join(dir, 'src-a'));
    await fs.writeFile(path.join(dir, 'src-a/c.md'), '합성 자료');
    await fs.writeFile(path.join(dir, 'CLAUDE.md'), '[업무](work.md)\n<!-- [루트](src-a/) -->');
    await fs.writeFile(path.join(dir, 'work.md'), '<!-- [주석 자료](src-a/c.md) -->');
    const s = await readSnapshot(dir);
    assert.equal(s.state, 'connected');
    assert.ok(s.roots.includes('src-a'));
    assert.ok(s.files.some(f => f.path === 'src-a/c.md'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('정책 폴더와 물리 별칭은 차단하고 외부의 동명 폴더는 허용한다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-policy-dir-'));
  const vault = path.join(dir, 'vault');
  const ext = path.join(dir, 'external');
  await fs.mkdir(path.join(vault, '.secondbrain'), { recursive: true });
  await fs.mkdir(path.join(vault, 'area'));
  await fs.mkdir(path.join(ext, '.secondbrain'), { recursive: true });
  await fs.writeFile(path.join(vault, '.secondbrain/private-paths.txt'), '# 장부\n');
  await fs.writeFile(path.join(vault, '.secondbrain/note.md'), '내부 정책');
  await fs.writeFile(path.join(ext, '.secondbrain/public.md'), '외부 합성 자료');
  await fs.symlink(path.join(vault, '.secondbrain'), path.join(vault, 'policy-alias'));
  await fs.symlink(ext, path.join(vault, 'src-ext'));
  await fs.writeFile(path.join(vault, 'AGENTS.md'), '비공개 장부: .secondbrain/private-paths.txt\n| 분야 | 폴더 | 색인 |\n| --- | --- | --- |\n| A | `area` | [A](area/a.md) |\n[외부](src-ext/)');
  await fs.writeFile(path.join(vault, 'area/a.md'), '[정책 폴더](../.secondbrain/)\n[정책 파일](../.secondbrain/note.md)\n[폴더 별칭](../policy-alias/)\n[파일 별칭](../policy-alias/note.md)\n[외부](../src-ext/.secondbrain/public.md)');
  const settings = path.join(dir, 'settings.json');
  const service = new VaultService(settings);
  try {
    for (const config of [
      { vaultPath: vault, structure: 'workspace', routerPath: 'AGENTS.md' },
      { vaultPath: vault, structure: 'indexed', routerPath: 'CLAUDE.md' },
    ]) {
      if (config.structure === 'indexed') {
        await fs.writeFile(path.join(vault, 'CLAUDE.md'), '비공개 장부: .secondbrain/private-paths.txt\n[업무](work.md)\n[외부](src-ext/)');
        await fs.writeFile(path.join(vault, 'work.md'), '[정책 폴더](.secondbrain/)\n[파일](policy-alias/note.md)\n[외부](src-ext/.secondbrain/public.md)');
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

test('작업폴더 안내의 크기·UTF-8·시간 상한과 자료 미리보기 경계를 지킨다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbv-guide-limits-'));
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '| 분야 | 폴더 | 색인 |\n| --- | --- | --- |\n| A | `.` | [A](area.md) |');
  await fs.writeFile(path.join(dir, 'area.md'), '| 안내 |\n| --- |\n| [크기](large.md) |\n| [인코딩](bad.md) |\n| [시간](slow.md) |\n\n[큰 자료](large.txt)\n[깨진 자료](bad.txt)');
  await fs.writeFile(path.join(dir, 'large.md'), 'x'.repeat(1024 * 1024 + 1));
  await fs.writeFile(path.join(dir, 'bad.md'), Buffer.from([0xff]));
  await fs.writeFile(path.join(dir, 'slow.md'), '대기');
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
    assert.ok(service.status().problems.some(p => p.includes('3개')));
    assert.ok(!reads.some(p => p.endsWith('/large.md')));
    assert.equal((await service.preview(opaqueId('large.txt'))).state, 'too-large');
    assert.equal((await service.preview(opaqueId('bad.txt'))).state, 'not-text');
  } finally { fs.readFile = original; service.close(); await fs.rm(dir, { recursive: true, force: true }); }
});
