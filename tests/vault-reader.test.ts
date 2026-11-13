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

test('snapshot: reads only guide documents; materials become nodes from index label, description and relative path (no private, secret or absolute path leaks)', async () => {
  const fx = makeFixture();
  try {
    const s = await readSnapshot(fx.vault);
    assert.equal(s.state, 'connected', s.reason ?? '');
    assert.deepEqual(leaks(toPublic(s), [fx.base]), [], 'response must not contain private names or absolute paths');
    assert.ok(!s.files.some(f => f.path === 'moc-escape.md'), 'a guide link pointing outside the vault is not read');
    assert.ok(s.problems.some(p => p.includes('Did not read 1 linked guide')), s.problems.join());
    const paths = s.files.map(f => f.path).sort();
    for (const p of ['CLAUDE.md', 'work.md', 'work--projects.md', 'personal.md', 'moc-planning.md', 'project-nova.md']) assert.ok(paths.includes(p), p);
    assert.ok(!paths.includes('AGENTS.md'));
    // Two aliases (src-work, src-alias) plus anchor, encoding and NFD forms merge into one source file
    assert.equal(paths.filter(p => p.endsWith('nova/brief.md')).length, 1);
    assert.ok(paths.includes('src-alias/projects/nova/brief.md'), 'canonical path uses the first registered root by name');
    assert.equal(paths.filter(p => p.endsWith('회의 메모.md')).length, 1);
    // No bypass to a private real path via a public alias; secret names, ledger and router private items are not nodes
    assert.ok(!paths.some(p => /quietroom|api_token|hidden-plan|legacy-diary|salary-talks/.test(p)));
    const fmt = (p: string) => s.files.find(f => f.path === p)?.format;
    assert.equal(fmt('src-alias/projects/nova/board.png'), 'image');
    assert.equal(fmt('src-alias/projects/nova/slides.key'), 'other');
    assert.equal(fmt('src-alias/projects/archive'), 'dir');
    const meta = (p: string) => s.materials.get(opaqueId(p))?.meta;
    assert.equal(meta('src-offline/a.md'), 'unreachable', 'an unreachable root means disconnected, not deleted');
    assert.equal(meta('src-work/gone.md'), 'missing');
    assert.equal(meta('src-work/escape-link/escaped.md'), 'outside', 'outside the registered root via symlink');
    assert.deepEqual(s.roots.sort(), ['src-alias', 'src-offline', 'src-work']);
    // Body redaction: router private lines, original-location absolute paths, private links
    const router = s.files.find(f => f.path === 'CLAUDE.md')!.body;
    assert.ok(!/private/i.test(router) && router.includes('[local path]'), router);
    const personal = s.files.find(f => f.path === 'personal.md')!.body;
    assert.equal((personal.match(/\[private link\]/g) ?? []).length, 2);
    const proj = s.files.find(f => f.path === 'project-nova.md')!.body;
    assert.ok(proj.includes('(src-alias/projects/nova/brief.md)'));
    assert.ok(s.counts.privateRules === 6 && s.counts.hiddenLinks >= 4, JSON.stringify(s.counts));
    // Relative links outside the vault, intentional exclusions (AGENTS.md) and unread guides keep only the label, so the UI sees no broken links
    const work = s.files.find(f => f.path === 'work.md')!.body;
    assert.ok(work.includes('Outside project [outside vault]') && !work.includes('../outside'), work);
    assert.ok(work.includes('Agent instructions [excluded document]') && !work.includes('(AGENTS.md)'));
    assert.ok(router.includes('[unread guide]') && !router.includes('(moc-escape.md)'));
    assert.deepEqual(readVault(toPublic(s).files).problems, [], 'no structural problems in the UI conversion (readVault)');
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test('rule failure blocks (no data); vault unreachable and missing router are separate states', async () => {
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

test('catalogs reached from the router or another catalog are not read; hand-written indexes and marked catalogs linked from an area index are handled (Korean ledger marker)', async () => {
  const fx = makeFixture();
  try {
    writeFileSync(path.join(fx.vault, 'CLAUDE.md'), '[Catalog](catalog.md)\n[Old catalog](catalog--old.md)\n[Work](work.md)\n- 비공개 장부: .secondbrain/private-paths.txt\n');
    writeFileSync(path.join(fx.vault, 'work.md'), '# Work\n[Hand-written](catalog--manual.md)\n[Work catalog](catalog--gen.md)');
    // Older catalog without a marker: reached from the router, so none of its pages are followed
    writeFileSync(path.join(fx.vault, 'catalog--old.md'), '# Old catalog\n[Page](catalog--old--p1.md)');
    writeFileSync(path.join(fx.vault, 'catalog--old--p1.md'), '# Page\n[File](src-work/a.md)');
    // Generated catalog linked from an area index: the document stays but its links are not expanded
    writeFileSync(path.join(fx.vault, 'catalog--gen.md'), '<!-- secondbrain-index-sync:catalog generated file -->\n# Work catalog\n[Page](catalog--gen--p1.md)');
    writeFileSync(path.join(fx.vault, 'catalog--manual.md'), '# Hand-written index');
    const pages = Array.from({ length: 505 }, (_, i) => `[Catalog](catalog--p${i}.md)`).join('\n');
    writeFileSync(path.join(fx.vault, 'catalog.md'), '<!-- secondbrain-index-sync:catalog generated file -->\n# Catalog\n' + pages);
    const s = await readSnapshot(fx.vault);
    assert.deepEqual(s.files.map(f => f.path).sort(), ['CLAUDE.md', 'catalog--gen.md', 'catalog--manual.md', 'work.md']);
    assert.equal(s.counts.guides, 4);
    assert.equal(s.materials.size, 0);
    assert.deepEqual(s.problems, []);
    assert.ok(s.files.find(f => f.path === 'catalog--gen.md')?.body.includes('not expanded'));
    const router = s.files.find(f => f.path === 'CLAUDE.md')!.body;
    assert.ok(router.includes('Catalog [catalog · not linked]') && router.includes('Old catalog [catalog · not linked]'));
    assert.deepEqual(readVault(toPublic(s).files).problems, []);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test('a public path overlapping a private name is hidden as a whole link, not rewritten (Korean private marker)', async () => {
  const fx = makeFixture();
  try {
    writeFileSync(path.join(fx.vault, 'CLAUDE.md'), '[Work](work.md)\n- 비공개: `src-work/legacy`\n- 비공개 장부: .secondbrain/private-paths.txt\n');
    // This file is not under the private folder, but redacting the name would change its path.
    writeFileSync(path.join(fx.vault, 'work.md'), '[Material](src-work/showcase-legacy/result.json)');
    const s = await readSnapshot(fx.vault);
    assert.equal(s.materials.size, 0);
    assert.ok(s.files.find(f => f.path === 'work.md')?.body.includes('[private link]'));
    assert.deepEqual(readVault(toPublic(s).files).problems, []);
    assert.ok(!JSON.stringify(toPublic(s)).includes('legacy'));
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});
