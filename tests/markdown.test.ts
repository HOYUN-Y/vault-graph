import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLinks, relativeHref, resolveHref, splitBody, stripLinks } from '../src/core/markdown';

const hrefs = (text: string) => parseLinks(text).map(l => l.href);
const target = (from: string, href: string) => {
  const t = resolveHref(from, href);
  return t.type === 'path' ? t.path : t.type === 'invalid' ? `!${t.reason}` : t.type;
};

test('standard Markdown links: reads [label](href) with angle brackets and titles; images are not links', () => {
  const links = parseLinks('- [Nova brief](src-work/nova/brief.md) — description\n[Meeting notes](<src-work/meeting notes.md> "title") ![Board](src-work/board.png)');
  assert.deepEqual(links.map(l => [l.label, l.href]), [['Nova brief', 'src-work/nova/brief.md'], ['Meeting notes', '<src-work/meeting notes.md>']]);
});

test('code and escapes: link syntax in fenced blocks, inline code (multi-line too) and \\[...](...) stays as an example', () => {
  const text = [
    '[real](a.md) `[code](b.md)` \\[escaped](c.md) \\\\[after two backslashes](d.md)',
    '```', '[fence](e.md)', '```',
    '~~~md', '[tilde fence](f.md)', '~~~',
    '`multi line', '[in code](g.md)`', '',
    '[end](h.md)'
  ].join('\n');
  assert.deepEqual(hrefs(text), ['a.md', 'd.md', 'h.md']);
  // Body display and search use the same rule: only real links become labels, examples stay verbatim
  const stripped = stripLinks(text);
  assert.ok(stripped.startsWith('real `[code](b.md)` \\[escaped](c.md)'));
  assert.ok(stripped.includes('[fence](e.md)') && stripped.endsWith('end'));
  assert.equal(splitBody(text).filter(p => p.type === 'link').length, 3);
});

test('relative paths: relative to the linking document, parent (..), same folder (./), outside the vault is broken', () => {
  assert.equal(target('work--projects.md', 'src-work/nova/brief.md'), 'src-work/nova/brief.md');
  assert.equal(target('src-work/nova/ia.md', 'brief.md'), 'src-work/nova/brief.md');
  assert.equal(target('src-work/nova/ia.md', './brief.md'), 'src-work/nova/brief.md');
  assert.equal(target('src-work/nova/reviews/r1.md', '../../lumen/metrics.md'), 'src-work/lumen/metrics.md');
  assert.equal(target('src-personal/learning/p.md', '../../work--operations.md'), 'work--operations.md');
  assert.equal(target('src-work/a.md', '../../outside.md'), '!outside vault');
  assert.equal(target('work.md', '/Users/someone/vault/a.md'), '!absolute path');
  assert.equal(target('work.md', 'src-work\\a.md'), '!backslash path');
});

test('encoding and anchors: %20 spaces, percent-encoded and NFD Korean resolve to the NFC canonical path; #anchor and ?query are stripped', () => {
  assert.equal(target('work.md', 'src-work/%ED%9A%8C%EC%9D%98%20%EB%A9%94%EB%AA%A8.md'), 'src-work/회의 메모.md');
  assert.equal(target('work.md', '<src-work/회의 메모.md>'), 'src-work/회의 메모.md');
  assert.equal(target('work.md', 'src-work/회의 메모.md'.normalize('NFD')), 'src-work/회의 메모.md');
  const anchored = resolveHref('moc-dev.md', 'src-work/lumen/metrics.md#conversion');
  assert.deepEqual(anchored, { type: 'path', path: 'src-work/lumen/metrics.md', anchor: 'conversion' });
  assert.equal(target('work.md', 'src-work/a.md?v=2'), 'src-work/a.md');
  assert.equal(target('work.md', '#in this document'), 'anchor');
  assert.equal(target('work.md', 'https://example.com/a.md'), 'external');
  assert.equal(target('work.md', 'mailto:someone@example.com'), 'external');
  assert.equal(target('work.md', 'src-work/%E0%A4%A.md'), '!invalid encoding');
});

test('relative paths for writing: builds the path from document to target, encoding only spaces and parentheses, and resolves back to the same source file', () => {
  const cases: [string, string][] = [
    ['work--operations.md', 'src-work/operations/prompts/meeting summary prompt.md'],
    ['src-work/projects/nova/ia.md', 'src-work/projects/nova/brief.md'],
    ['src-work/projects/nova/reviews/review-2.md', 'src-work/projects/lumen/metrics (draft).md'],
    ['src-personal/learning/prompt-patterns.md', 'src-work/operations/prompts/meeting summary prompt.md']
  ];
  for (const [from, to] of cases) {
    const href = relativeHref(from, to);
    assert.ok(!/\s/.test(href), href);
    assert.equal(target(from, href), to, `${from} → ${href}`);
  }
  assert.equal(relativeHref('src-work/projects/nova/ia.md', 'src-work/projects/nova/brief.md'), 'brief.md');
  assert.equal(relativeHref('src-personal/learning/a.md', 'src-work/b.md'), '../../src-work/b.md');
});
