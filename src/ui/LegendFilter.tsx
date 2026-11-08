// 왼쪽 아래: 영역 필터 · 연결 보기 · 범례. 좁은 화면에서는 접어 둔다.
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
  /** 데이터 출처 · 연결 상태(실제 볼트는 집계만) */
  source: { text: string; real: boolean; counts: { guides: number; materials: number; roots: number; privateRules: number; hiddenLinks: number } | null; canRefresh: boolean; refreshing: boolean; onRefresh(): void };
}

const KINDS: NodeKind[] = ['router', 'area', 'subindex', 'guide', 'moc', 'material'];
const VIEWS: EdgeView[] = ['all', 'structure', 'topic'];

export function LegendFilter({ graph, palette, area, onArea, view, onView, open, onToggle, source }: Props) {
  const bodyId = useId();
  const materials = (areaId: string) => graph.docs.filter(d => d.kind === 'material' && graph.areaOf.get(d.id) === areaId).length;
  const neutral = '#CBD5E1';
  return (
    <section className={open ? 'legend is-open' : 'legend'} aria-label="필터와 범례">
      <button type="button" className="legend__toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <LayersIcon /><span>필터 · 범례</span>
        {area && <span className="legend__badge">{graph.byId.get(area)?.title}</span>}
        <ChevronIcon up={!open} />
      </button>
      <div id={bodyId} className="legend__body" hidden={!open}>
        <div className="legend__group" role="group" aria-labelledby={`${bodyId}-area`}>
          <h2 id={`${bodyId}-area`} className="legend__title">영역 강조</h2>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={area === null} onClick={() => onArea(null)}>
              <span className="chip__dot chip__dot--all" aria-hidden="true" />전체
            </button>
            {graph.areas.map(a => (
              <button key={a.id} type="button" className="chip" aria-pressed={area === a.id} style={{ '--chip': colorOf(palette, a.id) } as CSSProperties}
                onClick={() => onArea(area === a.id ? null : a.id)}>
                <Glyph kind="area" color={colorOf(palette, a.id)} size={14} />{a.title}<span className="chip__count">{materials(a.id)}</span>
              </button>
            ))}
          </div>
          <p className="legend__note">소속 자료와 그 영역 색인이 연결한 자료를 밝게 표시합니다. 나머지는 흐리게 남습니다.</p>
        </div>

        <div className="legend__group" role="radiogroup" aria-labelledby={`${bodyId}-view`}>
          <h2 id={`${bodyId}-view`} className="legend__title">연결 보기</h2>
          <div className="segmented">
            {VIEWS.map(v => (
              <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => onView(v)}>{VIEW_LABEL[v]}</button>
            ))}
          </div>
        </div>

        <div className="legend__group">
          <h2 className="legend__title">범례</h2>
          <ul className="legend__kinds">
            {KINDS.map(kind => (
              <li key={kind}><Glyph kind={kind} color={kind === 'router' ? ROUTER_COLOR : kind === 'moc' ? TOPIC_COLOR : neutral} size={14} />{KIND_LABEL[kind]}</li>
            ))}
            <li><Glyph kind="material" format="pdf" color={neutral} size={14} />본문 미리보기 없는 파일</li>
          </ul>
          <ul className="legend__lines">
            <li><LineSample kind="primary" color={neutral} /><span className="legend__line-name">{EDGE_LABEL.primary}</span> <span className="legend__hint">색인이 주 분류로 올림 · {'디스크\u00a0폴더\u00a0아님'}</span></li>
            <li><LineSample kind="index" color={neutral} /><span className="legend__line-name">{EDGE_LABEL.index}</span> <span className="legend__hint">다른 색인도 함께 연결</span></li>
            <li><LineSample kind="topic" color={TOPIC_COLOR} /><span className="legend__line-name">{EDGE_LABEL.topic}</span> <span className="legend__hint">MOC · 문서 사이 링크</span></li>
          </ul>
        </div>

        <div className="legend__group legend__source">
          <h2 className="legend__title">데이터</h2>
          {source.real && source.counts ? (
            <p className="legend__note">
              안내 문서 {source.counts.guides} · 연결 자료 {source.counts.materials} · 외부 자료 폴더 {source.counts.roots} · 연결 {graph.edges.length}.
              {' '}비공개 규칙 {source.counts.privateRules}개를 적용해 링크 {source.counts.hiddenLinks}개를 숨겼습니다. 원문 본문은 자료를 선택할 때만 읽습니다(Markdown · 텍스트).
            </p>
          ) : (
            <p className="legend__note">
              {graph.synthetic ? '합성 데모 볼트' : graph.label} · 가상 문서 {graph.docs.length} · 연결 {graph.edges.length}. 경로 · 본문은 모두 가상입니다.
            </p>
          )}
          <p className="legend__note legend__status" role="status">{source.text}</p>
          {source.canRefresh && (
            <button type="button" className="legend__refresh" onClick={source.onRefresh} disabled={source.refreshing}>
              {source.refreshing ? '다시 읽는 중…' : '실제 볼트 다시 읽기'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
