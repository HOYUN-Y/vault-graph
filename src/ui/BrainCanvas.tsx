// Thin wrapper that attaches the Three.js scene to React. If scene creation fails it reports via onFail (App draws the fallback) and renders nothing.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { BrainGraph } from '../core/graph';
import type { Vec3 } from '../core/layout3d';
import { brainShape } from '../core/layout3d';
import type { EdgeKind } from '../core/types';
import { BrainScene } from '../render/BrainScene';
import type { GlowDepthMode, Insets, SceneHooks } from '../render/BrainScene';
import { colorOf } from './theme';
import type { Palette } from './theme';

export interface BrainCanvasHandle {
  focus(id: string): void;
  fit(): void;
  cancelCamera(): void;
  zoom(factor: number): void;
  orbit(dTheta: number, dPhi: number): void;
  skipOpening(): void;
  /** Pause auto-rotation briefly (for interaction outside the canvas, such as typing in search) */
  holdRotation(): void;
  /** Render metrics · counts (nodes = doc count, voxels = cube pieces drawn) · auto-rotation state */
  stats(): ReturnType<BrainScene['stats']> | null;
  screenOf(id: string): { x: number; y: number } | null;
  /** For verification: current camera position · look-at point */
  view(): { pos: number[]; target: number[] } | null;
  /** For verification: glow depth comparison (lift default · raw previous · off no depth test) */
  debugGlowDepth(mode: GlowDepthMode): void;
}

interface Props {
  /** Data source key: when it changes, the previous camera is not carried over */
  viewKey?: string;
  graph: BrainGraph;
  palette: Palette;
  positions: Map<string, Vec3>;
  visible: ReadonlySet<string>;
  shown: ReadonlyMap<string, EdgeKind>;
  emphasis: ReadonlySet<string> | null;
  selected: string | null;
  hover: string | null;
  /** Folded clusters (large graphs only): visible but folded index → child count */
  folded?: ReadonlyMap<string, number>;
  insets: Insets;
  paused: boolean;
  autoRotate: boolean;
  reduced: boolean;
  opening: boolean;
  /** Show labels (text on/off) */
  showLabels: boolean;
  hooks: SceneHooks & { onFail(reason: string): void };
}

/** Brain-shape starting point per node: nodes on the left start in the left hemisphere, nodes on the right in the right one, then unfold into branches */
function brainStarts(graph: BrainGraph, positions: Map<string, Vec3>): Vec3[] {
  const pool = brainShape(graph.docs.length * 2 + 2, 'nodes');
  const left = pool.filter(p => p[0] < 0), right = pool.filter(p => p[0] >= 0);
  let l = 0, r = 0;
  return graph.docs.map(d => {
    if (d.id === graph.routerId) return [0, 0.05, 0] as Vec3;
    const x = positions.get(d.id)?.[0] ?? 0;
    return x < 0 ? left[l++ % left.length] : right[r++ % right.length];
  });
}

