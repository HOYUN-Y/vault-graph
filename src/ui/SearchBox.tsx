// Search combobox: typing opens the result list; pick with up · down arrows and press Enter to go to that doc. Esc closes the list → clears the query → leaves the input.
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BrainGraph } from '../core/graph';
import { searchDocs, searchTerms } from '../core/search';
import type { SearchHit } from '../core/search';
import { Glyph } from './Glyph';
import { SearchIcon } from './icons';
import { KIND_LABEL, colorOf } from './theme';
import type { Palette } from './theme';

export interface SearchBoxHandle { focus(): void }
const SHOWN = 30;
const FIELD_LABEL = { title: 'Title', path: 'Location', summary: 'Index description', body: 'Body' } as const;

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const lower = text.normalize('NFC').toLowerCase();
  const marks: [number, number][] = [];
  for (const t of terms) {
    let at = lower.indexOf(t);
    while (at >= 0) { marks.push([at, at + t.length]); at = lower.indexOf(t, at + t.length); }
  }
  if (!marks.length) return <>{text}</>;
  marks.sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let pos = 0;
  marks.forEach(([s, e], i) => {
    if (e <= pos) return;
    const start = Math.max(s, pos);
    if (start > pos) out.push(text.slice(pos, start));
    out.push(<mark key={i}>{text.slice(start, e)}</mark>);
    pos = e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}

interface Props {
  graph: BrainGraph;
  palette: Palette;
  onPick(id: string): void;
  /** Where focus returns when Esc leaves the input */
  onLeave(): void;
  /** Real interaction (click · key press · input change): stops the auto tour · automatic camera moves.
   *  Not called on focus alone, so focus returning after deselect doesn't cut off the fit-all move */
  onActivity(): void;
}

export const SearchBox = forwardRef<SearchBoxHandle, Props>(function SearchBox({ graph, palette, onPick, onLeave, onActivity }, ref) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const uid = useId();
  const listId = `${uid}-results`;
  const queryRef = useRef(query);
  queryRef.current = query;
  // Entering via the '/' shortcut reopens results for the remaining query (not when focus returns from closing the panel)
  useImperativeHandle(ref, () => ({ focus: () => { input.current?.focus(); input.current?.select(); if (queryRef.current.trim()) setOpen(true); } }), []);

  // Clear a query that matches material removed by an update (deleted · made private), so the old name doesn't linger in input · results · status text · accessibility DOM
  const prevGraph = useRef(graph);
  useEffect(() => {
    const prev = prevGraph.current;
    prevGraph.current = graph;
    if (prev === graph || !query.trim()) return;
    const removed = prev.docs.filter(d => !graph.byId.has(d.id));
    if (removed.length && searchDocs(removed, query).total > 0) { setQuery(''); setOpen(false); setActive(0); }
  }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo(() => searchDocs(graph.docs, query), [graph, query]);
  const terms = useMemo(() => searchTerms(query), [query]);
  const hits = result.hits.slice(0, SHOWN);
  const shown = open && !!query.trim();
  // When two or more results share a title, emphasize the path to tell them apart
  const sameTitle = useMemo(() => {
    const count = new Map<string, number>();
    for (const h of hits) count.set(h.doc.title, (count.get(h.doc.title) ?? 0) + 1);
    return count;
  }, [hits]);

  useEffect(() => { list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const pick = (hit: SearchHit) => {
    setOpen(false);
    onPick(hit.doc.id);
  };

  return (
    <div className={shown ? 'search is-open' : 'search'}>
      <label className="search__field">
        <SearchIcon />
        <span className="sr-only">Search Second Brain</span>
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Search title · location · description · body"
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown && hits.length ? `${uid}-opt-${active}` : undefined}
          // Focus alone doesn't open the list, so old results don't cover the screen when focus returns from closing the panel. Click · typing · ↓ open it
          onPointerDown={() => { onActivity(); if (query.trim()) setOpen(true); }}
          onBlur={() => setOpen(false)}
          onChange={event => { onActivity(); setQuery(event.target.value); setActive(0); setOpen(true); }}
          onKeyDown={event => {
            if (event.key !== 'Tab' && event.key !== 'Shift') onActivity();
            if (event.key === 'ArrowDown' && hits.length) { event.preventDefault(); setOpen(true); setActive((active + 1) % hits.length); }
            else if (event.key === 'ArrowUp' && hits.length) { event.preventDefault(); setOpen(true); setActive((active - 1 + hits.length) % hits.length); }
            // With the list closed, Enter reopens results for the remaining query (doesn't navigate right away)
            else if (event.key === 'Enter') { event.preventDefault(); if (shown && hits[active]) pick(hits[active]); else if (!shown && query.trim()) setOpen(true); }
            else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              if (shown) setOpen(false);
              else if (query) { setQuery(''); setActive(0); }
              else { input.current?.blur(); onLeave(); }
            }
          }}
        />
        <kbd className="search__key" aria-hidden="true">/</kbd>
      </label>
      {shown && (
        <div className="search__panel">
          <ul ref={list} id={listId} className="search__list" role="listbox" aria-label="Search results">
            {hits.map((hit, i) => {
              const { doc } = hit;
              const area = graph.areaOf.get(doc.id);
              return (
                <li key={doc.id} id={`${uid}-opt-${i}`} data-index={i} role="option" aria-selected={i === active} className="search__item"
                  onPointerDown={event => event.preventDefault()} onPointerMove={() => setActive(i)} onClick={() => pick(hit)}>
                  <Glyph kind={doc.kind} format={doc.format} color={colorOf(palette, doc.id)} size={16} />
                  <span className="search__title"><Highlight text={doc.title} terms={terms} /></span>
                  <span className="search__meta">{KIND_LABEL[doc.kind]}{area ? ` · ${graph.byId.get(area)?.title}` : ''}</span>
                  <span className={(sameTitle.get(doc.title) ?? 0) > 1 ? 'search__path is-distinct' : 'search__path'}>{doc.path}</span>
                  {hit.excerpt && <span className="search__excerpt"><b>{FIELD_LABEL[hit.field]}</b> <Highlight text={hit.excerpt} terms={terms} /></span>}
                </li>
              );
            })}
          </ul>
          <p className="search__status" role="status" aria-live="polite">
            {result.total === 0 ? 'No matches. Try different words.'
              : result.total > SHOWN ? `Showing ${SHOWN} of ${result.total}. Try a more specific query.`
              : `${result.total} found · ↑↓ to choose, Enter to open`}
          </p>
        </div>
      )}
    </div>
  );
});
