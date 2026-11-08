// 검색 콤보박스: 입력하면 결과 목록이 열리고, 위 · 아래 화살표로 고른 뒤 Enter로 그 문서로 이동한다. Esc는 목록 닫기 → 검색어 지우기 → 입력 벗어나기 순.
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
const FIELD_LABEL = { title: '제목', path: '위치', summary: '색인 설명', body: '본문' } as const;

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
  /** Esc로 입력을 벗어날 때 포커스를 돌려 줄 곳 */
  onLeave(): void;
  /** 실제 조작(누르기 · 키 입력 · 입력 변경): 자동 시연 · 자동 카메라 움직임을 멈춘다.
   *  포커스만으로는 부르지 않는다 — 선택 해제 뒤 포커스가 돌아올 때 전체 보기 이동을 끊지 않게 */
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
  // '/' 단축키로 들어오면 남은 검색어의 결과를 다시 연다(패널을 닫아 포커스가 돌아올 때는 열지 않음)
  useImperativeHandle(ref, () => ({ focus: () => { input.current?.focus(); input.current?.select(); if (queryRef.current.trim()) setOpen(true); } }), []);

  // 갱신으로 빠진 자료(삭제 · 비공개 전환)에 걸리는 검색어는 지운다: 입력 · 결과 · 상태 문구 · 접근성 DOM에 이전 이름이 남지 않게
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
  // 같은 제목이 결과에 둘 이상이면 경로를 강조해 구분한다
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
        <span className="sr-only">세컨드 브레인 검색</span>
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="제목 · 위치 · 색인 설명 · 본문 검색"
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown && hits.length ? `${uid}-opt-${active}` : undefined}
          // 포커스만으로는 목록을 열지 않는다: 패널을 닫아 포커스가 돌아올 때 이전 결과가 다시 화면을 덮지 않게. 누르기 · 입력 · ↓로 연다
          onPointerDown={() => { onActivity(); if (query.trim()) setOpen(true); }}
          onBlur={() => setOpen(false)}
          onChange={event => { onActivity(); setQuery(event.target.value); setActive(0); setOpen(true); }}
          onKeyDown={event => {
            if (event.key !== 'Tab' && event.key !== 'Shift') onActivity();
            if (event.key === 'ArrowDown' && hits.length) { event.preventDefault(); setOpen(true); setActive((active + 1) % hits.length); }
            else if (event.key === 'ArrowUp' && hits.length) { event.preventDefault(); setOpen(true); setActive((active - 1 + hits.length) % hits.length); }
            // 목록이 닫혀 있으면 Enter는 남은 검색어의 결과를 다시 연다(바로 이동하지 않음)
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
          <ul ref={list} id={listId} className="search__list" role="listbox" aria-label="검색 결과">
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
            {result.total === 0 ? '일치하는 자료가 없습니다. 다른 낱말로 찾아 보세요.'
              : result.total > SHOWN ? `${result.total}개 중 ${SHOWN}개를 보여 줍니다. 검색어를 더 구체적으로 입력해 주세요.`
              : `${result.total}개 찾음 · ↑↓로 고르고 Enter로 이동`}
          </p>
        </div>
      )}
    </div>
  );
});
