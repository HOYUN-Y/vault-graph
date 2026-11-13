// Bottom left: area filter · link view · legend. Collapsed on narrow screens.
import { useId } from 'react';
import type { CSSProperties } from 'react';
import type { BrainGraph } from '../core/graph';
import type { EdgeView, NodeKind } from '../core/types';
import { Glyph, LineSample } from './Glyph';
import { ChevronIcon, LayersIcon } from './icons';
import { EDGE_LABEL, KIND_LABEL, ROUTER_COLOR, TOPIC_COLOR, VIEW_LABEL, colorOf } from './theme';
import type { Palette } from './theme';

interface Props {
  graph: BrainGraph;
  palette: Palette;
  area: string | null;
  onArea(id: string | null): void;
  view: EdgeView;
  onView(view: EdgeView): void;
  open: boolean;
  onToggle(): void;
  /** Data source · connection status (counts only for a real vault) */
  source: { text: string; real: boolean; counts: { guides: number; materials: number; roots: number; privateRules: number; hiddenLinks: number } | null; canRefresh: boolean; refreshing: boolean; onRefresh(): void };
}

const KINDS: NodeKind[] = ['router', 'area', 'subindex', 'guide', 'moc', 'material'];
const VIEWS: EdgeView[] = ['all', 'structure', 'topic'];

export function LegendFilter({ graph, palette, area, onArea, view, onView, open, onToggle, source }: Props) {
  const bodyId = useId();
  const materials = (areaId: string) => graph.docs.filter(d => d.kind === 'material' && graph.areaOf.get(d.id) === areaId).length;
  const neutral = '#CBD5E1';
  return (
    <section className={open ? 'legend is-open' : 'legend'} aria-label="Filter and legend">
      <button type="button" className="legend__toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <LayersIcon /><span>Filter · Legend</span>
        {area && <span className="legend__badge">{graph.byId.get(area)?.title}</span>}
        <ChevronIcon up={!open} />
      </button>
      <div id={bodyId} className="legend__body" hidden={!open}>
        <div className="legend__group" role="group" aria-labelledby={`${bodyId}-area`}>
          <h2 id={`${bodyId}-area`} className="legend__title">Highlight area</h2>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={area === null} onClick={() => onArea(null)}>
              <span className="chip__dot chip__dot--all" aria-hidden="true" />All
            </button>
            {graph.areas.map(a => (
              <button key={a.id} type="button" className="chip" aria-pressed={area === a.id} style={{ '--chip': colorOf(palette, a.id) } as CSSProperties}
                onClick={() => onArea(area === a.id ? null : a.id)}>
                <Glyph kind="area" color={colorOf(palette, a.id)} size={14} />{a.title}<span className="chip__count">{materials(a.id)}</span>
              </button>
            ))}
          </div>
          <p className="legend__note">Highlights the area's materials and those its area index links to. Everything else is dimmed.</p>
        </div>

        <div className="legend__group" role="radiogroup" aria-labelledby={`${bodyId}-view`}>
          <h2 id={`${bodyId}-view`} className="legend__title">Link view</h2>
          <div className="segmented">
            {VIEWS.map(v => (
              <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => onView(v)}>{VIEW_LABEL[v]}</button>
            ))}
          </div>
        </div>

        <div className="legend__group">
          <h2 className="legend__title">Legend</h2>
          <ul className="legend__kinds">
            {KINDS.map(kind => (
              <li key={kind}><Glyph kind={kind} color={kind === 'router' ? ROUTER_COLOR : kind === 'moc' ? TOPIC_COLOR : neutral} size={14} />{KIND_LABEL[kind]}</li>
            ))}
            <li><Glyph kind="material" format="pdf" color={neutral} size={14} />File without body preview</li>
          </ul>
          <ul className="legend__lines">
            <li><LineSample kind="primary" color={neutral} /><span className="legend__line-name">{EDGE_LABEL.primary}</span> <span className="legend__hint">listed by its primary index · {'not\u00a0a\u00a0disk\u00a0folder'}</span></li>
            <li><LineSample kind="index" color={neutral} /><span className="legend__line-name">{EDGE_LABEL.index}</span> <span className="legend__hint">also linked from other indexes</span></li>
            <li><LineSample kind="topic" color={TOPIC_COLOR} /><span className="legend__line-name">{EDGE_LABEL.topic}</span> <span className="legend__hint">links between MOCs · docs</span></li>
          </ul>
        </div>

        <div className="legend__group legend__source">
          <h2 className="legend__title">Data</h2>
          {source.real && source.counts ? (
            <p className="legend__note">
              Guide documents {source.counts.guides} · linked materials {source.counts.materials} · external material folders {source.counts.roots} · links {graph.edges.length}.
              {' '}Applied {source.counts.privateRules} private rules and hid {source.counts.hiddenLinks} links. Source bodies are read only when you select a material (Markdown · text).
            </p>
          ) : (
            <p className="legend__note">
              {graph.synthetic ? 'Synthetic demo vault' : graph.label} · demo docs {graph.docs.length} · links {graph.edges.length}. All paths and bodies are mock data.
            </p>
          )}
          <p className="legend__note legend__status" role="status">{source.text}</p>
          {source.canRefresh && (
            <button type="button" className="legend__refresh" onClick={source.onRefresh} disabled={source.refreshing}>
              {source.refreshing ? 'Rereading…' : 'Reread real vault'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
