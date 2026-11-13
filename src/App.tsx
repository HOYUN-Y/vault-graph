// Full-screen layout: header (title · search · tour) · center 3D neural network (2D fallback on failure) · bottom-left filter · legend · bottom control dock · detail panel on the right (bottom on narrow screens).
// Shortcuts: / search, Esc closes search → clears selection → stops the tour. On the canvas: arrows rotate · +/− zoom · 0 fit all.
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
// Small screens (narrow width or short height) where the detail panel collapses to show the body first
const COMPACT = '(max-width: 720px), (max-height: 560px)';
const TOUR_MS = 4600;
const params = new URLSearchParams(location.search);
const NODES = Number(params.get('nodes')) || 0;
const FORCE_FALLBACK = params.get('webgl') === '0';
const SKIP_OPENING = params.get('opening') === '0';
// ?demo=1: show only the synthetic demo even if a real vault is configured
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
 * Bottom-right corner taken by the portrait phone control dock (px from the stage's right and bottom edges).
 * undefined = not measured yet, null = dock not visible (wide screen · detail panel open)
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
  // Data source: synthetic performance data (?nodes) · real vault (local read-only API, only with a verified result) · synthetic demo
  const [live, setLive] = useState<LiveGraph | null>(null);
  const [booted, setBooted] = useState(NODES > 0 || FORCE_DEMO);
  const [refreshing, setRefreshing] = useState(false);
  const realFiles = !NODES && live?.mode === 'real' && (live.state === 'connected' || live.state === 'unavailable') && live.files.length ? live.files : null;
  const dataset = useMemo(() => (NODES ? syntheticDataset(NODES) : realFiles ? { label: 'Real vault (read-only)', synthetic: false, files: realFiles } : demoDataset), [realFiles]);
  const graph = useMemo(() => buildGraph(dataset), [dataset]);
  const realMode = !!realFiles;
  const foldMode = realMode && live?.structure === 'workspace';
  // When the vault changes or real data is dropped because a rule failed, reset the open body, search and preview
  const dataKey = `${live?.mode ?? 'demo'}:${live?.vaultKey ?? ''}:${realMode ? 'real' : 'fallback'}`;
  const palette = useMemo(() => buildPalette(graph), [graph]);
  const layoutMs = useRef(0);
  const layoutWhere = useRef<'main' | 'worker'>('main');
  // Small graphs (real vault etc.) are computed right away; large graphs (5,000-doc demo) are computed in a worker so the screen doesn't freeze
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
  // Labels (node name tags) on/off: page state only. Shared by 3D and 2D; search, legend, panel text and accessible names are unaffected
  const [labelsOn, setLabelsOn] = useState(true);
  const [opening, setOpening] = useState(!SKIP_OPENING && !FORCE_FALLBACK && !matchMedia(REDUCED).matches);
  // First-screen intro (scale · first-action hint): closes on the first interaction or after a while
  const [intro, setIntro] = useState(true);
  const [tour, setTour] = useState<number | null>(null);
  const [fallback, setFallback] = useState<string | null>(FORCE_FALLBACK ? 'The URL has webgl=0, so the 2D fallback is shown.' : null);
  // Compute the 2D fallback layout only when the fallback is in use
  const flat = !!fallback;
  const layout2d = useMemo(() => (flat ? radialLayout(graph) : null), [graph, flat]);
  const [announcement, setAnnouncement] = useState('');
  const [warnClosed, setWarnClosed] = useState<string | null>(null);
  // Labels on/off: change only the labels; scene · layout · camera · motion stay as they are
  const toggleLabels = useCallback(() => {
    setLabelsOn(!labelsOn);
    setAnnouncement(labelsOn ? 'Labels off' : 'Labels on');
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
  // Workspace mode: folded indexes appear as clusters labelled with their child count and expand on click (indexed mode and the demo start fully expanded as before)
  const counts = useMemo(() => (foldMode ? foldCounts(graph) : null), [graph, foldMode]);
  const folded = useMemo(() => (counts ? foldedVisible(visible, expanded, counts) : undefined), [counts, visible, expanded]);
  const shown = useMemo(() => new Map<string, EdgeKind>(shownEdges(graph, { expanded, view, pinned: selected }, visible).map(e => [e.key, e.kind])), [graph, expanded, view, selected, visible]);

  const tourSteps = useMemo(() => {
    // Representative docs in the demo vault (path → unique ID; paths must match src/data/demo.ts). Synthetic performance data has none, so areas · MOCs are used instead
    const wanted = ['work.md', 'project-nova.md', 'moc-ai.md', 'src-work/operations/prompts/meeting-notes-summary-prompt.md', 'personal.md', 'project-ml-study.md', 'src-work/content/style-guide.md'];
    const ids = wanted.map(p => graph.idOfPath.get(p)).filter((id): id is string => !!id);
    if (ids.length >= 4) return ids;
    // Real vault · synthetic performance data: pick by structure instead of demo paths (area → its guides · sub-indexes → topic MOC → shared material → next area)
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

  // Stopping the tour also stops any camera move the tour started, right where it is
  const tourRef = useRef<number | null>(null);
  tourRef.current = tour;
  const stopTour = useCallback(() => {
    if (tourRef.current === null) return;
    tourRef.current = null;
    scene.current?.cancelCamera();
    setTour(null);
  }, []);

  // ── Real vault: initial status check (short wait so the demo doesn't flash) · periodic check · manual refresh ──
  const liveRef = useRef<LiveGraph | null>(null);
  liveRef.current = live;
  // Request generation: auto checks and manual refreshes can overlap, so only the latest request's response is used; a late older response must not overwrite a newer result (private rules applied · vault switch)
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

  // Fit to the updated graph: keep remaining selection · area filter · folds, drop what disappeared (deleted · private), new paths start expanded
  const prevGraph = useRef(graph);
  useEffect(() => {
    const prev = prevGraph.current;
    if (prev === graph) return;
    prevGraph.current = graph;
    stopTour();
    setHover(null);
    // If material was removed, replace the last announcement (aria-live text holding the old title) with a nameless message
    if (prev.docs.some(d => !graph.byId.has(d.id))) {
      setAnnouncement(selectedRef.current && !graph.byId.has(selectedRef.current) ? 'The selected item is no longer shown, so it was deselected' : 'Item list updated');
    }
    setSelected(cur => (cur && graph.byId.has(cur) ? cur : null));
    setArea(cur => (cur && graph.byId.has(cur) ? cur : null));
    setExpanded(old => {
      // New paths follow the initial-state rule (small graph = expanded, large graph = only area indexes expanded)
      const was = expandable(prev), now = expandable(graph), fresh = defaultExpanded(graph, foldMode), next = new Set<string>();
      for (const id of now) if (old.has(id) || (!was.has(id) && fresh.has(id))) next.add(id);
      return next;
    });
  }, [graph, stopTour]);
  // When the data source changes (real ↔ demo · another vault · blocked · recovered), nothing is kept: selection · area filter · link view · expansion · camera return to the default full view
  const firstKey = useRef(true);
  useEffect(() => {
    setSelected(null); setPreview(null);
    if (firstKey.current) { firstKey.current = false; return; }
    stopTour(); setHover(null); setArea(null); setView('all'); setExpanded(defaultExpanded(graph, foldMode));
  }, [dataKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real material preview: read by opaque ID only when selected (re-read on update)
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
    setAnnouncement(`${next.title} selected · ${KIND_LABEL[next.kind]}`);
  }, [graph, selected, stopTour]);

  const close = useCallback(() => {
    setSelected(null);
    // Deselect: return to the full view (instantly when paused or with reduced motion)
    scene.current?.fit();
    setAnnouncement('Selection cleared');
    const back = returnFocus.current;
    returnFocus.current = null;
    requestAnimationFrame(() => {
      if (back && back.isConnected) back.focus({ preventScroll: true });
      else stage.current?.querySelector<HTMLElement>('canvas, .stage')?.focus({ preventScroll: true });
    });
  }, []);

  // Briefly remember the doc just expanded from a cluster so the double-click (dblclick) right after doesn't fold it again
  const clickOpened = useRef<{ id: string; at: number } | null>(null);
  const toggle = useCallback((id: string) => {
    if (!canExpand.has(id)) return;
    const recent = clickOpened.current;
    if (recent && recent.id === id && performance.now() - recent.at < 600) return;
    setExpanded(e => {
      const next = toggleExpanded(e, id);
      setAnnouncement(`${graph.byId.get(id)?.title} ${next.has(id) ? 'expanded' : 'collapsed'}`);
      return next;
    });
  }, [canExpand, graph]);

  /** Click in the scene: a folded cluster is expanded and selected; anything else (expanded index · material) is only selected */
  const pick = useCallback((id: string | null) => {
    if (!id) { if (selected) close(); return; }
    if (folded?.has(id)) {
      clickOpened.current = { id, at: performance.now() };
      setExpanded(e => new Set(e).add(id));
      select(id);
      setAnnouncement(`${graph.byId.get(id)?.title} expanded · ${folded.get(id)!.toLocaleString('en-US')} ${folded.get(id) === 1 ? 'child' : 'children'}`);
      return;
    }
    select(id);
  }, [folded, selected, close, select, graph]);

  // Auto tour: visits representative areas · topics · docs in turn. Stops on direct interaction · search · selection · pause; the tour button restarts it
  // When the tab is hidden the remaining time is held, and on return the same step resumes with its remaining time (no steps are skipped)
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
    setAnnouncement('Auto tour started');
  };

  // When picked from search or a panel link, move focus to the panel title and show the new doc from the top
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
  // Portrait phone control dock (bottom right, hidden while the detail panel is open): exclude its rectangle so fit-all and labels don't end up under it
  const corner = useCorner(dock, stage, mobile && !doc);
  const insets: Insets = mobile
    ? { top: headerSize.h + 8, right: 0, left: 0, bottom: doc ? panelSize.h : 64, corner: !doc && corner ? corner : undefined }
    : { top: headerSize.h + 8, right: doc ? panelSize.w + 32 : 24, left: legendOpen ? legendSize.w + 32 : 24, bottom: 64 };
  // Build the 3D scene after measuring the top bar and legend (framing with pre-measure values makes the view slide right away and the first click misses)
  const insetsReady = headerSize.h > 0 && (mobile || !legendOpen || legendSize.w > 0) && (!mobile || !!doc || corner !== undefined);

  useEffect(() => {
    if (!params.has('perf')) return;
    window.__brainPerf = { nodes: graph.docs.length, edges: graph.edges.length, layoutMs: Math.round(layoutMs.current), layoutWhere: layoutWhere.current, stats: () => scene.current?.stats() ?? null, idOf: (path: string) => graph.idOfPath.get(path) ?? null,
      screenOf: (id: string) => scene.current?.screenOf(id) ?? null, view: () => scene.current?.view() ?? null, state: () => probe.current,
      orbit: (dTheta: number, dPhi: number) => scene.current?.orbit(dTheta, dPhi),
      glowDepth: (mode: GlowDepthMode) => scene.current?.debugGlowDepth(mode) };
  }, [graph, positions]);

  // For verification (exposed only with ?perf=1): currently visible docs · edges · selection · expansion
  const probe = useRef({});
  probe.current = { visible: [...visible], shown: shown.size, selected, expanded: [...expanded], view, area, paused, labels: labelsOn, orbit: tour === null && !selected && !paused && !reduced, tour, opening, fallback: !!fallback };
  const materials = graph.docs.filter(d => d.kind === 'material').length;
  // Real vault: show problems the server found while reading (nameless messages) together with display conversion problems
  const problems = realMode ? [...(live?.problems ?? []), ...graph.problems] : graph.problems;
  // A dismissed warning comes back when the problem list changes
  const warnKey = `${dataKey}|${problems.join('\n')}`;
  // Unless paused, something is moving (rotation · signals · tour · transitions). One press stops everything; another press resumes it all, rotation included
  const motionOn = !paused;
  const toggleMotion = () => {
    stopTour();
    if (paused) { setPaused(false); setAnnouncement('Motion playing'); }
    else { setPaused(true); setAnnouncement('Motion paused'); }
  };
  const sourceView = liveView(live, realMode, NODES ? 'Synthetic performance data' : null, !booted);
  useEffect(() => { if (live && live.mode === 'real') setAnnouncement(sourceView.long); }, [sourceView.tone, live?.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const tourDoc = tour !== null && tourSteps[tour] ? graph.byId.get(tourSteps[tour]) : null;

  return (
    <div className={['app', doc && 'has-panel', mobile && 'is-mobile', fallback && 'is-fallback'].filter(Boolean).join(' ')}
      style={{ '--topbar-h': `${headerSize.h}px`, '--panel-r': doc && !mobile ? `${panelSize.w + 32}px` : '0px' } as CSSProperties}>
      <header ref={header} className="topbar">
        <div className="brand">
          <BrandMark />
          <div className="brand__text">
            <h1 className="brand__title">Second Brain</h1>
            <p className="brand__sub">Neural map · <LiveBadge view={sourceView} canRefresh={live?.mode === 'real'} refreshing={refreshing} onRefresh={() => { void refreshLive(); }} /></p>
          </div>
        </div>
        <SearchBox key={dataKey} ref={search} graph={graph} palette={palette}
          onPick={id => select(id, { focus: true, reveal: true })} onLeave={() => stage.current?.querySelector<HTMLElement>('canvas')?.focus({ preventScroll: true })}
          onActivity={() => { stopTour(); scene.current?.cancelCamera(); scene.current?.holdRotation(); }} />
        <div className="topbar__end">
          <p className="topbar__stats" title={!booted ? 'Checking the vault connection' : realMode ? `Real vault items = guide documents ${graph.docs.length - materials} + linked materials ${materials} (folders included, private excluded) · Links = lines drawn on screen` : 'Counts from synthetic demo data, not real figures'}>
            {!booted ? <>Items <b>–</b> · Materials <b>–</b> · Links <b>–</b></> : <>{realMode ? 'Items' : 'Demo docs'} <b>{graph.docs.length}</b> · Materials <b>{materials}</b> · Links <b>{graph.edges.length}</b></>}
          </p>
          <button type="button" className="tour-button" aria-pressed={tour !== null} onClick={() => (tour === null ? startTour() : stopTour())}>
            <TourIcon /><span>{tour === null ? 'Auto tour' : 'Stop tour'}</span>
          </button>
        </div>
      </header>

      <main ref={stage} className="stage" tabIndex={-1} aria-label="Second Brain network">
        {!booted ? (
          <p className="stage__boot" role="status">Checking the vault connection…</p>
        ) : fallback ? (
          <NetworkPreview graph={graph} palette={palette} layout={layout2d!} view={view} emphasis={emphasis} selected={selected} insets={insets} showLabels={labelsOn}
            onSelect={id => select(id)} />
        ) : !insetsReady ? null : !positions ? (
          <p className="stage__boot" role="status">Computing 3D positions for {graph.docs.length.toLocaleString('en-US')} docs…</p>
        ) : (
          <BrainCanvas ref={scene} viewKey={dataKey} graph={graph} palette={palette} positions={positions} visible={visible} shown={shown} emphasis={emphasis}
            selected={selected} hover={hover} folded={folded} insets={insets} paused={paused} autoRotate={tour === null && !selected} reduced={reduced} opening={opening} showLabels={labelsOn}
            hooks={{
              onPick: pick,
              onDoublePick: id => toggle(id),
              onHover: id => setHover(id),
              onInteract: () => stopTour(),
              onOpeningDone: () => setOpening(false),
              onContextLost: () => setFallback('3D rendering (WebGL) stopped, so the view switched to the 2D fallback.'),
              onFail: reason => setFallback(`Couldn't start 3D (WebGL), so the 2D fallback is shown. (${reason})`)
            }} />
        )}
        {fallback && <p className="stage__note stage__note--fallback" role="status">{fallback}</p>}
      </main>

      {booted && opening && !fallback && positions && (
        <div className="opening" role="status">
          <span>Unfolding the Second Brain</span>
          <button type="button" onClick={() => scene.current?.skipOpening()}>Skip</button>
        </div>
      )}

      {booted && introShown && (
        <Intro docs={graph.docs.length} edges={graph.edges.length} areas={graph.areas.length} topics={graph.mocs.length}
          tag={NODES ? 'Synthetic performance data' : realMode ? 'Real vault · read-only' : 'Synthetic demo'} docLabel={realMode ? 'items' : 'demo docs'} still={paused || reduced} flat={!!fallback} onClose={() => setIntro(false)} />
      )}

      {tourDoc && (
        <div className="tour-caption" role="status" aria-live="polite">
          <span className="tour-caption__step">Tour {tour! + 1}/{tourSteps.length}</span>
          <strong>{tourDoc.title}</strong>
          <span className="tour-caption__text">{tourDoc.summary}</span>
          <button type="button" onClick={stopTour}>Stop</button>
        </div>
      )}

      <div ref={legend} className="legend-slot">
        <LegendFilter graph={graph} palette={palette} area={area} onArea={a => { stopTour(); setArea(a); }} view={view} onView={v => { stopTour(); setView(v); }}
          open={legendOpen} onToggle={() => setLegendOpen(o => !o)}
          source={{ text: problems.length ? `${sourceView.long} Data structure problems: ${problems.length}.` : sourceView.long, real: realMode, counts: realMode ? live?.counts ?? null : null, canRefresh: live?.mode === 'real', refreshing, onRefresh: () => { void refreshLive(); } }} />
      </div>

      <div ref={dock} className="dock" role="toolbar" aria-label="View controls">
        <button type="button" className="dock__button" onClick={toggleMotion} aria-label={motionOn ? 'Pause motion' : 'Play motion'} title={motionOn ? 'Pause motion' : 'Play motion'} disabled={!!fallback}>
          {motionOn ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="dock__button" onClick={() => { stopTour(); scene.current?.zoom(1 / 1.25); }} aria-label="Zoom out" title="Zoom out (−)" disabled={!!fallback}><MinusIcon /></button>
        <button type="button" className="dock__button" onClick={() => { stopTour(); scene.current?.zoom(1.25); }} aria-label="Zoom in" title="Zoom in (+)" disabled={!!fallback}><PlusIcon /></button>
        <button type="button" className="dock__button" onClick={() => { stopTour(); scene.current?.fit(); }} aria-label="Fit all" title="Fit all (0)" disabled={!!fallback}><FitIcon /></button>
        <span className="dock__sep" aria-hidden="true" />
        <button type="button" className="dock__button dock__button--text" onClick={() => { stopTour(); setExpanded(defaultExpanded(graph, foldMode)); setAnnouncement('Folds reset to the initial state'); }}
          aria-label="Reset folds" title="Return every path to its initial expand/collapse state"><FoldIcon /><span className="dock__label" aria-hidden="true">Reset folds</span><span className="dock__label-short" aria-hidden="true">Reset</span></button>
        <button type="button" className="dock__button dock__button--text dock__button--labels" onClick={toggleLabels} aria-pressed={labelsOn}
          aria-label="Labels" title={labelsOn ? 'Hide labels (L)' : 'Show labels (L)'}>
          <LabelIcon off={!labelsOn} /><span className="dock__label" aria-hidden="true">Labels {labelsOn ? 'on' : 'off'}</span><span className="dock__label-short" aria-hidden="true">Labels</span>
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
          <p className="data-warning__text" title={problems.slice(0, 3).join(' · ')}>Data structure problems ({problems.length}): {problems.slice(0, 3).join(' · ')}</p>
          <button type="button" className="data-warning__close" onClick={() => setWarnClosed(warnKey)} aria-label="Dismiss structure problem warning (the count stays under 'Data' in the legend)" title="Close"><CloseIcon /></button>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
