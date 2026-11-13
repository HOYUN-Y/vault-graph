// Test vault on disk (temp folder): router, ledger, guide documents, src-* symlinks, aliases, private, secret and escaping links.
// All names are synthetic. PRIVATE_WORDS must never appear in any API response or log.
// '숨' stays Korean so leak checks cover NFC and NFD forms; '회의 메모.md' is stored as NFD on purpose.
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const PRIVATE_WORDS = ['salary-talks', '숨', 'strongbox', 'legacy-diary', 'hidden-plan.md', 'api_token.txt', 'quietroom'];

export function makeFixture(base = mkdtempSync(path.join(tmpdir(), 'sbv-fx-'))) {
  const vault = path.join(base, 'vault'), extA = path.join(base, 'drive-a'), extOut = path.join(base, 'outside');
  const w = (file: string, text: string) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); };
  // External source files (simulated drive)
  w(path.join(extA, 'projects/nova/brief.md'), '# Nova brief\n\nSample source body. The path /Users/someone/secret/x.md is redacted.\n');
  w(path.join(extA, 'projects/nova/board.png'), 'png');
  w(path.join(extA, 'projects/nova/회의 메모.md'.normalize('NFD')), '# Meeting notes\n');
  w(path.join(extA, 'projects/nova/slides.key'), 'keynote');
  w(path.join(extA, 'projects/nova/api_token.txt'), 'TOKEN=should-never-be-read');
  w(path.join(extA, 'quietroom/plan.md'), '# Private real-path source\n');
  w(path.join(extA, 'big.md'), '#'.repeat(600 * 1024));
  writeFileSync(path.join(extA, 'binary.md'), Buffer.from([0xff, 0xfe, 0x00]));
  w(path.join(extOut, 'escaped.md'), '# Source outside the root\n');
  mkdirSync(path.join(extA, 'projects/archive'), { recursive: true });
  symlinkSync(extOut, path.join(extA, 'escape-link'));
  // Vault
  mkdirSync(vault, { recursive: true });
  symlinkSync(extA, path.join(vault, 'src-work'));
  symlinkSync(extA, path.join(vault, 'src-alias'));          // second alias of the same real folder
  symlinkSync(path.join(base, 'missing-drive'), path.join(vault, 'src-offline')); // unreachable root
  w(path.join(vault, '.secondbrain/private-paths.txt'), '# ledger\nsrc-alias/quietroom\nsrc-work/projects/nova/hidden-plan.md\n');
  // English markers here; tests/vault-reader.test.ts covers the Korean ones.
  w(path.join(vault, 'CLAUDE.md'), [
    '# Router',
    '- Private: `legacy-diary` · `src-work/salary-talks` · `src-work/숨` · `strongbox`',
    '- Private ledger: .secondbrain/private-paths.txt',
    '## Areas', '- [Work](work.md) — work index', '- [Personal](personal.md)',
    '## Topics', '- [Planning](moc-planning.md)', '- [Escape guide](moc-escape.md)',
    '## Projects', '- [Nova](project-nova.md)',
    '## External folders', '| Link | Original location | Area |', '| --- | --- | --- |',
    '| [src-work](src-work) | /Users/someone/Library/CloudStorage/Drive-A | Work |',
    '| [src-alias](src-alias) | /Volumes/Ext/alias | Work |',
    '| [src-offline](src-offline) | D:\\drive\\offline | Personal |',
    'Private note: this line is removed legacy-diary'
  ].join('\n'));
  w(path.join(vault, 'work.md'), [
    '# Work', '- [Work · Projects](work--projects.md)',
    '- [Nova brief](src-work/projects/nova/brief.md) — redesign scope and criteria',
    '- [Same brief (alias)](src-alias/projects/nova/brief.md) — alias link',
    '- [Board](src-work/projects/nova/board.png) — image · see 숨',
    '- [Slides](src-work/projects/nova/slides.key) — presentation file',
    '- [Token](src-work/projects/nova/api_token.txt)',
    '- [Alias bypass](src-work/quietroom/plan.md) — tries a private real path through a public alias',
    '- [Hidden plan](src-work/projects/nova/hidden-plan.md)',
    '- [Escape](src-work/escape-link/escaped.md) — outside the root',
    '- [Archive](src-work/projects/archive/) — folder link',
    '- [Big file](src-work/big.md)', '- [Garbled text](src-work/binary.md)',
    '- [Offline](src-offline/a.md) — disconnected drive',
    '- [Missing file](src-work/gone.md)',
    '- [Outside project](../outside/escaped.md) — relative link outside the vault (href not sent)',
    '- [Agent instructions](AGENTS.md) — top-level document intentionally not linked',
    '`[in code](src-work/code.md)` the strongbox mention is redacted'
  ].join('\n'));
  w(path.join(vault, 'work--projects.md'), '# Work · Projects\n- [Nova](project-nova.md)\n- [Meeting notes](src-work/projects/nova/%ED%9A%8C%EC%9D%98%20%EB%A9%94%EB%AA%A8.md)\n');
  w(path.join(vault, 'personal.md'), '# Personal\n- [Diary](legacy-diary/a.md)\n- [Salary](src-work/salary-talks/a.md)\n');
  w(path.join(vault, 'moc-planning.md'), '# Planning\n- [Nova brief](src-work/projects/nova/brief.md#scope)\n');
  w(path.join(vault, 'project-nova.md'), '# Nova guide\n- [Brief](src-alias/projects/nova/brief.md)\n- [Meeting notes](<src-work/projects/nova/회의 메모.md>)\n');
  w(path.join(vault, 'AGENTS.md'), '# Instructions\n');
  // Looks like a guide document but is a symlink to a file outside the vault (must not be read)
  w(path.join(extOut, 'leak.md'), '# Document outside the vault\nquietroom body\n');
  symlinkSync(path.join(extOut, 'leak.md'), path.join(vault, 'moc-escape.md'));
  return { base, vault, extA, extOut };
}
