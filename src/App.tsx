// 전체 화면 배치: 머리줄(제목 · 검색 · 시연) · 가운데 3D 신경망(실패 시 2D 대체) · 왼쪽 아래 필터 · 범례 · 아래 조작 막대 · 오른쪽(좁은 화면은 아래) 상세 패널.
// 단축키: / 검색, Esc 검색 닫기 → 선택 해제 → 시연 멈춤. 캔버스에서 화살표 회전 · +/− 확대 · 0 전체 보기.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { defaultExpanded, expandable, foldCounts, foldedVisible, pathChildCount, revealPrimaryPath, shownEdges, toggleExpanded, visibleSet } from './core/explore';
import { areaEmphasis, buildGraph } from './core/graph';
import type { BrainGraph } from './core/graph';
import { radialLayout } from './core/layout2d';
import { layoutGraph } from './core/layout3d';
import type { Vec3 } from './core/layout3d';
import { ASYNC_LAYOUT_MIN, layoutAsync } from './render/layout-async';
import type { GlowDepthMode } from './render/BrainScene';
import type { EdgeKind, EdgeView } from './core/types';
import { demoDataset } from './data/demo';
import { syntheticDataset } from './data/synthetic';
import { fetchGraph, fetchPreview, fetchStatus, requestRefresh } from './data/live';
import type { LiveGraph, Preview } from './data/live';
import { BrainCanvas } from './ui/BrainCanvas';
import type { BrainCanvasHandle } from './ui/BrainCanvas';
import { DetailPanel } from './ui/DetailPanel';
import { Intro } from './ui/Intro';
import { LiveBadge, liveView } from './ui/LiveBadge';
import { BrandMark, CloseIcon, FitIcon, FoldIcon, LabelIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon, TourIcon } from './ui/icons';
import { LegendFilter } from './ui/LegendFilter';
import { NetworkPreview } from './ui/NetworkPreview';
import type { Insets } from './ui/NetworkPreview';
import { SearchBox } from './ui/SearchBox';
import type { SearchBoxHandle } from './ui/SearchBox';
import { KIND_LABEL, buildPalette } from './ui/theme';

const MOBILE = '(max-width: 720px)';
const REDUCED = '(prefers-reduced-motion: reduce)';
// 상세 패널을 본문 우선으로 접어 보이는 작은 화면(좁은 폭 또는 짧은 높이)
const COMPACT = '(max-width: 720px), (max-height: 560px)';
const TOUR_MS = 4600;
const params = new URLSearchParams(location.search);
const NODES = Number(params.get('nodes')) || 0;
const FORCE_FALLBACK = params.get('webgl') === '0';
const SKIP_OPENING = params.get('opening') === '0';
// ?demo=1: 실제 볼트 설정이 있어도 합성 데모만 본다
const FORCE_DEMO = params.get('demo') === '1';

declare global { interface Window { __brainPerf?: Record<string, unknown> } }

function useMedia(query: string) {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const on = () => setMatch(list.matches);
    list.addEventListener('change', on);
    return () => list.removeEventListener('change', on);
  }, [query]);
  return match;
}

function useSize(ref: RefObject<HTMLElement | null>, active: boolean) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) { setSize({ w: 0, h: 0 }); return; }
    const observer = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    observer.observe(el);
    setSize({ w: el.offsetWidth, h: el.offsetHeight });
    return () => observer.disconnect();
  }, [ref, active]);
  return size;
}

/**
 * 휴대폰 세로 조작 막대가 차지하는 오른쪽 아래 구석(무대 오른쪽 · 아래 가장자리부터 px).
 * undefined = 아직 재지 않음, null = 막대가 보이지 않음(넓은 화면 · 상세 패널 열림)
 */
