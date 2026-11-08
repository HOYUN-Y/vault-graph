// 2D 대체 연결망(정적 SVG): WebGL을 쓸 수 없을 때(?webgl=0 · 시작 실패 · 컨텍스트 중단) 3D 대신 보여 준다.
// 자리(layout2d)는 데이터만으로 정해져 필터 · 연결 보기 · 선택에 따라 움직이지 않는다. 패널이 열리면 남은 화면 가운데로 전체가 비킨다.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BrainGraph } from '../core/graph';
import { edgesInView, neighborsOf } from '../core/graph';
import type { Placement } from '../core/layout2d';
import type { Edge, EdgeView, NodeKind } from '../core/types';
import { VoxelMark } from './Glyph';
import { KIND_LABEL, TOPIC_COLOR, colorOf } from './theme';
import type { Palette } from './theme';

/** corner: 오른쪽 아래 구석을 가리는 도구줄(휴대폰 세로 조작 막대)의 크기(px, 화면 오른쪽 · 아래 가장자리부터) */
export interface Insets { top: number; right: number; bottom: number; left: number; corner?: { w: number; h: number } }

interface Props {
  graph: BrainGraph;
  palette: Palette;
  layout: Map<string, Placement>;
  view: EdgeView;
  emphasis: Set<string> | null;
  selected: string | null;
  insets: Insets;
  /** 노드 이름표 표시(글자 켬/끔). 끄면 선택 · 가리킴 이름표도 숨기고, 노드의 title(접근성 이름)은 그대로 둔다 */
  showLabels: boolean;
  onSelect(id: string): void;
}

const SIZE: Record<NodeKind, number> = { router: 13, area: 11, subindex: 7.5, guide: 6.5, moc: 7.5, material: 4.2 };
const FONT: Record<NodeKind, number> = { router: 13, area: 15, subindex: 12, guide: 11.5, moc: 12.5, material: 11.5 };
const ORDER: Record<NodeKind, number> = { material: 0, guide: 1, subindex: 2, moc: 3, area: 4, router: 5 };
const BG = '#162033';
// 이름표 우선순위(작을수록 먼저 자리를 잡는다)와 겹침 여백. 겹치는 낮은 순위 이름표는 숨기고 점은 그대로 둔다
const LABEL_RANK: Record<NodeKind, number> = { router: 2, area: 3, moc: 4, subindex: 5, guide: 6, material: 8 };
const LABEL_GAP = 3;

type Pt = { x: number; y: number };
type Anchor = 'start' | 'middle' | 'end';

/** 이름표 자리: 가운데에서 바깥쪽으로. MOC는 가운데 가까이 모여 있어 항상 바깥 옆으로 둔다(위 · 아래 가운데 정렬이면 서로 겹친다) */
function labelSpot(kind: NodeKind, p: Pt, size: number): { anchor: Anchor; lx: number; ly: number } {
  const len = Math.hypot(p.x, p.y);
  const dir = len > 0.001 ? { x: p.x / len, y: p.y / len } : { x: 0, y: 1 };
  const anchor: Anchor = kind === 'moc' ? (dir.x >= 0 ? 'start' : 'end') : dir.x > 0.3 ? 'start' : dir.x < -0.3 ? 'end' : 'middle';
  const gap = size + 7;
  const lx = anchor === 'middle' ? 0 : kind === 'moc' ? Math.sign(dir.x || 1) * gap : dir.x * gap;
  const ly = anchor === 'middle' ? (dir.y >= 0 ? gap + FONT[kind] * 0.8 : -gap) : dir.y * gap + FONT[kind] * 0.35;
  return { anchor, lx, ly };
}
const textWidth = (text: string, size: number) => [...text].reduce((w, ch) => w + (ch.charCodeAt(0) >= 0x1100 ? size : size * 0.6), 0);

/**
 * 둥근 배치의 반지름 · 중심 높이. 휴대폰 세로 조작 막대(corner)가 있으면 배치가 막대 사각형에 닿지 않게 하고,
 * 위아래에 남는 높이가 있으면 중심을 조금 올려(막대에서 멀어지게) 배치가 덜 작아지는 높이를 고른다.
 */
function fitRing(freeW: number, freeH: number, portrait: boolean, cx: number, insets: Insets, box: { w: number; h: number }) {
  const base = Math.min(freeW / 2 - (portrait ? 30 : 110), freeH / 2 - (portrait ? 46 : 36));
  const cy0 = insets.top + freeH / 2;
  const corner = insets.corner;
  if (!corner || corner.w <= 0 || corner.h <= 0) return { R: Math.max(70, base), cy: cy0 };
  // 막대 왼쪽 · 위 선(노드 반지름과 여유 12px)
  const ex = box.w - corner.w - 12, ey = box.h - corner.h - 12;
  const room = (cy: number) => cx < ex && cy < ey ? Math.hypot(ex - cx, ey - cy) : cx < ex ? ex - cx : cy < ey ? ey - cy : 0;
  let best = { R: -Infinity, cy: cy0 };
  for (let s = 0; s <= freeH / 4; s += 4) {
    const cy = cy0 - s;
    const R = Math.min(freeW / 2 - (portrait ? 30 : 110), freeH / 2 - (portrait ? 46 : 36) - s, room(cy));
    if (R > best.R + 0.5) best = { R, cy };
  }
  return { R: Math.max(70, best.R), cy: best.cy };
}

