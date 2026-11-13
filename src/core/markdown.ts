// Reads standard Markdown links [label](relative path) in bodies. This file is the only parser (graph links, body display, search text).
// secondbrain-index-sync link format: relative paths are relative to the document that contains the link.
// Not links: inside fenced code (``` or ~~~), inside inline code (`...`), backslash-escaped \[...](...), images ![...](...).
// Those are illustrative examples and are kept verbatim.

export interface MdLink {
  label: string;
  /** Raw text inside the parentheses (angle brackets and encoding kept) */
  href: string;
  /** Start offset and length in the source text */
  index: number;
  length: number;
}

export type BodyPart = { type: 'text'; text: string } | { type: 'link'; link: MdLink };

// [label](href "title"): label on one line; href is <angle brackets, spaces allowed> or a string without spaces (one level of parentheses)
const LINK = /(!?)\[([^\[\]\n]*)\]\(\s*(<[^<>\n]*>|(?:[^\s()<>]|\([^\s()]*\))*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
const FENCE = /^ {0,3}(`{3,}|~{3,})[^\n]*$/gm;
// Inline code: closed by a backtick run of the same length. May span lines but never a blank line (paragraph break)
const INLINE = /(`+)(?!`)((?:(?!\n[ \t]*\n)[\s\S])+?)(?<!`)\1(?!`)/g;

/** Ranges not parsed as links [start, end) */
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

/** For rendering: split into plain text (code and examples verbatim) and real link parts */
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

/** For search and excerpts: replace real links with their labels, keep code and examples verbatim */
export function stripLinks(text: string): string {
  return splitBody(text).map(p => (p.type === 'text' ? p.text : p.link.label)).join('');
}

export type HrefTarget =
  | { type: 'path'; path: string; anchor: string }
  | { type: 'external' }
  | { type: 'anchor' }
  | { type: 'invalid'; reason: string };

/** Normalize a vault-relative path: NFC, drop empty and '.' segments, resolve '..'. null if it leaves the vault */
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
 * Link href -> canonical vault-relative path, relative to the linking document (from).
 * Handles angle brackets, percent-encoding (spaces, non-ASCII), anchors (#) and queries (?). External URLs and same-document anchors are not relations.
 * Absolute paths, backslashes, paths leaving the vault and bad encoding are reported as broken links.
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
  try { raw = decodeURIComponent(raw); } catch { return { type: 'invalid', reason: 'invalid encoding' }; }
  if (raw.startsWith('/')) return { type: 'invalid', reason: 'absolute path' };
  if (raw.includes('\\')) return { type: 'invalid', reason: 'backslash path' };
  const base = dirOf(from.normalize('NFC'));
  const path = normalizePath(base ? `${base}/${raw}` : raw);
  if (path === null) return { type: 'invalid', reason: 'outside vault' };
  return { type: 'path', path, anchor };
}

/** Relative path from document from to to (for writing indexes and demos). Encodes only spaces, parentheses, %, # and <>; non-ASCII is kept */
export function relativeHref(from: string, to: string): string {
  const a = dirOf(from).split('/').filter(Boolean), b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const rel = [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
  return rel.replace(/[%\s()#<>]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}
