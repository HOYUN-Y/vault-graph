// Quick search: title · path · summary · body. Matches only documents containing every term, ranked by the earliest field matched.
import type { BrainDoc } from './types';
import { stripLinks } from './markdown';

export type SearchField = 'title' | 'path' | 'summary' | 'body';
export interface SearchHit { doc: BrainDoc; field: SearchField; excerpt: string | null; score: number }
export interface SearchResult { hits: SearchHit[]; total: number }

export const normalize = (text: string) => text.normalize('NFC').toLowerCase();
export const searchTerms = (query: string) => [...new Set(normalize(query).trim().split(/\s+/).filter(Boolean))];

const KIND_RANK: Record<BrainDoc['kind'], number> = { router: 0, area: 1, moc: 2, subindex: 3, guide: 4, material: 5 };
const RADIUS = 30;

function excerptOf(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = normalize(flat);
  const at = Math.min(...terms.map(t => lower.indexOf(t)).filter(i => i >= 0));
  if (!Number.isFinite(at)) return flat.slice(0, RADIUS * 2);
  const start = Math.max(0, at - RADIUS), end = Math.min(flat.length, at + RADIUS * 2);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

export function searchDocs(docs: BrainDoc[], query: string, limit = 50): SearchResult {
  const terms = searchTerms(query);
  if (!terms.length) return { hits: [], total: 0 };
  const whole = normalize(query.trim());
  const hits: SearchHit[] = [];
  for (const doc of docs) {
    const title = normalize(doc.title), path = normalize(doc.path), summary = normalize(doc.summary);
    const body = stripLinks(doc.body);
    const has = (text: string) => terms.every(t => text.includes(t));
    if (!has(`${title}\n${path}\n${summary}\n${normalize(body)}`)) continue;
    let field: SearchField, score: number;
    if (has(title)) { field = 'title'; score = title === whole ? 100 : title.startsWith(whole) ? 90 : 80; }
    else if (has(`${title}\n${path}`)) { field = 'path'; score = 60; }
    else if (has(`${title}\n${path}\n${summary}`)) { field = 'summary'; score = 45; }
    else { field = 'body'; score = 30; }
    const excerpt = field === 'summary' ? excerptOf(doc.summary, terms) : field === 'body' ? excerptOf(body, terms) : null;
    hits.push({ doc, field, excerpt, score });
  }
  hits.sort((a, b) => b.score - a.score || KIND_RANK[a.doc.kind] - KIND_RANK[b.doc.kind]
    || a.doc.title.localeCompare(b.doc.title, 'ko') || a.doc.path.localeCompare(b.doc.path, 'ko'));
  return { hits: hits.slice(0, limit), total: hits.length };
}
