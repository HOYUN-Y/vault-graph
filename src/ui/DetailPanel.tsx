// Detail panel on the right (bottom on narrow screens): name · kind · source location · description · body · hierarchy path · linked materials. Clicking a linked material or body link moves to that doc.
import { forwardRef } from 'react';
import type { CSSProperties, Ref } from 'react';
import type { BrainGraph } from '../core/graph';
import { linkTarget, primaryPath, relationsOf } from '../core/graph';
import type { BrainDoc, EdgeKind } from '../core/types';
import { isPreviewable } from '../core/types';
import { resolveHref, splitBody } from '../core/markdown';
import { PREVIEW_MESSAGE } from '../data/live';
import type { Preview } from '../data/live';
import { Glyph } from './Glyph';
import { CloseIcon, FoldIcon, PauseIcon, PlayIcon } from './icons';
import { EDGE_LABEL, KIND_LABEL, colorOf } from './theme';
import type { Palette } from './theme';

interface Props {
  graph: BrainGraph;
  palette: Palette;
  doc: BrainDoc;
  titleRef: Ref<HTMLHeadingElement>;
  onSelect(id: string): void;
  onClose(): void;
  /** Per-path expansion: collapse or expand the paths leading out of this doc */
  fold?: { open: boolean; count: number; onToggle(): void };
  /** Global motion pause · play (controllable here even when the panel covers the dock on narrow screens) */
  motion: { on: boolean; onToggle(): void };
  /** Small screens: put the body right after title · summary, and move meta · shared note · path into a collapsed details section */
  compact: boolean;
  /** Real vault material: source preview read on selection (otherwise the demo · guide document body) */
  remote?: Preview | null;
}

const FORMAT_LABEL = { md: 'Markdown', pdf: 'PDF', image: 'Image', other: 'Other file', dir: 'Source folder' } as const;

function DocButton({ graph, palette, doc, kinds, onSelect }: { graph: BrainGraph; palette: Palette; doc: BrainDoc; kinds?: EdgeKind[]; onSelect(id: string): void }) {
  const area = graph.areaOf.get(doc.id);
  return (
    <button type="button" className="rel" onClick={() => onSelect(doc.id)}>
      <Glyph kind={doc.kind} format={doc.format} color={colorOf(palette, doc.id)} size={15} />
      <span className="rel__name">{doc.title}</span>
      <span className="rel__meta">{kinds?.length ? kinds.map(k => EDGE_LABEL[k]).join(' + ') : KIND_LABEL[doc.kind]}{area && area !== doc.id ? ` · ${graph.byId.get(area)?.title}` : ''}</span>
    </button>
  );
}