export function NetworkPreview({ graph, palette, layout, view, emphasis, selected, insets, showLabels, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
  // 터치(굵은 포인터)에서는 누르는 영역을 넓힌다(지름 40px)
  const [coarse, setCoarse] = useState(() => matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    const list = matchMedia('(pointer: coarse)');
    const on = () => setCoarse(list.matches);
    list.addEventListener('change', on);
    return () => list.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const edges = useMemo(() => edgesInView(graph, view), [graph, view]);
  const inView = useMemo(() => {
    const set = new Set<string>([graph.routerId]);
    for (const e of edges) { set.add(e.source); set.add(e.target); }
    return set;
  }, [graph, edges]);
  const lit = useMemo(() => (selected ? neighborsOf(edges, selected) : null), [edges, selected]);

  const freeW = Math.max(0, box.w - insets.left - insets.right), freeH = Math.max(0, box.h - insets.top - insets.bottom);
  const portrait = freeH > freeW * 1.15;
  const cx = insets.left + freeW / 2;
  const { R, cy } = fitRing(freeW, freeH, portrait, cx, insets, box);
  const px = 1 / R;

  const pos = useMemo(() => {
    const out = new Map<string, Pt>();
    for (const [id, p] of layout) out.set(id, portrait ? { x: -p.y, y: p.x } : { x: p.x, y: p.y });
    return out;
  }, [layout, portrait]);

  const curve = (e: Edge) => {
    const s = pos.get(e.source), t = pos.get(e.target);
    if (!s || !t) return null;
    const mid = { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
    let c: Pt;
    if (e.kind === 'primary') {
      const rs = Math.hypot(s.x, s.y), rt = Math.hypot(t.x, t.y) || 1, k = (rs + rt) / 2 / rt;
      c = { x: t.x * k, y: t.y * k };
    } else {
      const pull = e.kind === 'index' ? 0.3 : 0.5;
      c = { x: mid.x * pull, y: mid.y * pull };
    }
    const f = (v: number) => v.toFixed(4);
    return `M${f(s.x)} ${f(s.y)}Q${f(c.x)} ${f(c.y)} ${f(t.x)} ${f(t.y)}`;
  };

  const density = Math.min(1, Math.max(0.3, Math.sqrt(500 / Math.max(edges.length, 1))));
  const edgeStyle = (e: Edge) => {
    const touches = (id: string | null) => !!id && (e.source === id || e.target === id);
    // 선이 많으면 겹친 선이 화면을 덮지 않게 기본 진하기를 낮춘다(주제 연결 금색은 한 번 더)
    const base = (e.kind === 'primary' ? 0.42 : e.kind === 'index' ? 0.72 : 0.34) * density * (e.kind === 'topic' && density < 1 ? 0.6 : 1);
    const inArea = !emphasis || (emphasis.has(e.target) && (emphasis.has(e.source) || e.source === graph.routerId));
    let opacity = base;
    if (selected) opacity = touches(selected) ? 0.95 : base * 0.2;
    else if (!inArea) opacity = base * 0.2;
    else if (touches(hover)) opacity = Math.min(1, base * 2.2);
    const color = e.kind === 'topic' ? TOPIC_COLOR : colorOf(palette, e.kind === 'index' ? e.source : e.target);
    const width = (e.kind === 'index' ? 1.3 : 1.1) + (touches(selected) ? 1.1 : 0);
    return { opacity, color, width, lit: touches(selected) };
  };

  const ordered = useMemo(() => [...graph.docs].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]), [graph]);

  // 이름표 겹침 제어: 화면 좌표에서 순위대로 자리를 잡고, 겹치는 이름표는 숨긴다(선택 · 가리킴은 항상 보임)
  const labelled = useMemo(() => {
    const cands: { id: string; rank: number; box: { x: number; y: number; w: number; h: number } }[] = [];
    for (const doc of graph.docs) {
      const p = pos.get(doc.id);
      if (!p) continue;
      const isSel = doc.id === selected, isHover = doc.id === hover, isLit = !!lit && lit.has(doc.id);
      const hub = doc.kind !== 'material';
      if (!(hub || isSel || isHover || isLit)) continue;
      const size = SIZE[doc.kind] + (isSel ? 2 : 0), font = FONT[doc.kind];
      const { anchor, lx, ly } = labelSpot(doc.kind, p, size);
      const w = textWidth(doc.title, font) + 6, h = font * 1.25;
      const sx = cx + p.x * R + lx, sy = cy + p.y * R + ly;
      const x = anchor === 'start' ? sx - 3 : anchor === 'end' ? sx - w + 3 : sx - w / 2;
      const rank = isSel ? 0 : isHover ? 1 : LABEL_RANK[doc.kind] - (isLit ? 0.5 : 0);
      cands.push({ id: doc.id, rank, box: { x, y: sy - font * 0.95, w, h } });
    }
    cands.sort((a, b) => a.rank - b.rank);
    const placed: typeof cands[number]['box'][] = [];
    const out = new Set<string>();
    const hit = (a: typeof placed[number], b: typeof placed[number]) =>
      !(a.x + a.w + LABEL_GAP <= b.x || b.x + b.w + LABEL_GAP <= a.x || a.y + a.h + LABEL_GAP <= b.y || b.y + b.h + LABEL_GAP <= a.y);
    for (const c of cands) {
      const outside = c.box.x < 2 || c.box.x + c.box.w > box.w - 2 || c.box.y < 2 || c.box.y + c.box.h > box.h - 2;
      if (c.rank > 1 && (outside || placed.some(p => hit(c.box, p)))) continue;
      placed.push(c.box);
      out.add(c.id);
    }
    return out;
  }, [graph, pos, selected, hover, lit, cx, cy, R, box.w, box.h]);
  const style = { transform: `translate(${cx}px, ${cy}px) scale(${R})` } as CSSProperties;

  return (
    <div ref={host} className="stage__canvas">
      {box.w > 0 && (
        <svg className="net" width={box.w} height={box.h} role="img"
          aria-label={`세컨드 브레인 연결망 임시 미리보기. 문서 ${graph.docs.length}개, 연결 ${edges.length}개. 검색과 상세 패널에서 같은 내용을 키보드로 확인할 수 있습니다.`}>
          <defs>
            <filter id="net-soft" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="7" /></filter>
          </defs>
          <g className="net__world" style={style}>
            <g className="net__edges">
              {edges.map(e => {
                const d = curve(e);
                if (!d) return null;
                const s = edgeStyle(e);
                return (
                  <path key={e.key} d={d} className={s.lit ? 'edge is-lit' : 'edge'} fill="none" stroke={s.color} strokeOpacity={s.opacity}
                    strokeWidth={s.width * px} strokeDasharray={e.kind === 'index' ? `${3 * px} ${4 * px}` : undefined} strokeLinecap="round" />
                );
              })}
            </g>
            <g className="net__nodes">
              {ordered.map(doc => {
                const p = pos.get(doc.id);
                if (!p) return null;
                const isSel = doc.id === selected;
                const dim = (emphasis && !emphasis.has(doc.id) && doc.id !== graph.routerId) || (lit && !isSel && !lit.has(doc.id));
                const opacity = dim ? 0.2 : inView.has(doc.id) ? 1 : 0.38;
                const color = colorOf(palette, doc.id), size = SIZE[doc.kind] + (isSel ? 2 : 0);
                const hub = doc.kind !== 'material';
                const { anchor, lx, ly } = labelSpot(doc.kind, p, size);
                return (
                  <g key={doc.id} data-id={doc.id} className={['node', `node--${doc.kind}`, isSel && 'is-selected', dim && 'is-dim'].filter(Boolean).join(' ')}
                    transform={`translate(${p.x.toFixed(4)} ${p.y.toFixed(4)}) scale(${px})`} style={{ opacity }}
                    onClick={() => onSelect(doc.id)} onPointerEnter={() => setHover(doc.id)} onPointerLeave={() => setHover(h => (h === doc.id ? null : h))}>
                    <title>{`${doc.title} · ${KIND_LABEL[doc.kind]}`}</title>
                    {(hub || isSel) && <circle className="node__glow" r={size * (doc.kind === 'router' ? 3.2 : 2.4)} fill={color} opacity={doc.kind === 'router' ? 0.42 : isSel ? 0.5 : 0.2} filter="url(#net-soft)" />}
                    {isSel && <circle r={size + 7} className="node__ring" />}
                    <VoxelMark kind={doc.kind} format={doc.format} color={color} r={size * 1.15} bg={BG} />
                    <circle className="node__hit" r={Math.max(size + 6, coarse ? 20 : 12)} fill="transparent" />
                    {showLabels && labelled.has(doc.id) && (
                      <text x={lx} y={ly} textAnchor={anchor} className="node__label" fontSize={FONT[doc.kind]} stroke={BG} strokeWidth={4}>
                        {doc.title}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
      )}
    </div>
  );
}