function useCorner(dock: RefObject<HTMLElement | null>, stage: RefObject<HTMLElement | null>, active: boolean) {
  const [corner, setCorner] = useState<{ w: number; h: number } | null | undefined>(undefined);
  useLayoutEffect(() => {
    const el = dock.current, st = stage.current;
    if (!active || !el || !st) { setCorner(null); return; }
    const measure = () => {
      const a = el.getBoundingClientRect(), b = st.getBoundingClientRect();
      const next = a.width > 0 && a.height > 0 ? { w: Math.round(b.right - a.left), h: Math.round(b.bottom - a.top) } : null;
      setCorner(c => (c && next && c.w === next.w && c.h === next.h ? c : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el); observer.observe(st);
    measure();
    return () => observer.disconnect();
  }, [dock, stage, active]);
  return corner;
}

export function App() {
  // 데이터 출처: 합성 성능 데이터(?nodes) · 실제 볼트(로컬 읽기 전용 API, 검증된 결과가 있을 때만) · 합성 데모
  const [live, setLive] = useState<LiveGraph | null>(null);
  const [booted, setBooted] = useState(NODES > 0 || FORCE_DEMO);
  const [refreshing, setRefreshing] = useState(false);
  const realFiles = !NODES && live?.mode === 'real' && (live.state === 'connected' || live.state === 'unavailable') && live.files.length ? live.files : null;
  const dataset = useMemo(() => (NODES ? syntheticDataset(NODES) : realFiles ? { label: '실제 볼트(읽기 전용)', synthetic: false, files: realFiles } : demoDataset), [realFiles]);
  const graph = useMemo(() => buildGraph(dataset), [dataset]);
  const realMode = !!realFiles;
  const foldMode = realMode && live?.structure === 'workspace';
  // 볼트가 바뀌거나 규칙 실패로 실제 데이터를 버리면, 열린 본문 · 검색 · 미리보기를 모두 새로 시작한다
  const dataKey = `${live?.mode ?? 'demo'}:${live?.vaultKey ?? ''}:${realMode ? 'real' : 'fallback'}`;
  const palette = useMemo(() => buildPalette(graph), [graph]);
  const layoutMs = useRef(0);
  const layoutWhere = useRef<'main' | 'worker'>('main');
  // 작은 그래프(실제 볼트 등)는 바로 계산하고, 큰 그래프(5,000개 데모)는 작업자에서 계산하는 동안 화면이 멈추지 않게 한다
  const bigLayout = graph.docs.length > ASYNC_LAYOUT_MIN;
  const syncPositions = useMemo(() => {
    if (bigLayout) return null;
    const t = performance.now();
    const out = layoutGraph(graph);
    layoutMs.current = performance.now() - t;
    layoutWhere.current = 'main';
    return out;
  }, [graph, bigLayout]);
  const [asyncLayout, setAsyncLayout] = useState<{ graph: BrainGraph; positions: Map<string, Vec3> } | null>(null);
  useEffect(() => {
    if (!bigLayout) return;
    let alive = true;
    layoutAsync(dataset, graph).then(r => {
      if (!alive) return;
      layoutMs.current = r.ms; layoutWhere.current = r.where;
      setAsyncLayout({ graph, positions: r.positions });
    });
    return () => { alive = false; };
  }, [dataset, graph, bigLayout]);
  const positions = bigLayout ? (asyncLayout?.graph === graph ? asyncLayout.positions : null) : syncPositions;
  const canExpand = useMemo(() => expandable(graph), [graph]);
  const mobile = useMedia(MOBILE);
  const reduced = useMedia(REDUCED);
  const compact = useMedia(COMPACT);

  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [view, setView] = useState<EdgeView>('all');
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(graph, foldMode));
  const [legendOpen, setLegendOpen] = useState(() => !matchMedia(MOBILE).matches && innerHeight > 620);
  const [paused, setPaused] = useState(false);
  // 장면 이름표(노드 글자) 켬/끔: 이 페이지 상태만. 3D · 2D 공통, 검색 · 범례 · 패널 글자와 접근성 이름은 그대로
  const [labelsOn, setLabelsOn] = useState(true);
  const [opening, setOpening] = useState(!SKIP_OPENING && !FORCE_FALLBACK && !matchMedia(REDUCED).matches);
  // 첫 화면 안내(규모 · 첫 행동 단서): 첫 조작이나 잠시 뒤 닫힌다
  const [intro, setIntro] = useState(true);
  const [tour, setTour] = useState<number | null>(null);
  const [fallback, setFallback] = useState<string | null>(FORCE_FALLBACK ? '주소에 webgl=0이 있어 2D 대체 화면을 보여 줍니다.' : null);
  // 2D 대체 배치는 대체 화면을 쓸 때만 계산한다
  const flat = !!fallback;
  const layout2d = useMemo(() => (flat ? radialLayout(graph) : null), [graph, flat]);
  const [announcement, setAnnouncement] = useState('');
  const [warnClosed, setWarnClosed] = useState<string | null>(null);
  // 장면 이름표 켬/끔: 장면 · 배치 · 카메라 · 모션은 그대로 두고 이름표만 바꾼다
  const toggleLabels = useCallback(() => {
    setLabelsOn(!labelsOn);
    setAnnouncement(labelsOn ? '장면 이름표 끔' : '장면 이름표 켬');
  }, [labelsOn]);

  const scene = useRef<BrainCanvasHandle>(null);
  const search = useRef<SearchBoxHandle>(null);
  const stage = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const focusPanel = useRef(false);

  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  const doc = selected ? graph.byId.get(selected) ?? null : null;
  const emphasis = useMemo(() => (area ? areaEmphasis(graph, area) : null), [graph, area]);
  const visible = useMemo(() => visibleSet(graph, { expanded, view, pinned: selected }), [graph, expanded, view, selected]);
  // 작업폴더 연결: 접힌 색인을 하위 개수를 단 덩어리로 보이고, 누르면 펼친다(색인 방식 · 데모는 이전처럼 모두 펼친 채 시작)
  const counts = useMemo(() => (foldMode ? foldCounts(graph) : null), [graph, foldMode]);
  const folded = useMemo(() => (counts ? foldedVisible(visible, expanded, counts) : undefined), [counts, visible, expanded]);
  const shown = useMemo(() => new Map<string, EdgeKind>(shownEdges(graph, { expanded, view, pinned: selected }, visible).map(e => [e.key, e.kind])), [graph, expanded, view, selected, visible]);

  const tourSteps = useMemo(() => {
    // 데모 볼트의 대표 문서(경로 → 고유 ID). 합성 성능 데이터에는 없으므로 영역 · MOC로 대신한다
    const wanted = ['work.md', 'project-nova.md', 'moc-AI-활용.md', 'src-work/operations/prompts/회의록 요약 프롬프트.md', 'personal.md', 'project-ml-study.md', 'src-work/content/style-guide.md'];
    const ids = wanted.map(p => graph.idOfPath.get(p)).filter((id): id is string => !!id);
    if (ids.length >= 4) return ids;
    // 실제 볼트 · 합성 성능 데이터: 데모 경로 대신 구조로 고른다(영역 → 그 영역의 안내 · 하위 색인 → 주제 MOC → 공유 자료 → 다음 영역)
    const out: string[] = [];
    const add = (id?: string) => { if (id && !out.includes(id)) out.push(id); };
    const shared = graph.docs.find(d => d.kind === 'material' && (graph.inLinks.get(d.id) ?? []).filter(s => graph.byId.get(s)?.kind !== 'material').length >= 2);
    graph.areas.slice(0, 2).forEach((a, i) => {
      add(a.id);
      add((graph.children.get(a.id) ?? []).find(c => c.kind === 'guide' || c.kind === 'subindex')?.id);
      if (i === 0) { add(graph.mocs[0]?.id); add(shared?.id); }
    });
    if (out.length < 3) graph.mocs.forEach(m => add(m.id));
    return out.slice(0, 7);
  }, [graph]);

  // 시연을 멈추면 시연이 시작한 카메라 이동도 그 자리에서 멈춘다
  const tourRef = useRef<number | null>(null);
  tourRef.current = tour;
  const stopTour = useCallback(() => {
    if (tourRef.current === null) return;
    tourRef.current = null;
    scene.current?.cancelCamera();
    setTour(null);
  }, []);

  // ── 실제 볼트: 처음 상태 확인(짧게 기다려 데모가 잠깐 보이는 일을 막음) · 주기 확인 · 수동 새로고침 ──
  const liveRef = useRef<LiveGraph | null>(null);
  liveRef.current = live;
  // 요청 세대: 자동 확인 · 수동 새로고침이 겹쳐 늦게 온 이전 응답이 최신 결과(비공개 반영 · 볼트 전환)를 덮지 않게, 가장 최근 요청의 응답만 쓴다
  const graphSeq = useRef(0), statusSeq = useRef(0);
  const loadGraph = useCallback(async () => {
    const seq = ++graphSeq.current;
    const g = await fetchGraph();
    if (g && seq === graphSeq.current) setLive(g);
    return g;
  }, []);
  useEffect(() => {
    if (NODES || FORCE_DEMO) return;
    let alive = true;
    const boot = window.setTimeout(() => setBooted(true), 2500);
    const sync = async (first: boolean) => {
      if (!first && document.hidden) return;
      const seq = ++statusSeq.current;
      const st = await fetchStatus();
      if (!alive || seq !== statusSeq.current) return;
      if (st) {
        const cur = liveRef.current;
        if (!cur || st.version !== cur.version || st.vaultKey !== cur.vaultKey || st.mode !== cur.mode) {
          if (st.mode === 'real') await loadGraph(); else { graphSeq.current++; setLive({ ...st, files: [], meta: {} }); }
        } else if (st.state !== cur.state || st.stale !== cur.stale || st.reason !== cur.reason || st.checkedAt !== cur.checkedAt) {
          setLive(prev => (prev ? { ...prev, state: st.state, stale: st.stale, reason: st.reason, checkedAt: st.checkedAt } : prev));
        }
      }
      if (first && alive) { window.clearTimeout(boot); setBooted(true); }
    };
    void sync(true);
    const timer = window.setInterval(() => { void sync(false); }, 3000);
    const onVisible = () => { if (!document.hidden) void sync(false); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; window.clearTimeout(boot); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [loadGraph]);
  const refreshLive = useCallback(async () => {
    setRefreshing(true);
    statusSeq.current++;
    await requestRefresh();
    await loadGraph();
    setRefreshing(false);
  }, [loadGraph]);

  // 갱신된 그래프에 맞추기: 남아 있는 선택 · 영역 필터 · 접힘은 유지, 사라진(삭제 · 비공개) 것은 정리, 새 경로는 펼친 상태로
  const prevGraph = useRef(graph);
  useEffect(() => {
    const prev = prevGraph.current;
    if (prev === graph) return;
    prevGraph.current = graph;
    stopTour();
    setHover(null);
    // 빠진 자료가 있으면 마지막 알림(이전 제목이 든 aria-live 문구)을 이름 없는 문구로 바꾼다
    if (prev.docs.some(d => !graph.byId.has(d.id))) {
      setAnnouncement(selectedRef.current && !graph.byId.has(selectedRef.current) ? '선택한 자료가 더 이상 표시되지 않아 선택을 해제했습니다' : '자료 목록이 갱신되었습니다');
    }
    setSelected(cur => (cur && graph.byId.has(cur) ? cur : null));
    setArea(cur => (cur && graph.byId.has(cur) ? cur : null));
    setExpanded(old => {
      // 새로 생긴 경로는 처음 상태 규칙을 따른다(작은 그래프 = 펼침, 큰 그래프 = 영역 색인만 펼침)
      const was = expandable(prev), now = expandable(graph), fresh = defaultExpanded(graph, foldMode), next = new Set<string>();
      for (const id of now) if (old.has(id) || (!was.has(id) && fresh.has(id))) next.add(id);
      return next;
    });
  }, [graph, stopTour]);
  // 데이터 출처가 바뀌면(실제 ↔ 데모 · 다른 볼트 · 차단 · 복구) 보존하지 않는다: 선택 · 영역 필터 · 연결 보기 · 펼침 · 카메라를 기본 전체 구도로
  const firstKey = useRef(true);
  useEffect(() => {
    setSelected(null); setPreview(null);
    if (firstKey.current) { firstKey.current = false; return; }
    stopTour(); setHover(null); setArea(null); setView('all'); setExpanded(defaultExpanded(graph, foldMode));
  }, [dataKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 실제 자료 미리보기: 선택할 때만 불투명 ID로 읽는다(갱신되면 다시 읽음)
  const [preview, setPreview] = useState<{ id: string; p: Preview } | null>(null);
  const previewDoc = selected ? graph.byId.get(selected) : undefined;
  useEffect(() => {
    if (!realMode || !previewDoc || previewDoc.kind !== 'material' || previewDoc.format === 'dir') { setPreview(null); return; }
    let alive = true;
    setPreview({ id: previewDoc.id, p: { state: 'loading' } });
    void fetchPreview(previewDoc.id).then(p => { if (alive) setPreview({ id: previewDoc.id, p }); });
    return () => { alive = false; };
  }, [realMode, previewDoc, live?.version]);

  const select = useCallback((id: string | null, opts: { focus?: boolean; reveal?: boolean; tour?: boolean } = {}) => {
    if (!opts.tour) stopTour();
    if (id === null) { setSelected(null); return; }
    const next = graph.byId.get(id);
    if (!next) return;
    if (!selected && !opts.tour) {
      const active = document.activeElement;
      returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    if (opts.reveal) setExpanded(e => revealPrimaryPath(graph, e, id));
    focusPanel.current = !!opts.focus;
    setSelected(id);
    scene.current?.focus(id);
    setAnnouncement(`${next.title} 선택 · ${KIND_LABEL[next.kind]}`);
  }, [graph, selected, stopTour]);

  const close = useCallback(() => {
    setSelected(null);
    // 선택 해제: 전체 구도로 돌아간다(정지 · 동작 줄이기에서는 즉시)
    scene.current?.fit();
    setAnnouncement('선택 해제');
    const back = returnFocus.current;
    returnFocus.current = null;
    requestAnimationFrame(() => {
      if (back && back.isConnected) back.focus({ preventScroll: true });
      else stage.current?.querySelector<HTMLElement>('canvas, .stage')?.focus({ preventScroll: true });
    });
  }, []);

  // 덩어리를 눌러 펼친 직후의 두 번 누르기(dblclick)가 곧바로 다시 접지 않게, 방금 펼친 문서를 잠깐 기억한다
  const clickOpened = useRef<{ id: string; at: number } | null>(null);
  const toggle = useCallback((id: string) => {
    if (!canExpand.has(id)) return;
    const recent = clickOpened.current;
    if (recent && recent.id === id && performance.now() - recent.at < 600) return;
    setExpanded(e => {
      const next = toggleExpanded(e, id);
      setAnnouncement(`${graph.byId.get(id)?.title} ${next.has(id) ? '펼침' : '접음'}`);
      return next;
    });
  }, [canExpand, graph]);

  /** 장면에서 누르기: 접힌 덩어리는 펼치면서 고르고, 나머지(펼친 색인 · 자료)는 고르기만 한다 */
  const pick = useCallback((id: string | null) => {
    if (!id) { if (selected) close(); return; }
    if (folded?.has(id)) {
      clickOpened.current = { id, at: performance.now() };
      setExpanded(e => new Set(e).add(id));
      select(id);
      setAnnouncement(`${graph.byId.get(id)?.title} 펼침 · 하위 ${folded.get(id)!.toLocaleString('ko-KR')}개`);
      return;
    }
    select(id);
  }, [folded, selected, close, select, graph]);

  // 자동 시연: 대표 영역 · 주제 · 문서를 차례로 방문. 직접 조작 · 검색 · 선택 · 정지 때 멈추고, 시연 단추로 다시 시작한다
  // 탭이 숨으면 남은 시간을 멈춰 두고, 돌아오면 같은 단계의 남은 시간부터 이어 간다(단계를 건너뛰지 않는다)
  const tourClock = useRef<{ step: number; remaining: number; started: number } | null>(null);
  useEffect(() => {
    if (tour === null) { tourClock.current = null; return; }
    const id = tourSteps[tour];
    if (!id) { setTour(null); setSelected(null); scene.current?.fit(); return; }
    if (tourClock.current?.step !== tour) {
      select(id, { tour: true, reveal: true });
      tourClock.current = { step: tour, remaining: reduced ? TOUR_MS * 1.3 : TOUR_MS, started: 0 };
    }
    let timer = 0;
    const run = () => {
      const clock = tourClock.current!;
      clock.started = performance.now();
      timer = window.setTimeout(() => setTour(t => (t === null ? null : t + 1)), clock.remaining);
    };
    const hold = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = 0;
      const clock = tourClock.current;
      if (clock) clock.remaining = Math.max(0, clock.remaining - (performance.now() - clock.started));
    };
    const onVisibility = () => { if (document.hidden) hold(); else if (!timer) run(); };
    if (!document.hidden) run();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { hold(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [tour]);

  const startTour = () => {
    scene.current?.skipOpening();
    setPaused(false);
    setTour(0);
    setAnnouncement('자동 시연 시작');
  };

  // 검색 · 패널 안 링크로 고르면 패널 제목으로 포커스를 옮기고, 새 문서는 맨 위부터 보여 준다
  useEffect(() => {
    if (!selected) return;
    panel.current?.querySelector('.panel__scroll')?.scrollTo({ top: 0 });
    if (focusPanel.current) panelTitle.current?.focus({ preventScroll: true });
    focusPanel.current = false;
  }, [selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const t = event.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing) return;
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        stopTour();
        search.current?.focus();
      } else if ((event.key === 'l' || event.key === 'L') && !event.metaKey && !event.ctrlKey && !event.altKey && !event.repeat && !(t instanceof HTMLSelectElement)) {
        event.preventDefault();
        toggleLabels();
      } else if (event.key === 'Escape') {
        if (selected) { event.preventDefault(); stopTour(); close(); }
        else if (tour !== null) { event.preventDefault(); stopTour(); }
      } else if (t instanceof HTMLCanvasElement) {
        const step = 0.12;
        const keys: Record<string, () => void> = {
          ArrowLeft: () => scene.current?.orbit(step, 0), ArrowRight: () => scene.current?.orbit(-step, 0),
          ArrowUp: () => scene.current?.orbit(0, -step), ArrowDown: () => scene.current?.orbit(0, step),
          '+': () => scene.current?.zoom(1.2), '=': () => scene.current?.zoom(1.2), '-': () => scene.current?.zoom(1 / 1.2), '0': () => scene.current?.fit()
        };
        if (keys[event.key]) { event.preventDefault(); stopTour(); keys[event.key](); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected, tour, close, stopTour, toggleLabels]);

  const introShown = intro && !opening && !selected && tour === null;
  useEffect(() => {
    if (!introShown) return;
    const timer = window.setTimeout(() => setIntro(false), 12000);
    const dismiss = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.intro')) return;
      setIntro(false);
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', dismiss, true);
    return () => { window.clearTimeout(timer); document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', dismiss, true); };
  }, [introShown]);

  const headerSize = useSize(header, true);
  const legendSize = useSize(legend, true);
  const panelSize = useSize(panel, !!doc);
  // 휴대폰 세로 조작 막대(오른쪽 아래, 상세 패널이 열리면 숨김): 전체 보기 · 이름표가 막대 밑에 깔리지 않게 그 사각형을 뺀다
  const corner = useCorner(dock, stage, mobile && !doc);
  const insets: Insets = mobile
    ? { top: headerSize.h + 8, right: 0, left: 0, bottom: doc ? panelSize.h : 64, corner: !doc && corner ? corner : undefined }
    : { top: headerSize.h + 8, right: doc ? panelSize.w + 32 : 24, left: legendOpen ? legendSize.w + 32 : 24, bottom: 64 };
  // 상단바 · 범례 크기를 잰 뒤에 3D 장면을 만든다(재기 전 값으로 첫 구도를 잡으면 곧바로 미끄러져 첫 누르기가 엇나간다)
  const insetsReady = headerSize.h > 0 && (mobile || !legendOpen || legendSize.w > 0) && (!mobile || !!doc || corner !== undefined);

  useEffect(() => {
    if (!params.has('perf')) return;
    window.__brainPerf = { nodes: graph.docs.length, edges: graph.edges.length, layoutMs: Math.round(layoutMs.current), layoutWhere: layoutWhere.current, stats: () => scene.current?.stats() ?? null, idOf: (path: string) => graph.idOfPath.get(path) ?? null,
      screenOf: (id: string) => scene.current?.screenOf(id) ?? null, view: () => scene.current?.view() ?? null, state: () => probe.current,
      orbit: (dTheta: number, dPhi: number) => scene.current?.orbit(dTheta, dPhi),
      glowDepth: (mode: GlowDepthMode) => scene.current?.debugGlowDepth(mode) };
  }, [graph, positions]);

  // 검증용(?perf=1에서만 노출): 지금 보이는 문서 · 선 · 선택 · 펼침
  const probe = useRef({});
  probe.current = { visible: [...visible], shown: shown.size, selected, expanded: [...expanded], view, area, paused, labels: labelsOn, orbit: tour === null && !selected && !paused && !reduced, tour, opening, fallback: !!fallback };
  const materials = graph.docs.filter(d => d.kind === 'material').length;
  // 실제 볼트: 서버가 읽으며 찾은 문제(이름 없는 문구)와 화면 변환 문제를 함께 보인다
  const problems = realMode ? [...(live?.problems ?? []), ...graph.problems] : graph.problems;
  // 닫은 알림은 문제 목록이 바뀔 때 다시 뜬다
  const warnKey = `${dataKey}|${problems.join('\n')}`;
  // 정지하지 않았으면 무엇이든(회전 · 신호 · 시연 · 전환) 움직이는 상태다. 한 번 누르면 모두 멈추고, 다시 누르면 회전까지 재생한다
  const motionOn = !paused;
  const toggleMotion = () => {
    stopTour();
    if (paused) { setPaused(false); setAnnouncement('모션 재생'); }
    else { setPaused(true); setAnnouncement('모션 정지'); }
  };
  const sourceView = liveView(live, realMode, NODES ? '합성 성능 데이터' : null, !booted);
  useEffect(() => { if (live && live.mode === 'real') setAnnouncement(sourceView.long); }, [sourceView.tone, live?.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const tourDoc = tour !== null && tourSteps[tour] ? graph.byId.get(tourSteps[tour]) : null;

  return (
    <div className={['app', doc && 'has-panel', mobile && 'is-mobile', fallback && 'is-fallback'].filter(Boolean).join(' ')}
      style={{ '--topbar-h': `${headerSize.h}px`, '--panel-r': doc && !mobile ? `${panelSize.w + 32}px` : '0px' } as CSSProperties}>
      <header ref={header} className="topbar">
        <div className="brand">
          <BrandMark />
          <div className="brand__text">
            <h1 className="brand__title">세컨드 브레인</h1>
            <p className="brand__sub">신경망 지도 · <LiveBadge view={sourceView} canRefresh={live?.mode === 'real'} refreshing={refreshing} onRefresh={() => { void refreshLive(); }} /></p>
          </div>
        </div>
        <SearchBox key={dataKey} ref={search} graph={graph} palette={palette}
          onPick={id => select(id, { focus: true, reveal: true })} onLeave={() => stage.current?.querySelector<HTMLElement>('canvas')?.focus({ preventScroll: true })}
          onActivity={() => { stopTour(); scene.current?.cancelCamera(); scene.current?.holdRotation(); }} />
        <div className="topbar__end">
          <p className="topbar__stats" title={!booted ? '볼트 연결을 확인하는 중입니다' : realMode ? `실제 볼트 항목 = 안내 문서 ${graph.docs.length - materials} + 연결 자료 ${materials}(폴더 포함, 비공개 제외) · 연결 = 화면에 그리는 선` : '합성 데모 데이터의 개수이며 실제 운영 수치가 아닙니다'}>
            {!booted ? <>항목 <b>–</b> · 자료 <b>–</b> · 연결 <b>–</b></> : <>{realMode ? '항목' : '가상 문서'} <b>{graph.docs.length}</b> · 자료 <b>{materials}</b> · 연결 <b>{graph.edges.length}</b></>}
          </p>
          <button type="button" className="tour-button" aria-pressed={tour !== null} onClick={() => (tour === null ? startTour() : stopTour())}>
            <TourIcon /><span>{tour === null ? '자동 시연' : '시연 멈춤'}</span>
          </button>
        </div>
      </header>

      <main ref={stage} className="stage" tabIndex={-1} aria-label="세컨드 브레인 연결망">
        {!booted ? (
          <p className="stage__boot" role="status">볼트 연결을 확인하는 중…</p>
        ) : fallback ? (
          <NetworkPreview graph={graph} palette={palette} layout={layout2d!} view={view} emphasis={emphasis} selected={selected} insets={insets} showLabels={labelsOn}
            onSelect={id => select(id)} />
        ) : !insetsReady ? null : !positions ? (
          <p className="stage__boot" role="status">문서 {graph.docs.length.toLocaleString('ko-KR')}개의 3D 자리를 계산하는 중…</p>
        ) : (
          <BrainCanvas ref={scene} viewKey={dataKey} graph={graph} palette={palette} positions={positions} visible={visible} shown={shown} emphasis={emphasis}
            selected={selected} hover={hover} folded={folded} insets={insets} paused={paused} autoRotate={tour === null && !selected} reduced={reduced} opening={opening} showLabels={labelsOn}
            hooks={{
              onPick: pick,
              onDoublePick: id => toggle(id),
              onHover: id => setHover(id),
              onInteract: () => stopTour(),
              onOpeningDone: () => setOpening(false),
              onContextLost: () => setFallback('3D 그리기(WebGL)가 중단되어 2D 대체 화면으로 바꿨습니다.'),
              onFail: reason => setFallback(`3D(WebGL)를 시작하지 못해 2D 대체 화면을 보여 줍니다. (${reason})`)
            }} />
        )}
        {fallback && <p className="stage__note stage__note--fallback" role="status">{fallback}</p>}
      </main>

      {booted && opening && !fallback && positions && (
        <div className="opening" role="status">
          <span>세컨드 브레인을 펼치는 중</span>
          <button type="button" onClick={() => scene.current?.skipOpening()}>건너뛰기</button>
        </div>
      )}

      {booted && introShown && (
        <Intro docs={graph.docs.length} edges={graph.edges.length} areas={graph.areas.length} topics={graph.mocs.length}
          tag={NODES ? '합성 성능 데이터' : realMode ? '실제 볼트 · 읽기 전용' : '합성 데모'} docLabel={realMode ? '항목' : '가상 문서'} still={paused || reduced} flat={!!fallback} onClose={() => setIntro(false)} />
      )}

      {tourDoc && (
        <div className="tour-caption" role="status" aria-live="polite">
          <span className="tour-caption__step">시연 {tour! + 1}/{tourSteps.length}</span>
          <strong>{tourDoc.title}</strong>
          <span className="tour-caption__text">{tourDoc.summary}</span>
          <button type="button" onClick={stopTour}>멈춤</button>
        </div>
      )}

      <div ref={legend} className="legend-slot">
        <LegendFilter graph={graph} palette={palette} area={area} onArea={a => { stopTour(); setArea(a); }} view={view} onView={v => { stopTour(); setView(v); }}
          open={legendOpen} onToggle={() => setLegendOpen(o => !o)}
          source={{ text: problems.length ? `${sourceView.long} 데이터 구조 문제 ${problems.length}건.` : sourceView.long, real: realMode, counts: realMode ? live?.counts ?? null : null, canRefresh: live?.mode === 'real', refreshing, onRefresh: () => { void refreshLive(); } }} />
      </div>

      <div ref={dock} className="dock" role="toolbar" aria-label="화면 조작">
        <button type="button" className="dock__button" onClick={toggleMotion} aria-label={motionOn ? '모션 정지' : '모션 재생'} title={motionOn ? '모션 정지' : '모션 재생'} disabled={!!fallback}>
          {motionOn ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="dock__button" onClick={() => { stopTour(); scene.current?.zoom(1 / 1.25); }} aria-label="축소" title="축소 (−)" disabled={!!fallback}><MinusIcon /></button>
        <button type="button" className="dock__button" onClick={() => { stopTour(); scene.current?.zoom(1.25); }} aria-label="확대" title="확대 (+)" disabled={!!fallback}><PlusIcon /></button>
        <button type="button" className="dock__button" onClick={() => { stopTour(); scene.current?.fit(); }} aria-label="전체 보기" title="전체 보기 (0)" disabled={!!fallback}><FitIcon /></button>
        <span className="dock__sep" aria-hidden="true" />
        <button type="button" className="dock__button dock__button--text" onClick={() => { stopTour(); setExpanded(defaultExpanded(graph, foldMode)); setAnnouncement('펼침을 처음 상태로'); }}
          aria-label="펼침 초기화" title="모든 경로를 처음처럼 펼칩니다"><FoldIcon /><span className="dock__label" aria-hidden="true">펼침 초기화</span><span className="dock__label-short" aria-hidden="true">초기화</span></button>
        <button type="button" className="dock__button dock__button--text dock__button--labels" onClick={toggleLabels} aria-pressed={labelsOn}
          aria-label="장면 이름표" title={labelsOn ? '장면 이름표 끄기 (L)' : '장면 이름표 켜기 (L)'}>
          <LabelIcon off={!labelsOn} /><span className="dock__label" aria-hidden="true">이름표 {labelsOn ? '켬' : '끔'}</span><span className="dock__label-short" aria-hidden="true">이름표</span>
        </button>
      </div>

      {doc && (
        <DetailPanel ref={panel} graph={graph} palette={palette} doc={doc} titleRef={panelTitle}
          onSelect={id => select(id, { focus: true, reveal: true })} onClose={close} compact={compact}
          motion={{ on: motionOn, onToggle: toggleMotion }}
          remote={realMode && doc.kind === 'material' ? (preview && preview.id === doc.id ? preview.p : { state: doc.format === 'dir' ? 'not-file' : 'loading' }) : null}
          fold={canExpand.has(doc.id) ? { open: expanded.has(doc.id), count: pathChildCount(graph, doc.id, view), onToggle: () => toggle(doc.id) } : undefined} />
      )}

      {problems.length > 0 && warnKey !== warnClosed && (
        <div className="data-warning" role="alert">
          <p className="data-warning__text" title={problems.slice(0, 3).join(' · ')}>데이터 구조 문제 {problems.length}건: {problems.slice(0, 3).join(' · ')}</p>
          <button type="button" className="data-warning__close" onClick={() => setWarnClosed(warnKey)} aria-label="구조 문제 알림 닫기(범례 '데이터'에 건수가 남음)" title="닫기"><CloseIcon /></button>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
