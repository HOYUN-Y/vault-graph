import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLinks, relativeHref, resolveHref, splitBody, stripLinks } from '../src/core/markdown';

const hrefs = (text: string) => parseLinks(text).map(l => l.href);
const target = (from: string, href: string) => {
  const t = resolveHref(from, href);
  return t.type === 'path' ? t.path : t.type === 'invalid' ? `!${t.reason}` : t.type;
};

test('표준 Markdown 링크: [이름](주소)와 꺾쇠 · 제목 표기를 읽고, 이미지는 링크로 보지 않는다', () => {
  const links = parseLinks('- [노바 기획서](src-work/nova/brief.md) — 설명\n[회의 메모](<src-work/회의 메모.md> "제목") ![보드](src-work/board.png)');
  assert.deepEqual(links.map(l => [l.label, l.href]), [['노바 기획서', 'src-work/nova/brief.md'], ['회의 메모', '<src-work/회의 메모.md>']]);
});

test('코드 구간 · 이스케이프: 펜스 블록 · 인라인 코드(여러 줄 포함) · \\[…](…) 안의 링크 표기는 예시로 남긴다', () => {
  const text = [
    '[진짜](a.md) `[코드](b.md)` \\[이스케이프](c.md) \\\\[역슬래시 둘 뒤](d.md)',
    '```', '[펜스](e.md)', '```',
    '~~~md', '[물결 펜스](f.md)', '~~~',
    '`여러 줄', '[코드 안](g.md)`', '',
    '[끝](h.md)'
  ].join('\n');
  assert.deepEqual(hrefs(text), ['a.md', 'd.md', 'h.md']);
  // 본문 표시 · 검색 변환도 같은 규칙: 실제 링크만 이름으로 바뀌고 예시는 원문 그대로
  const stripped = stripLinks(text);
  assert.ok(stripped.startsWith('진짜 `[코드](b.md)` \\[이스케이프](c.md)'));
  assert.ok(stripped.includes('[펜스](e.md)') && stripped.endsWith('끝'));
  assert.equal(splitBody(text).filter(p => p.type === 'link').length, 3);
});

test('상대경로 해석: 링크를 쓴 문서 위치 기준 · 상위 이동(..) · 같은 폴더(./) · 볼트 밖은 깨진 링크', () => {
  assert.equal(target('work--projects.md', 'src-work/nova/brief.md'), 'src-work/nova/brief.md');
  assert.equal(target('src-work/nova/ia.md', 'brief.md'), 'src-work/nova/brief.md');
  assert.equal(target('src-work/nova/ia.md', './brief.md'), 'src-work/nova/brief.md');
  assert.equal(target('src-work/nova/reviews/r1.md', '../../lumen/metrics.md'), 'src-work/lumen/metrics.md');
  assert.equal(target('src-personal/learning/p.md', '../../work--operations.md'), 'work--operations.md');
  assert.equal(target('src-work/a.md', '../../밖.md'), '!볼트 밖 경로');
  assert.equal(target('work.md', '/Users/someone/vault/a.md'), '!절대 경로');
  assert.equal(target('work.md', 'src-work\\a.md'), '!역슬래시 경로');
});

test('인코딩 · 앵커: 공백 %20 · 한글 퍼센트 인코딩 · NFD 한글을 NFC 정규 경로로 맞추고, #앵커 · ?질의는 떼어 낸다', () => {
  assert.equal(target('work.md', 'src-work/%ED%9A%8C%EC%9D%98%20%EB%A9%94%EB%AA%A8.md'), 'src-work/회의 메모.md');
  assert.equal(target('work.md', '<src-work/회의 메모.md>'), 'src-work/회의 메모.md');
  assert.equal(target('work.md', 'src-work/회의 메모.md'.normalize('NFD')), 'src-work/회의 메모.md');
  const anchored = resolveHref('moc-개발.md', 'src-work/lumen/metrics.md#전환율');
  assert.deepEqual(anchored, { type: 'path', path: 'src-work/lumen/metrics.md', anchor: '전환율' });
  assert.equal(target('work.md', 'src-work/a.md?v=2'), 'src-work/a.md');
  assert.equal(target('work.md', '#이 문서 안'), 'anchor');
  assert.equal(target('work.md', 'https://example.com/a.md'), 'external');
  assert.equal(target('work.md', 'mailto:someone@example.com'), 'external');
  assert.equal(target('work.md', 'src-work/%E0%A4%A.md'), '!잘못된 인코딩');
});

test('작성용 상대경로: 문서 위치에서 대상까지 가는 경로를 만들고, 공백 · 괄호만 인코딩해 다시 해석하면 같은 원문이 된다', () => {
  const cases: [string, string][] = [
    ['work--operations.md', 'src-work/operations/prompts/회의록 요약 프롬프트.md'],
    ['src-work/projects/nova/ia.md', 'src-work/projects/nova/brief.md'],
    ['src-work/projects/nova/reviews/review-2.md', 'src-work/projects/lumen/metrics (초안).md'],
    ['src-personal/learning/prompt-patterns.md', 'src-work/operations/prompts/회의록 요약 프롬프트.md']
  ];
  for (const [from, to] of cases) {
    const href = relativeHref(from, to);
    assert.ok(!/\s/.test(href), href);
    assert.equal(target(from, href), to, `${from} → ${href}`);
  }
  assert.equal(relativeHref('src-work/projects/nova/ia.md', 'src-work/projects/nova/brief.md'), 'brief.md');
  assert.equal(relativeHref('src-personal/learning/a.md', 'src-work/b.md'), '../../src-work/b.md');
});
