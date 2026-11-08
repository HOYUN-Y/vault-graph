// 오른쪽(좁은 화면은 아래) 상세 패널: 이름 · 종류 · 원문 위치 · 설명 · 본문 · 분류 경로 · 연결 자료. 연결 자료와 본문 링크를 누르면 그 문서로 이동한다.
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
  /** 경로별 펼침: 이 문서에서 나가는 탐색 경로를 접고 펼친다 */
  fold?: { open: boolean; count: number; onToggle(): void };
  /** 전역 모션 정지 · 재생(좁은 화면에서 조작 막대가 패널에 가려도 여기서 제어) */
  motion: { on: boolean; onToggle(): void };
  /** 작은 화면: 제목 · 요약 뒤에 본문을 먼저 두고, 메타 · 공유 설명 · 경로는 접힌 상세로 옮긴다 */
  compact: boolean;
  /** 실제 볼트 자료: 선택할 때 읽은 원문 미리보기(없으면 데모 · 안내 문서 본문) */
  remote?: Preview | null;
}

const FORMAT_LABEL = { md: 'Markdown', pdf: 'PDF', image: '이미지', other: '기타 파일', dir: '원문 폴더' } as const;

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
  // 공유 자료: 주 분류 색인 외에 다른 색인 · MOC도 이 자료를 연결한 경우(같은 원문 경로라 노드는 하나)
  const sources = new Set(incoming.filter(r => r.doc.kind !== 'material').map(r => r.doc.id));
  const shared = doc.kind === 'material' && sources.size > 1;
  const areaName = area ? graph.byId.get(area)?.title : doc.kind === 'moc' ? '주제 축' : doc.kind === 'router' ? '볼트 전체' : '—';

  const factsEl = (
        <dl className="panel__facts">
          <div><dt>영역</dt><dd>{areaName}</dd></div>
          <div><dt>형식</dt><dd>{FORMAT_LABEL[doc.format]}</dd></div>
          <div><dt>수정</dt><dd>{doc.updated}</dd></div>
          <div><dt>연결</dt><dd>들어옴 {incoming.length} · 나감 {outgoing.length}</dd></div>
        </dl>
  );
  const foldEl = fold && fold.count > 0 && (
          <button type="button" className="fold-button" aria-pressed={!fold.open} onClick={fold.onToggle}>
            <FoldIcon />{fold.open ? `이 경로 접기 · 하위 ${fold.count}개` : `이 경로 펼치기 · 하위 ${fold.count}개`}
          </button>
        );
  const sharedEl = shared && (
          <p className="panel__shared">
            {sources.size}곳의 색인 · MOC가 이 자료를 연결합니다. 원문은 하나이며, 자리는 주 분류 영역({areaName})에 고정됩니다.
          </p>
        );
  const pathEl = path.length > 1 && (
          <nav className="panel__section" aria-label="분류 경로">
            <h3 className="panel__label">분류 경로 <span className="panel__label-note">색인 링크 기준 · 디스크 폴더 아님</span></h3>
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
      // 라우터 '외부 자료 폴더' 표의 등록 원문 루트(src-*)는 깨진 링크가 아니라 노드로 그리지 않는 폴더다
      const t = resolveHref(doc.path, part.link.href);
      if (t.type === 'path' && graph.sourceRoots.includes(t.path)) return <span key={i} className="doc-body__folder" title="등록된 외부 자료 폴더(노드로 그리지 않음)">{part.link.label}</span>;
      return <span key={i} className="doc-body__broken" title="이 화면에서 열 수 없는 링크(대상 없음 · 볼트 밖 · 비공개)">{part.link.label}</span>;
    }
    return (
      <button key={i} type="button" className="doc-body__link" onClick={() => onSelect(target.id)} title={target.path}>{part.link.label}</button>
    );
  });
  const note = graph.synthetic ? '합성 데모 본문' : remote ? '원문 미리보기 · 읽기 전용' : '안내 문서 · 비공개 이름과 로컬 경로는 가림';
  const bodyEl = (
        <section className="panel__section" aria-labelledby="panel-body-label">
          <h3 id="panel-body-label" className="panel__label">본문 <span className="panel__label-note">{note}</span></h3>
          {remote ? (
            remote.state === 'ok' && remote.body !== undefined
              ? <div className="doc-body" tabIndex={0} role="region" aria-label={`${doc.title} 본문`}>{renderBody(remote.body)}</div>
              : <p className={remote.state === 'loading' ? 'panel__notice is-loading' : 'panel__notice'} role="status">{PREVIEW_MESSAGE[remote.state] || PREVIEW_MESSAGE.error}</p>
          ) : isPreviewable(doc) ? (
            <div className="doc-body" tabIndex={0} role="region" aria-label={`${doc.title} 본문`}>{renderBody(doc.body)}</div>
          ) : (
            <p className="panel__notice">{FORMAT_LABEL[doc.format]} 파일은 아직 본문 보기를 지원하지 않습니다. 위의 설명만 표시합니다.</p>
          )}
        </section>
  );

  return (
    <aside ref={ref} className="panel" aria-labelledby="panel-title" style={{ '--accent-doc': color } as CSSProperties}>
      <div className="panel__grip" aria-hidden="true" />
      <header className="panel__head">
        <span className="panel__badge"><Glyph kind={doc.kind} format={doc.format} color={color} size={15} />{KIND_LABEL[doc.kind]}</span>
        <span className="panel__tools">
          <button type="button" className="icon-button" aria-label={motion.on ? '모션 정지' : '모션 재생'} title={motion.on ? '모션 정지' : '모션 재생'}
            aria-pressed={!motion.on} onClick={motion.onToggle}>{motion.on ? <PauseIcon /> : <PlayIcon />}</button>
          <button type="button" className="icon-button" aria-label="상세 패널 닫기 (Esc)" title="닫기 (Esc)" onClick={onClose}><CloseIcon /></button>
        </span>
      </header>
      <div className="panel__scroll">
        <h2 id="panel-title" ref={titleRef} tabIndex={-1} className="panel__title">{doc.title}</h2>
        <p className="panel__path">
          <span className="panel__path-label">{doc.kind === 'material' ? '원문 위치' : '안내 문서 위치'}{graph.synthetic ? ' · 가상' : ' · 볼트 기준'}</span>{doc.path}
        </p>
        <p className="panel__summary">{doc.summary}</p>
        {compact ? <>
          {foldEl}
          {bodyEl}
          <details className="panel__more">
            <summary>{`${areaName} · 들어옴 ${incoming.length} · 나감 ${outgoing.length}${shared ? ` · ${sources.size}곳에서 연결` : ''}`} <span className="panel__more-hint">정보 · 경로</span></summary>
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
            <h3 id="panel-in" className="panel__label">이 문서를 연결한 곳 <span className="panel__count">{incoming.length}</span></h3>
            <div className="rels">{incoming.map(r => <DocButton key={r.doc.id} graph={graph} palette={palette} doc={r.doc} kinds={r.kinds} onSelect={onSelect} />)}</div>
          </section>
        )}
        {outgoing.length > 0 && (
          <section className="panel__section" aria-labelledby="panel-out">
            <h3 id="panel-out" className="panel__label">이 문서가 연결한 자료 <span className="panel__count">{outgoing.length}</span></h3>
            <div className="rels">{outgoing.map(r => <DocButton key={r.doc.id} graph={graph} palette={palette} doc={r.doc} kinds={r.kinds} onSelect={onSelect} />)}</div>
          </section>
        )}
      </div>
    </aside>
  );
});
