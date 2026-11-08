// 본문의 표준 Markdown 링크 [이름](상대경로) 읽기 — 해석 규칙은 이 파일 하나만 쓴다(그래프 연결 · 본문 표시 · 검색 변환).
// secondbrain-index-sync 스킬의 링크 형식: 상대경로는 그 링크를 쓴 문서 위치를 기준으로 한다.
// 링크로 읽지 않는 것: 펜스 코드 블록(``` · ~~~) 안, 인라인 코드(`…`) 안, 역슬래시로 이스케이프한 \[…](…), 이미지 ![…](…).
// 이런 표기는 설명용 예시이므로 원문 그대로 둔다.

export interface MdLink {
  label: string;
  /** 괄호 안 원문 그대로(꺾쇠 · 인코딩 포함) */
  href: string;
  /** 원문에서의 시작 위치와 길이 */
  index: number;
  length: number;
}

export type BodyPart = { type: 'text'; text: string } | { type: 'link'; link: MdLink };

// [이름](주소 "제목"): 이름은 한 줄, 주소는 <꺾쇠 안 공백 허용> 또는 공백 없는 문자열(괄호 한 겹 허용)
const LINK = /(!?)\[([^\[\]\n]*)\]\(\s*(<[^<>\n]*>|(?:[^\s()<>]|\([^\s()]*\))*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
const FENCE = /^ {0,3}(`{3,}|~{3,})[^\n]*$/gm;
// 인라인 코드: 같은 길이의 백틱으로 닫히는 구간. 여러 줄에 걸칠 수 있지만 빈 줄(문단 경계)은 넘지 않는다
const INLINE = /(`+)(?!`)((?:(?!\n[ \t]*\n)[\s\S])+?)(?<!`)\1(?!`)/g;

/** 링크로 해석하지 않는 구간 [시작, 끝) */
export function literalRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  let open: { start: number; char: string; len: number } | null = null;
  for (const m of text.matchAll(FENCE)) {
    const fence = m[1];
    if (!open) open = { start: m.index, char: fence[0], len: fence.length };
    else if (fence[0] === open.char && fence.length >= open.len && m[0].trim() === fence) {
      ranges.push([open.start, m.index + m[0].length]);
      open = null;
    }
  }
  if (open) ranges.push([open.start, text.length]);
  const fenced = ranges.slice();
  const inFence = (i: number) => fenced.some(([s, e]) => i >= s && i < e);
  for (const m of text.matchAll(INLINE)) if (!inFence(m.index)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

function escaped(text: string, at: number) {
  let n = 0;
  for (let i = at - 1; i >= 0 && text[i] === '\\'; i--) n++;
  return n % 2 === 1;
}

export function parseLinks(text: string): MdLink[] {
  const ranges = literalRanges(text);
  const literal = (i: number) => ranges.some(([s, e]) => i >= s && i < e);
  const out: MdLink[] = [];
  for (const m of text.matchAll(LINK)) {
    const bracket = m.index + m[1].length;
    if (m[1] === '!' && !escaped(text, m.index)) continue;
    if (literal(bracket) || escaped(text, bracket)) continue;
    out.push({ label: m[2].trim(), href: m[3], index: bracket, length: m[0].length - m[1].length });
  }
  return out;
}

/** 화면에 그릴 때: 일반 텍스트(코드 · 예시 포함 원문 그대로)와 실제 링크 조각으로 나눈다 */
export function splitBody(text: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let at = 0;
  for (const link of parseLinks(text)) {
    if (link.index > at) parts.push({ type: 'text', text: text.slice(at, link.index) });
    parts.push({ type: 'link', link });
    at = link.index + link.length;
  }
  if (at < text.length) parts.push({ type: 'text', text: text.slice(at) });
  return parts;
}

/** 검색 · 발췌용: 실제 링크만 표시 이름으로 바꾸고, 코드 · 예시는 원문대로 둔다 */
export function stripLinks(text: string): string {
  return splitBody(text).map(p => (p.type === 'text' ? p.text : p.link.label)).join('');
}

export type HrefTarget =
  | { type: 'path'; path: string; anchor: string }
  | { type: 'external' }
  | { type: 'anchor' }
  | { type: 'invalid'; reason: string };

/** 볼트 기준 경로 정규화: NFC, 빈 조각 · '.' 제거, '..' 처리. 볼트 밖으로 나가면 null */
export function normalizePath(path: string): string | null {
  const out: string[] = [];
  for (const seg of path.normalize('NFC').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!out.length) return null; out.pop(); }
    else out.push(seg);
  }
  return out.join('/');
}

const dirOf = (path: string) => path.split('/').slice(0, -1).join('/');

/**
 * 링크 주소 → 볼트 기준 정규 경로. 기준은 링크를 쓴 문서(from)의 위치다.
 * 꺾쇠 · 퍼센트 인코딩(공백 · 한글) · 앵커(#) · 질의(?)를 처리하고, 외부 주소와 같은 문서 앵커는 관계로 보지 않는다.
 * 절대 경로 · 역슬래시 · 볼트 밖으로 나가는 경로 · 잘못된 인코딩은 깨진 링크로 보고한다.
 */
export function resolveHref(from: string, href: string): HrefTarget {
  let raw = href.trim();
  if (raw.startsWith('<') && raw.endsWith('>')) raw = raw.slice(1, -1);
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return { type: 'external' };
  const hash = raw.indexOf('#');
  const anchor = hash >= 0 ? raw.slice(hash + 1) : '';
  if (hash >= 0) raw = raw.slice(0, hash);
  const query = raw.indexOf('?');
  if (query >= 0) raw = raw.slice(0, query);
  if (!raw) return { type: 'anchor' };
  try { raw = decodeURIComponent(raw); } catch { return { type: 'invalid', reason: '잘못된 인코딩' }; }
  if (raw.startsWith('/')) return { type: 'invalid', reason: '절대 경로' };
  if (raw.includes('\\')) return { type: 'invalid', reason: '역슬래시 경로' };
  const base = dirOf(from.normalize('NFC'));
  const path = normalizePath(base ? `${base}/${raw}` : raw);
  if (path === null) return { type: 'invalid', reason: '볼트 밖 경로' };
  return { type: 'path', path, anchor };
}

/** 문서 위치 from에서 to로 가는 상대경로(색인 · 데모 작성용). 공백 · 괄호 · % · #만 인코딩하고 한글은 그대로 둔다 */
export function relativeHref(from: string, to: string): string {
  const a = dirOf(from).split('/').filter(Boolean), b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const rel = [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
  return rel.replace(/[%\s()#<>]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}