export const DetailPanel = forwardRef<HTMLElement, Props>(function DetailPanel({ graph, palette, doc, titleRef, onSelect, onClose, fold, motion, compact, remote }, ref) {
  const color = colorOf(palette, doc.id);
  const area = graph.areaOf.get(doc.id);
  const path = primaryPath(graph, doc.id);
  const { incoming, outgoing } = relationsOf(graph, doc.id);
  // Shared material: other indexes · MOCs link it besides its primary index (same source path, so still one node)
  const sources = new Set(incoming.filter(r => r.doc.kind !== 'material').map(r => r.doc.id));
  const shared = doc.kind === 'material' && sources.size > 1;
  const areaName = area ? graph.byId.get(area)?.title : doc.kind === 'moc' ? 'Topic axis' : doc.kind === 'router' ? 'Whole vault' : '—';

  const factsEl = (
        <dl className="panel__facts">
          <div><dt>Area</dt><dd>{areaName}</dd></div>
          <div><dt>Format</dt><dd>{FORMAT_LABEL[doc.format]}</dd></div>
          <div><dt>Modified</dt><dd>{doc.updated}</dd></div>
          <div><dt>Links</dt><dd>In {incoming.length} · Out {outgoing.length}</dd></div>
        </dl>
  );
  const foldEl = fold && fold.count > 0 && (
          <button type="button" className="fold-button" aria-pressed={!fold.open} onClick={fold.onToggle}>
            <FoldIcon />{`${fold.open ? 'Collapse' : 'Expand'} this path · ${fold.count} ${fold.count === 1 ? 'child' : 'children'}`}
          </button>
        );
  const sharedEl = shared && (
          <p className="panel__shared">
            {sources.size} indexes · MOCs link this material. There is one source file, and its position stays in its primary area ({areaName}).
          </p>
        );
  const pathEl = path.length > 1 && (
          <nav className="panel__section" aria-label="Hierarchy path">
            <h3 className="panel__label">Hierarchy path <span className="panel__label-note">by index links · not disk folders</span></h3>
            <ol className="crumbs">
              {path.map(id => {
                const d = graph.byId.get(id)!;
                return (
                  <li key={id}>
                    {id === doc.id ? <span aria-current="page">{d.title}</span>
                      : <button type="button" onClick={() => onSelect(id)}>{d.title}</button>}
                  </li>
                );
              })}
            </ol>
          </nav>
        );
  const renderBody = (text: string) => splitBody(text).map((part, i) => {
    if (part.type === 'text') return <span key={i}>{part.text}</span>;
    const id = linkTarget(graph, doc.id, part.link.href);
    const target = id ? graph.byId.get(id) : undefined;
    if (!target) {
      // Registered source roots (src-*) in the router's external material folder table are not broken links, just folders that aren't drawn as nodes
      const t = resolveHref(doc.path, part.link.href);
      if (t.type === 'path' && graph.sourceRoots.includes(t.path)) return <span key={i} className="doc-body__folder" title="Registered external material folder (not drawn as a node)">{part.link.label}</span>;
      return <span key={i} className="doc-body__broken" title="Link that cannot be opened here (no target · outside vault · private)">{part.link.label}</span>;
    }
    return (
      <button key={i} type="button" className="doc-body__link" onClick={() => onSelect(target.id)} title={target.path}>{part.link.label}</button>
    );
  });
  const note = graph.synthetic ? 'synthetic demo body' : remote ? 'source preview · read-only' : 'guide document · private names and local paths hidden';
  const bodyEl = (
        <section className="panel__section" aria-labelledby="panel-body-label">
          <h3 id="panel-body-label" className="panel__label">Body <span className="panel__label-note">{note}</span></h3>
          {remote ? (
            remote.state === 'ok' && remote.body !== undefined
              ? <div className="doc-body" tabIndex={0} role="region" aria-label={`${doc.title} body`}>{renderBody(remote.body)}</div>
              : <p className={remote.state === 'loading' ? 'panel__notice is-loading' : 'panel__notice'} role="status">{PREVIEW_MESSAGE[remote.state] || PREVIEW_MESSAGE.error}</p>
          ) : isPreviewable(doc) ? (
            <div className="doc-body" tabIndex={0} role="region" aria-label={`${doc.title} body`}>{renderBody(doc.body)}</div>
          ) : (
            <p className="panel__notice">Body view isn't supported for {FORMAT_LABEL[doc.format]} files yet. Only the description above is shown.</p>
          )}
        </section>
  );

  return (
    <aside ref={ref} className="panel" aria-labelledby="panel-title" style={{ '--accent-doc': color } as CSSProperties}>
      <div className="panel__grip" aria-hidden="true" />
      <header className="panel__head">
        <span className="panel__badge"><Glyph kind={doc.kind} format={doc.format} color={color} size={15} />{KIND_LABEL[doc.kind]}</span>
        <span className="panel__tools">
          <button type="button" className="icon-button" aria-label={motion.on ? 'Pause motion' : 'Play motion'} title={motion.on ? 'Pause motion' : 'Play motion'}
            aria-pressed={!motion.on} onClick={motion.onToggle}>{motion.on ? <PauseIcon /> : <PlayIcon />}</button>
          <button type="button" className="icon-button" aria-label="Close detail panel (Esc)" title="Close (Esc)" onClick={onClose}><CloseIcon /></button>
        </span>
      </header>
      <div className="panel__scroll">
        <h2 id="panel-title" ref={titleRef} tabIndex={-1} className="panel__title">{doc.title}</h2>
        <p className="panel__path">
          <span className="panel__path-label">{doc.kind === 'material' ? 'Source location' : 'Guide document location'}{graph.synthetic ? ' · mock' : ' · vault-relative'}</span>{doc.path}
        </p>
        <p className="panel__summary">{doc.summary}</p>
        {compact ? <>
          {foldEl}
          {bodyEl}
          <details className="panel__more">
            <summary>{`${areaName} · In ${incoming.length} · Out ${outgoing.length}${shared ? ` · linked from ${sources.size}` : ''}`} <span className="panel__more-hint">Info · path</span></summary>
            {factsEl}
            {sharedEl}
            {pathEl}
          </details>
        </> : <>
          {factsEl}
          {foldEl}
          {sharedEl}
          {pathEl}
          {bodyEl}
        </>}

        {incoming.length > 0 && (
          <section className="panel__section" aria-labelledby="panel-in">
            <h3 id="panel-in" className="panel__label">Linked from <span className="panel__count">{incoming.length}</span></h3>
            <div className="rels">{incoming.map(r => <DocButton key={r.doc.id} graph={graph} palette={palette} doc={r.doc} kinds={r.kinds} onSelect={onSelect} />)}</div>
          </section>
        )}
        {outgoing.length > 0 && (
          <section className="panel__section" aria-labelledby="panel-out">
            <h3 id="panel-out" className="panel__label">Links to <span className="panel__count">{outgoing.length}</span></h3>
            <div className="rels">{outgoing.map(r => <DocButton key={r.doc.id} graph={graph} palette={palette} doc={r.doc} kinds={r.kinds} onSelect={onSelect} />)}</div>
          </section>
        )}
      </div>
    </aside>
  );
});