export const BrainCanvas = forwardRef<BrainCanvasHandle, Props>(function BrainCanvas(props, ref) {
  const { graph, palette, positions, visible, shown, emphasis, selected, hover, folded, insets, paused, autoRotate, reduced, opening, showLabels, hooks } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<BrainScene | null>(null);
  const latest = useRef(hooks);
  latest.current = hooks;
  // Initial values for building the scene (latest values). If dev mode rebuilds the scene before the opening ends, the opening shows again
  // A rebuild after a data update also carries over the current state (rotation · insets · visible docs · selection)
  const init = useRef({ paused, reduced, opening, autoRotate, insets, showLabels, view: { visible, shown, emphasis, selected, hover, folded } });
  init.current = { paused, reduced, opening, autoRotate, insets, showLabels, view: { visible, shown, emphasis, selected, hover, folded } };
  const lastView = useRef<{ pos: number[]; target: number[] } | null>(null);
  const lastPositions = useRef<Map<string, Vec3> | null>(null);
  // Camera is kept only across updates from the same data source. When the source changes (viewKey), start from the default full view
  const viewKeyRef = useRef(props.viewKey);
  const starts = useMemo(() => brainStarts(graph, positions), [graph, positions]);
  const dust = useMemo(() => brainShape(graph.docs.length > 1500 || matchMedia('(pointer: coarse)').matches ? 700 : 1500, 'dust'), [graph]);

  useEffect(() => {
    if (!canvas.current || !labels.current) return;
    if (viewKeyRef.current !== props.viewKey) { viewKeyRef.current = props.viewKey; lastView.current = null; lastPositions.current = null; }
    let s: BrainScene;
    try {
      const nodes = graph.docs.map((d, i) => ({ id: d.id, kind: d.kind, format: d.format, title: d.title, color: colorOf(palette, d.id),
        pos: positions.get(d.id) ?? [0, 0, 0] as Vec3, brain: starts[i], depth: graph.depth.get(d.id) ?? 0 }));
      const edges = graph.edges.map(e => ({ key: e.key, a: e.source, b: e.target, kind: e.kind }));
      s = new BrainScene(canvas.current, labels.current, nodes, edges, {
        onPick: id => latest.current.onPick(id),
        onDoublePick: id => latest.current.onDoublePick(id),
        onHover: id => latest.current.onHover(id),
        onInteract: () => latest.current.onInteract(),
        onOpeningDone: () => latest.current.onOpeningDone(),
        onContextLost: () => latest.current.onContextLost()
      }, { reducedMotion: init.current.reduced, paused: init.current.paused, opening: init.current.opening, dust });
    } catch (error) {
      latest.current.onFail(error instanceof Error ? error.message : String(error));
      return;
    }
    // When a data update rebuilds the scene, continue from the previous camera view (default framing on first build)
    s.setAutoRotate(init.current.autoRotate);
    s.setLabels(init.current.showLabels);
    s.setInsets(init.current.insets, !!lastView.current);
    s.setState(init.current.view);
    if (lastView.current) {
      s.setView(lastView.current);
      // Update from the same source: nodes move from their previous positions, and the selected node stays at the same screen position
      if (lastPositions.current) s.morphFrom(lastPositions.current, init.current.view.selected);
    }
    scene.current = s;
    return () => { lastView.current = s.getView(); lastPositions.current = s.positions(); s.dispose(); scene.current = null; };
  }, [graph, palette, positions, starts, dust, props.viewKey]);

  useEffect(() => { scene.current?.setState({ visible, shown, emphasis, selected, hover, folded }); }, [visible, shown, emphasis, selected, hover, folded]);
  useEffect(() => { scene.current?.setInsets(insets); }, [insets.top, insets.right, insets.bottom, insets.left, insets.corner?.w, insets.corner?.h]);
  useEffect(() => { scene.current?.setPaused(paused); }, [paused]);
  useEffect(() => { scene.current?.setAutoRotate(autoRotate); }, [autoRotate]);
  useEffect(() => { scene.current?.setReducedMotion(reduced); }, [reduced]);
  useEffect(() => { scene.current?.setLabels(showLabels); }, [showLabels]);

  useImperativeHandle(ref, () => ({
    focus: id => scene.current?.focus(id),
    fit: () => scene.current?.fit(),
    cancelCamera: () => scene.current?.cancelCamera(),
    zoom: f => scene.current?.zoom(f),
    orbit: (a, b) => scene.current?.orbit(a, b),
    skipOpening: () => scene.current?.skipOpening(),
    holdRotation: () => scene.current?.holdRotation(),
    stats: () => scene.current?.stats() ?? null,
    screenOf: id => scene.current?.screenOf(id) ?? null,
    view: () => scene.current?.getView() ?? null,
    debugGlowDepth: m => scene.current?.debugGlowDepth(m)
  }), []);

  return (
    <div className="stage__canvas">
      <canvas ref={canvas} className="scene" tabIndex={0}
        aria-label="Second Brain 3D neural network. Drag to rotate; scroll or pinch to zoom. Arrow keys rotate, + and − zoom, 0 fits all. Every item can be chosen by keyboard from search and the detail panel." />
      <div ref={labels} className="scene-labels" aria-hidden="true" />
    </div>
  );
});
