// Three.js 장면을 React 화면에 붙이는 얇은 래퍼. 장면 생성에 실패하면 onFail로 알리고(대체 화면은 App이 그린다) 아무것도 그리지 않는다.
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
  /** 자동 회전을 잠시 쉬게 한다(검색 입력 같은 화면 밖 조작) */
  holdRotation(): void;
  /** 그리기 측정 · 개수(노드 = 문서 수, voxels = 그린 큐브 조각 수) · 자동 회전 상태 */
  stats(): ReturnType<BrainScene['stats']> | null;
  screenOf(id: string): { x: number; y: number } | null;
  /** 검증용: 지금 카메라 위치 · 바라보는 점 */
  view(): { pos: number[]; target: number[] } | null;
  /** 검증용: 발광 깊이 비교(lift 기본 · raw 이전 · off 깊이 검사 없음) */
  debugGlowDepth(mode: GlowDepthMode): void;
}

interface Props {
  /** 데이터 출처 식별값: 바뀌면 직전 카메라를 잇지 않는다 */
  viewKey?: string;
  graph: BrainGraph;
  palette: Palette;
  positions: Map<string, Vec3>;
  visible: ReadonlySet<string>;
  shown: ReadonlyMap<string, EdgeKind>;
  emphasis: ReadonlySet<string> | null;
  selected: string | null;
  hover: string | null;
  /** 접힌 덩어리(큰 그래프만): 보이지만 접힌 색인 → 하위 개수 */
  folded?: ReadonlyMap<string, number>;
  insets: Insets;
  paused: boolean;
  autoRotate: boolean;
  reduced: boolean;
  opening: boolean;
  /** 장면 이름표 표시(글자 켬/끔) */
  showLabels: boolean;
  hooks: SceneHooks & { onFail(reason: string): void };
}

/** 노드마다 뇌 형상 출발점: 자리가 왼쪽이면 왼쪽 반구, 오른쪽이면 오른쪽 반구에서 출발해 가지로 풀린다 */
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
  // 장면을 만들 때 쓰는 초기값(가장 최근 값). 개발 모드에서 장면을 다시 만들어도 오프닝이 끝나기 전이면 다시 보인다
  // 데이터 갱신으로 장면을 다시 만들 때도 지금 상태(회전 여부 · 여백 · 보이는 문서 · 선택)를 그대로 넘긴다
  const init = useRef({ paused, reduced, opening, autoRotate, insets, showLabels, view: { visible, shown, emphasis, selected, hover, folded } });
  init.current = { paused, reduced, opening, autoRotate, insets, showLabels, view: { visible, shown, emphasis, selected, hover, folded } };
  const lastView = useRef<{ pos: number[]; target: number[] } | null>(null);
  const lastPositions = useRef<Map<string, Vec3> | null>(null);
  // 카메라 보존 범위: 같은 데이터 출처의 갱신만. 출처가 바뀌면(viewKey) 기본 전체 구도로 시작한다
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
    // 데이터 갱신으로 장면을 다시 만들면 직전 카메라 시점을 그대로 잇는다(처음 만들 때는 기본 구도)
    s.setAutoRotate(init.current.autoRotate);
    s.setLabels(init.current.showLabels);
    s.setInsets(init.current.insets, !!lastView.current);
    s.setState(init.current.view);
    if (lastView.current) {
      s.setView(lastView.current);
      // 같은 출처의 갱신: 노드는 이전 자리에서 옮겨 가고, 선택 노드는 화면에서 같은 자리에 머문다
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
        aria-label="세컨드 브레인 3D 신경망. 끌어서 돌리고 휠 · 두 손가락으로 확대합니다. 화살표 키로 돌리고 + · − 키로 확대, 0 키로 전체 보기. 모든 자료는 검색과 상세 패널에서 키보드로 고를 수 있습니다." />
      <div ref={labels} className="scene-labels" aria-hidden="true" />
    </div>
  );
});
