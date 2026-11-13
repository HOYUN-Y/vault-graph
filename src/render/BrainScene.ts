// Three.js 3D network scene. Drawing and input only, separate from data and rules (core/).
// - Nodes: voxels (cube pieces in one instanced draw). One document = one node, with a per-kind assembly shape (render/voxel.ts).
//   Faces differ in brightness so rotation reads as 3D, and bright edges outline the grid. Node positions snap to the grid.
//   The glow behind nodes is one Points layer (pixel bands), also used for hit testing (per node, regardless of piece count).
// - Lines: curves (quadratic Bézier) split into LineSegments; signals: three pixel blocks flowing along visible lines; floor: faint grid plane
// - Opening: unfolds from brain-shaped coordinates (decor particles + node start points) to real positions. Real positions never change.
// - Ongoing effects (auto-rotation, signals) stop on pause, reduced motion and hidden tabs; rendering idles when there's nothing to do.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Vec3 } from '../core/layout3d';
import { hash } from '../core/layout3d';
import { holdLabel, labelSide, type LabelBlock, type LabelHold, type LabelPace } from '../core/label-side';
import type { DocFormat, EdgeKind, NodeKind } from '../core/types';
import { fitDistance as fitFor } from './fit';
import { assemblyRadius } from './glow-lift';
import { foldScale, labelText } from './fold';
import { CELL, assembly, snapToGrid } from './voxel';

export interface SceneNodeInput { id: string; kind: NodeKind; format: DocFormat; title: string; color: string; pos: Vec3; brain: Vec3; depth: number }
export interface SceneEdgeInput { key: string; a: string; b: string; kind: EdgeKind }
export type GlowDepthMode = 'lift' | 'raw' | 'off' | 'none';
export interface SceneState {
  visible: ReadonlySet<string>;
  /** Visible edges: pair key → representative kind in this view */
  shown: ReadonlyMap<string, EdgeKind>;
  emphasis: ReadonlySet<string> | null;
  selected: string | null;
  hover: string | null;
  /** Visible but collapsed index → collapsed child count. The cluster grows with the count and its label gets +count */
  folded?: ReadonlyMap<string, number>;
}
export interface SceneHooks {
  onPick(id: string | null): void;
  onDoublePick(id: string): void;
  onHover(id: string | null): void;
  /** Direct interaction such as drag, wheel or click (stops the auto demo) */
  onInteract(): void;
  onOpeningDone(): void;
  onContextLost(): void;
}
/** Default view direction (from the origin toward the camera) */
const HOME_DIR: Vec3 = [0.12, 0.42, 1];

/** corner: size of the toolbar covering the bottom-right corner (portrait phone control bar) (px, from the canvas right and bottom edges) */
export interface Insets { top: number; right: number; bottom: number; left: number; corner?: { w: number; h: number } }

const TOPIC = new THREE.Color('#FFB52E');
const WHITE = new THREE.Color('#ffffff');
// Glow (Points) radius — slightly wider than the voxel assembly
const SIZE: Record<NodeKind, number> = { router: 0.075, area: 0.04, subindex: 0.028, guide: 0.028, moc: 0.036, material: 0.0132 };
/**
 * Auto-rotation (the camera orbits the graph around the vertical axis).
 * OrbitControls units are 'autoRotateSpeed turns per 60 s'. The old 0.45 meant 133 s per turn (2.7°/s), barely noticeable.
 */
export const ORBIT_TURN_S = 45;
const ORBIT_SPEED = 60 / ORBIT_TURN_S;
/** Delay before rotating again after direct interaction (drag, wheel, keyboard rotate, zoom buttons, search input) */
export const ORBIT_RESUME_MS = 4000;
/** Delay before rotating again after the opening, deselect or demo end */
export const ORBIT_SETTLE_MS = 1200;
/** Time constants (s) for rotation speed approaching its target: slow to start, quick to stop */
const ORBIT_EASE_IN = 0.7, ORBIT_EASE_OUT = 0.18;
const GLOW: Record<NodeKind, number> = { router: 1.25, area: 0.95, subindex: 0.6, guide: 0.55, moc: 0.85, material: 0.4 };
const BG = new THREE.Color('#162033');
const IVORY = new THREE.Color('#F6F1E7');
const BEND: Record<EdgeKind, number> = { primary: 0.12, index: 0.24, topic: 0.3 };
const BASE_ALPHA: Record<EdgeKind, number> = { primary: 0.36, index: 0.6, topic: 0.3 };
// Label overlap gap (px) and pre-render width estimate: wide glyphs (Hangul, CJK, etc.) count as the font size, others 0.6×
const LABEL_GAP = 4;
const labelEstimate = (text: string, size: number) => [...text].reduce((w, ch) => w + (ch.charCodeAt(0) >= 0x1100 ? size : size * 0.6), 0);
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, gap: number) =>
  !(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);
const LABEL_RANK: Record<NodeKind, number> = { router: 2, area: 3, moc: 4, subindex: 5, guide: 6, material: 9 };
const HALO = 2.8; // sprite = shape radius × HALO (outer part is glow)
const OPEN_MS = 2900;
/** Time for nodes to move to new positions after a data update */
const MORPH_MS = 600;
/** Signal trail block count and spacing (fraction of the curve) */
const TRAIL = 3;
const TRAIL_GAP = 0.028;

const NODE_VERT = /* glsl */ `
attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aGlow; attribute float aLift;
uniform float uProj; uniform float uFar; uniform float uLift;
varying vec3 vColor; varying float vAlpha; varying float vGlow; varying float vFog; varying float vInner;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // Pull only the glow's depth toward the camera by the node assembly's outer sphere (radius aLift). Moving along the camera→node ray keeps
  // screen position and size unchanged; its own cubes don't hide it, but other nodes in front still do (depth test kept)
  float len = length(mv.xyz);
  vec3 eye = mv.xyz * (max(0.03, len - aLift * uLift) / max(len, 1e-4));
  gl_Position = projectionMatrix * vec4(eye, 1.0);
  float dist = max(0.05, -mv.z);
  float px = aSize * ${HALO.toFixed(1)} * uProj / dist;
  gl_PointSize = clamp(px, 1.5, 320.0);
  vColor = aColor; vAlpha = aAlpha; vGlow = aGlow;
  vFog = clamp(1.35 - dist / uFar, 0.38, 1.0);
  // Assembly half width (sprite units): leave this inner area empty so the pulled-forward glow doesn't cover its own cube faces
  vInner = uLift > 0.5 ? aLift / (1.7320508 * max(aSize, 1e-5)) : 0.0;
}`;
const NODE_FRAG = /* glsl */ `
varying vec3 vColor; varying float vAlpha; varying float vGlow; varying float vFog; varying float vInner;
void main() {
  // Glow behind voxels: near-square distance and stepped bands instead of a round blur (pixel glow). Voxels draw the shape
  vec2 p = (gl_PointCoord - 0.5) * 2.0 * ${HALO.toFixed(1)};
  float r = mix(length(p), max(abs(p.x), abs(p.y)), 0.65);
  float halo = exp(-r * r * 0.32) * vGlow * 0.42;
  if (vInner > 0.0) halo *= mix(0.45, 1.0, smoothstep(vInner * 0.5, vInner * 1.4, r));
  halo = floor(halo * 7.0 + 0.5) / 7.0;
  float a = halo * vAlpha * vFog;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}`;
const LINE_VERT = /* glsl */ `
attribute vec3 aColor; attribute float aAlpha; uniform float uFar;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor; vAlpha = aAlpha * clamp(1.35 - (-mv.z) / uFar, 0.3, 1.0);
}`;
const LINE_FRAG = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main() { if (vAlpha < 0.003) discard; gl_FragColor = vec4(vColor, vAlpha); }`;
const DOT_VERT = /* glsl */ `
attribute vec3 aColor; attribute float aAlpha; attribute float aSize; uniform float uProj; uniform float uFade;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uProj / max(0.05, -mv.z), 1.0, 24.0);
  vColor = aColor; vAlpha = aAlpha * uFade;
}`;
// Signal and opening particles: square pixels (bright core + faint border)
const DOT_FRAG = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main() {
  vec2 q = abs(gl_PointCoord - 0.5) * 2.0;
  float m = max(q.x, q.y);
  float a = ((1.0 - step(0.52, m)) + (1.0 - step(0.98, m)) * 0.3) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.35), a);
}`;
// Voxels: node center (aCenter) + piece offset (aOffset) + cube (position × aSize), all scaled by node size (aScale)
const VOX_VERT = /* glsl */ `
attribute vec3 aCenter; attribute vec3 aOffset; attribute float aSize; attribute float aScale;
attribute vec3 aColor; attribute float aAlpha; attribute float aGlow; attribute float aTone; attribute float aHollow;
uniform float uFar;
varying vec3 vN; varying vec2 vUv; varying vec3 vColor; varying float vAlpha; varying float vGlow; varying float vFog; varying float vTone; varying float vHollow;
void main() {
  vec3 p = aCenter + (aOffset + position * aSize) * aScale;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv; vColor = aColor; vAlpha = aAlpha; vGlow = aGlow; vTone = aTone; vHollow = aHollow;
  vFog = clamp(1.35 - (-mv.z) / uFar, 0.38, 1.0);
}`;
// Face brightness: top > lit side > shaded side > bottom. Edge bands are bright (grid); dimmed nodes fade to the ground color (opaque, depth written)
const VOX_FRAG = /* glsl */ `
uniform vec3 uBg; uniform vec3 uLight;
varying vec3 vN; varying vec2 vUv; varying vec3 vColor; varying float vAlpha; varying float vGlow; varying float vFog; varying float vTone; varying float vHollow;
void main() {
  vec3 n = normalize(vN);
  float shade = 0.4 + 0.42 * max(n.y, 0.0) + 0.3 * max(dot(n, uLight), 0.0) - 0.14 * max(-n.y, 0.0);
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = min(e.x, e.y);
  float w = fwidth(edge);
  float rim = 1.0 - smoothstep(0.07, 0.07 + w * 1.5 + 0.02, edge);
  vec3 col = vColor * shade * (0.9 + 0.2 * vTone) + vColor * vGlow * 0.16;
  col = mix(col, mix(vColor, vec3(1.0), 0.5), rim * (0.3 + 0.22 * min(vGlow, 1.6)));
  if (vHollow > 0.5) col = mix(uBg * 1.3 + vColor * 0.06, col, rim);
  gl_FragColor = vec4(mix(uBg, col, clamp(vAlpha * vFog, 0.0, 1.0)), 1.0);
}`;
// Floor grid: thin lines every four voxel cells + thick lines every five, fading away from the center
const FLOOR_VERT = /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = /* glsl */ `
uniform float uCell; uniform float uFade; varying vec3 vW;
float grid(vec2 p) { vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p); return 1.0 - min(min(g.x, g.y), 1.0); }
void main() {
  vec2 p = vW.xz / uCell;
  float a = (grid(p) * 0.06 + grid(p / 5.0) * 0.1) * (1.0 - smoothstep(0.5, 2.1, length(vW.xz))) * uFade;
  if (a < 0.003) discard;
  gl_FragColor = vec4(0.58, 0.64, 0.72, a);
}`;
const BG_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const BG_FRAG = /* glsl */ `
varying vec2 vUv; uniform vec2 uAspect;
void main() {
  vec2 p = (vUv - 0.5) * uAspect;
  float r = length(p);
  // Theme ground: Navy 800 (#162033) at the center to Navy 950 (#0B1220) at the edges, with a very faint slate/ivory tint on each hemisphere side
  vec3 base = mix(vec3(0.086, 0.125, 0.200), vec3(0.043, 0.071, 0.125), smoothstep(0.0, 0.95, r));
  base += vec3(0.80, 0.84, 0.88) * 0.022 * exp(-dot(p + vec2(0.28, 0.0), p + vec2(0.28, 0.0)) * 5.0);
  base += vec3(0.96, 0.94, 0.90) * 0.020 * exp(-dot(p - vec2(0.3, 0.05), p - vec2(0.3, 0.05)) * 5.0);
  gl_FragColor = vec4(base, 1.0);
}`;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class BrainScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private root = new THREE.Group();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private nodeGeo = new THREE.BufferGeometry();
  private nodeMat: THREE.ShaderMaterial;
  /** Glow layer + hit testing (one point per node) */
  private points: THREE.Points;
  private voxGeo = new THREE.InstancedBufferGeometry();
  private voxMat: THREE.ShaderMaterial;
  /** Piece → node index. Piece count (draw units) differs from node count (documents) */
  private pieceNode: Uint32Array;
  /** Assembly half width per node */
  private half: Float32Array;
  /** Grow-in ratio during the opening (1 when done) */
  private grow: Float32Array;
  private centerVersion = -1;
  private floorMat: THREE.ShaderMaterial;
  private floor: THREE.Mesh;
  private cage: THREE.LineSegments;
  private lineGeo = new THREE.BufferGeometry();
  private lineMat: THREE.ShaderMaterial;
  private sigGeo = new THREE.BufferGeometry();
  private sigMat: THREE.ShaderMaterial;
  private dustGeo = new THREE.BufferGeometry();
  private dustMat: THREE.ShaderMaterial;
  private bgMat: THREE.ShaderMaterial;
  private raycaster = new THREE.Raycaster();

  private nodes: SceneNodeInput[];
  private index = new Map<string, number>();
  /** Router node index (-1 = none): reserves the central assembly's screen circle */
  private routerIndex = -1;
  private edges: SceneEdgeInput[];
  private edgeIndex = new Map<string, number>();
  private K: number;
  /** More lines → lower base brightness (so additive lines don't wash out white). Topic links (gold) are lowered once more */
  private density: number;
  private curve: Float32Array; // A · C · B per line
  private nodeColor: THREE.Color[];
  // State (current · target)
  private nAlpha: Float32Array; private nAlphaT: Float32Array;
  private nScale: Float32Array; private nScaleT: Float32Array;
  private nGlow: Float32Array; private nGlowT: Float32Array;
  private eAlpha: Float32Array; private eAlphaT: Float32Array; private eGrow: Float32Array;
  private eKind: EdgeKind[]; private eLit: Uint8Array; private eShown: Uint8Array;
  private signals: { edge: number; phase: number; speed: number }[] = [];
  private state: SceneState = { visible: new Set(), shown: new Map(), emphasis: null, selected: null, hover: null };
  private prevVisible: ReadonlySet<string> = new Set();
  private prevShown!: Uint8Array;
  /** Edges excluded when fitting the view (temporary ones like the detail panel aren't excluded) */
  private fitInsets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** The user hasn't zoomed, dragged or focused yet, so the camera is at fit distance (refit on window or edge changes) */
  private atHome = true;
  private insetsSet = false;
  /** View offset from edges, and how far the projection center is raised for a corner bar (px) — the target offset is their sum */
  private baseOffset = { x: 0, y: 0 };
  private cornerLift = 0;

  private raf = 0; private inFrame = false; private last = 0; private time = 0;
  private paused = false; private reduced = false; private autoRotate = true;
  /** Auto-rotation state: factor = current/target speed (0–1), holdUntil = paused until this time, dragging = direct interaction */
  private rot = { factor: 0, holdUntil: 0, dragging: false, timer: 0 };
  private opening = 1; // 1 = done
  private openStart = 0;
  // Transition from old to new positions after a data update (the camera follows the selected node to keep its screen spot)
  private morph: { start: number; from: Float32Array; delta: THREE.Vector3; done: number } | null = null;
  private fitDistance = 3;
  /** Reference distance for node focus and material labels (from layout radius — kept apart from fit distance so selection zoom doesn't depend on screen edges) */
  private nearDistance = 3;
  /** Radius covered by the layout (98th percentile) — basis for the screen-filling camera distance */
  private extent = 1;
  private camAnim: { from: THREE.Vector3; to: THREE.Vector3; fromDist: number; toDist: number; t: number; dur: number } | null = null;
  private offset = { x: 0, y: 0 }; private offsetT = { x: 0, y: 0 };
  private width = 1; private height = 1;
  private down: { x: number; y: number; t: number } | null = null;
  private hoverPending: { x: number; y: number } | null = null;
  private labels: HTMLDivElement[] = [];
  private labelWidth = new Map<string, number>();
  /** Previous side relative to the center line per node (dead band) */
  private labelSide = new Map<string, boolean>();
  /** Per-node label stabilization state (shown, side, times). Cleared immediately when not a candidate this frame (hidden, deleted, off screen, off) */
  private labelHold = new Map<string, LabelHold>();
  /** Next label pass places without waiting (right after labels on, state or size change) */
  private labelFresh = true;
  /** Labels shown last frame: they claim spots first among equal rank, so labels don't take turns hiding while rotating */
  private labelShown = new Set<string>();
  /** Scene labels on/off. Off also hides selection, hover and demo labels */
  private labelsOn = true;
  private frameTimes: number[] = [];
  private frameCount = 0;
  private disposers: (() => void)[] = [];
  private resizeObserver: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, private labelLayer: HTMLElement, nodes: SceneNodeInput[], edges: SceneEdgeInput[],
    private hooks: SceneHooks, options: { reducedMotion: boolean; paused: boolean; opening: boolean; dust: Vec3[] }) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    const big = nodes.length > 1500;
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, big || coarse ? 1.5 : 2));
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.02, 50);
    // Snap node positions to the voxel grid (lines, signals, labels, hit testing and update handoff all use these)
    const snapped = snapToGrid(nodes);
    nodes = nodes.map((n, i) => ({ ...n, pos: snapped[i] }));
    this.nodes = nodes; this.edges = edges;
    nodes.forEach((n, i) => this.index.set(n.id, i));
    this.routerIndex = nodes.findIndex(n => n.kind === 'router');
    const radii = nodes.map(n => Math.hypot(...n.pos)).sort((a, b) => a - b);
    this.extent = Math.max(0.4, radii[Math.floor((radii.length - 1) * 0.98)] ?? 1);
    edges.forEach((e, i) => this.edgeIndex.set(e.key, i));
    this.K = edges.length > 2500 ? 6 : edges.length > 800 ? 8 : 14;
    this.density = Math.min(1, Math.max(0.42, Math.sqrt(700 / Math.max(edges.length, 1))));
    this.reduced = options.reducedMotion;
    this.paused = options.paused;

    // Background
    this.bgMat = new THREE.ShaderMaterial({ vertexShader: BG_VERT, fragmentShader: BG_FRAG, uniforms: { uAspect: { value: new THREE.Vector2(1, 1) } }, depthTest: false, depthWrite: false });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    bg.frustumCulled = false; bg.renderOrder = -10;
    this.scene.add(bg, this.root);

    // Nodes
    const N = nodes.length;
    this.nodeColor = nodes.map(n => new THREE.Color(n.color));
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
    this.nAlpha = new Float32Array(N); this.nAlphaT = new Float32Array(N).fill(1);
    this.nScale = new Float32Array(N).fill(1); this.nScaleT = new Float32Array(N).fill(1);
    this.nGlow = new Float32Array(N); this.nGlowT = new Float32Array(N);
    nodes.forEach((n, i) => {
      pos.set(n.pos, i * 3); col.set([this.nodeColor[i].r, this.nodeColor[i].g, this.nodeColor[i].b], i * 3);
      size[i] = SIZE[n.kind];
      this.nAlpha[i] = 1; this.nGlow[i] = this.nGlowT[i] = GLOW[n.kind];
    });
    this.nodeGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.nodeGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.nodeGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(size), 1));
    this.nodeGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(this.nAlpha), 1));
    this.nodeGeo.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(this.nGlow), 1));
    this.nodeGeo.setAttribute('aLift', new THREE.BufferAttribute(new Float32Array(N), 1));
    this.nodeGeo.userData.baseSize = size;
    this.nodeMat = new THREE.ShaderMaterial({ vertexShader: NODE_VERT, fragmentShader: NODE_FRAG, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, uniforms: { uProj: { value: 400 }, uFar: { value: 6 }, uLift: { value: 1 } } });
    this.nodeMat.depthTest = true;
    this.points = new THREE.Points(this.nodeGeo, this.nodeMat);
    this.points.renderOrder = 4;
    this.points.frustumCulled = false;

    // Voxel pieces (one instanced draw): per-kind assembly for each node
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.voxGeo.index = box.index;
    for (const name of ['position', 'normal', 'uv']) this.voxGeo.setAttribute(name, box.getAttribute(name));
    const asm = nodes.map(n => assembly(n.kind, n.format));
    this.half = Float32Array.from(asm.map(a => a.half));
    this.grow = new Float32Array(N).fill(1);
    const P = asm.reduce((t, a) => t + a.pieces.length, 0);
    this.pieceNode = new Uint32Array(P);
    const vOff = new Float32Array(P * 3), vSize = new Float32Array(P), vCol = new Float32Array(P * 3), vTone = new Float32Array(P), vHollow = new Float32Array(P);
    let k = 0;
    asm.forEach((a, i) => a.pieces.forEach(piece => {
      this.pieceNode[k] = i;
      vOff.set(piece.offset, k * 3); vSize[k] = piece.size; vTone[k] = piece.tone; vHollow[k] = a.hollow ? 1 : 0;
      const c = this.nodeColor[i];
      vCol.set([c.r, c.g, c.b], k * 3);
      k++;
    }));
    const inst = (array: Float32Array, size: number) => new THREE.InstancedBufferAttribute(array, size);
    this.voxGeo.setAttribute('aCenter', inst(new Float32Array(P * 3), 3));
    this.voxGeo.setAttribute('aOffset', inst(vOff, 3));
    this.voxGeo.setAttribute('aSize', inst(vSize, 1));
    this.voxGeo.setAttribute('aScale', inst(new Float32Array(P).fill(1), 1));
    this.voxGeo.setAttribute('aColor', inst(vCol, 3));
    this.voxGeo.setAttribute('aAlpha', inst(new Float32Array(P).fill(1), 1));
    this.voxGeo.setAttribute('aGlow', inst(new Float32Array(P), 1));
    this.voxGeo.setAttribute('aTone', inst(vTone, 1));
    this.voxGeo.setAttribute('aHollow', inst(vHollow, 1));
    this.voxGeo.instanceCount = P;
    this.voxMat = new THREE.ShaderMaterial({ vertexShader: VOX_VERT, fragmentShader: VOX_FRAG,
      uniforms: { uFar: { value: 6 }, uBg: { value: BG.clone() }, uLight: { value: new THREE.Vector3(-0.45, 0.35, 0.82).normalize() } } });
    const voxels = new THREE.Mesh(this.voxGeo, this.voxMat);
    voxels.frustumCulled = false; voxels.renderOrder = 1;

    // Floor grid (decor) · selection outline (cube edges around the assembly)
    this.floorMat = new THREE.ShaderMaterial({ vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uCell: { value: CELL * 4 }, uFade: { value: 1 } } });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2), this.floorMat);
    this.floor.position.y = -this.extent * 1.2; this.floor.renderOrder = -5; this.floor.frustumCulled = false;
    this.cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: IVORY, transparent: true, opacity: 0.9, depthTest: false }));
    this.cage.visible = false; this.cage.renderOrder = 5; this.cage.frustumCulled = false;

    // Lines (curves)
    const E = edges.length, K = this.K;
    this.curve = new Float32Array(E * 9);
    const lpos = new Float32Array(E * K * 2 * 3), lcol = new Float32Array(E * K * 2 * 3), lalpha = new Float32Array(E * K * 2);
    this.eAlpha = new Float32Array(E); this.eAlphaT = new Float32Array(E); this.eGrow = new Float32Array(E).fill(1);
    this.eKind = edges.map(e => e.kind); this.eLit = new Uint8Array(E); this.eShown = new Uint8Array(E); this.prevShown = new Uint8Array(E).fill(1);
    edges.forEach((e, i) => {
      const A = nodes[this.index.get(e.a)!].pos, B = nodes[this.index.get(e.b)!].pos;
      const C = this.controlPoint(A, B, e);
      this.curve.set([...A, ...C, ...B], i * 9);
      for (let s = 0; s < K; s++) {
        const p0 = this.bezier(i, s / K), p1 = this.bezier(i, (s + 1) / K);
        lpos.set([...p0, ...p1], (i * K + s) * 6);
      }
    });
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
    this.lineGeo.setAttribute('aColor', new THREE.BufferAttribute(lcol, 3));
    this.lineGeo.setAttribute('aAlpha', new THREE.BufferAttribute(lalpha, 1));
    this.lineMat = new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, uniforms: { uFar: { value: 6 } } });
    const lines = new THREE.LineSegments(this.lineGeo, this.lineMat);
    lines.frustumCulled = false; lines.renderOrder = 2;

    // Signals (light flowing along lines) — a visual for relations, not real activity
    // One signal = three pixel blocks (the front one is brightest and largest)
    const S = Math.min(big ? 90 : 160, Math.max(24, E));
    for (let i = 0; i < S; i++) this.signals.push({ edge: -1, phase: hash(`s${i}`), speed: 0.18 + 0.22 * hash(`v${i}`) });
    const sigSize = new Float32Array(S * TRAIL);
    for (let i = 0; i < S; i++) for (let j = 0; j < TRAIL; j++) sigSize[i * TRAIL + j] = 0.03 * (1 - j * 0.22);
    this.sigGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(S * TRAIL * 3), 3));
    this.sigGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(S * TRAIL * 3), 3));
    this.sigGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(S * TRAIL), 1));
    this.sigGeo.setAttribute('aSize', new THREE.BufferAttribute(sigSize, 1));
    this.sigMat = new THREE.ShaderMaterial({ vertexShader: DOT_VERT, fragmentShader: DOT_FRAG, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, uniforms: { uProj: { value: 400 }, uFade: { value: 1 } } });
    const sig = new THREE.Points(this.sigGeo, this.sigMat);
    sig.frustumCulled = false; sig.renderOrder = 3;

    // Opening decor particles (brain shape). Not searchable, counted or selectable
    const brain = options.dust;
    const dustCount = brain.length;
    const dust = new Float32Array(dustCount * 3), dustCol = new Float32Array(dustCount * 3), dustA = new Float32Array(dustCount), dustS = new Float32Array(dustCount);
    const tint = [new THREE.Color('#CBD5E1'), new THREE.Color('#F6F1E7'), new THREE.Color('#94A3B8')];
    for (let i = 0; i < dustCount; i++) {
      dust.set(brain[i], i * 3);
      const c = tint[brain[i][0] < -0.05 ? 0 : brain[i][0] > 0.05 ? 1 : 2];
      dustCol.set([c.r, c.g, c.b], i * 3);
      dustA[i] = 0.35 + 0.4 * hash(`d${i}`); dustS[i] = 0.008 + 0.01 * hash(`ds${i}`);
    }
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
    this.dustGeo.userData.base = dust.slice();
    this.dustGeo.setAttribute('aColor', new THREE.BufferAttribute(dustCol, 3));
    this.dustGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dustA, 1));
    this.dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dustS, 1));
    this.dustMat = new THREE.ShaderMaterial({ vertexShader: DOT_VERT, fragmentShader: DOT_FRAG, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, uniforms: { uProj: { value: 400 }, uFade: { value: 0 } } });
    const dustPoints = new THREE.Points(this.dustGeo, this.dustMat);
    dustPoints.frustumCulled = false; dustPoints.renderOrder = 0;
    this.root.add(dustPoints, this.floor, voxels, lines, sig, this.points, this.cage);

    // Camera · controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.8;
    this.controls.enablePan = false;
    this.controls.autoRotateSpeed = 0;
    this.controls.addEventListener('change', () => this.request());
    this.controls.addEventListener('start', () => { this.camAnim = null; this.atHome = false; this.rot.dragging = true; this.rot.factor = 0; this.hooks.onInteract(); });
    this.controls.addEventListener('end', () => { this.rot.dragging = false; this.holdRotation(); });

    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.home(false);
    if (options.opening && !this.reduced && !this.paused) this.startOpening();
    else this.finishOpening(false);
    this.request();
  }

  /* ── Public API ── */
  setState(next: SceneState) {
    this.state = next;
    this.labelFresh = true;
    const N = this.nodes.length;
    const { visible, emphasis, selected, hover } = next;
    const folded = next.folded;
    // In cluster mode (large graphs) hidden nodes shrink to size 0. Voxels are opaque, so dimmed ones become background-colored cells covering clusters (and alpha below 0.05 isn't clickable)
    const ghostAlpha = folded ? 0 : 0.2, ghostScale = folded ? 0 : 0.42;
    const neighbors = new Set<string>();
    this.edges.forEach((e, i) => {
      const kind = next.shown.get(e.key);
      this.eShown[i] = kind ? 1 : 0;
      if (kind) this.eKind[i] = kind;
      const lit = !!selected && !!kind && (e.a === selected || e.b === selected);
      this.eLit[i] = lit ? 1 : 0;
      if (lit) { neighbors.add(e.a); neighbors.add(e.b); }
    });
    for (let i = 0; i < N; i++) {
      const n = this.nodes[i];
      const vis = visible.has(n.id);
      const fold = folded?.get(n.id);
      let alpha = vis ? 1 : ghostAlpha, scale = vis ? (fold ? foldScale(fold) : 1) : ghostScale, glow = vis ? GLOW[n.kind] : 0;
      const outside = emphasis && !emphasis.has(n.id) && n.kind !== 'router';
      if (outside) { alpha *= 0.22; glow *= 0.15; }
      if (selected) {
        if (n.id === selected) { alpha = 1; scale = Math.max(1.55, scale); glow = 1.7; }
        else if (neighbors.has(n.id)) { alpha = Math.max(alpha, 0.95); glow = Math.max(glow, 0.7); }
        else { alpha *= 0.3; glow *= 0.25; }
      }
      if (hover === n.id) { scale *= 1.3; alpha = Math.max(alpha, 0.9); glow = Math.max(glow, 1.1); }
      // Newly visible nodes (expand) start small and grow in. Not for nodes returning from selection or filter dimming
      if (vis && !this.prevVisible.has(n.id) && this.opening >= 1 && !this.still) this.nScale[i] = Math.min(this.nScale[i], 0.2);
      this.nAlphaT[i] = alpha; this.nScaleT[i] = scale; this.nGlowT[i] = glow;
    }
    const lineCol = this.lineGeo.getAttribute('aColor') as THREE.BufferAttribute;
    const tmp = new THREE.Color();
    this.edges.forEach((e, i) => {
      const kind = this.eKind[i];
      const shown = this.eShown[i] === 1;
      let a = shown ? BASE_ALPHA[kind] * this.density * (kind === 'topic' && this.density < 1 ? 0.75 : 1) : folded ? 0 : 0.032;
      if (shown && emphasis && !((emphasis.has(e.a) || this.nodes[this.index.get(e.a)!].kind === 'router') && emphasis.has(e.b))) a *= 0.16;
      if (selected) a = this.eLit[i] ? 0.95 : a * 0.22;
      else if (shown && hover && (e.a === hover || e.b === hover)) a = Math.min(1, a * 2.2);
      if (shown && !this.prevShown[i] && this.opening >= 1 && !this.still) this.eGrow[i] = 0;
      this.eAlphaT[i] = a;
      const base = kind === 'topic' ? TOPIC : this.nodeColor[this.index.get(kind === 'index' ? e.a : e.b)!];
      tmp.copy(base);
      if (this.eLit[i]) tmp.lerp(WHITE, 0.3);
      for (let v = 0; v < this.K * 2; v++) lineCol.setXYZ(i * this.K * 2 + v, tmp.r, tmp.g, tmp.b);
    });
    lineCol.needsUpdate = true;
    this.prevVisible = new Set(visible);
    this.prevShown.set(this.eShown);
    this.assignSignals();
    if (this.still) this.snap();
    this.request();
  }

  /** immediate: a scene rebuilt by a data update sets the view offset at once instead of sliding */
  setInsets(insets: Insets, immediate = false) {
    const base = { x: (insets.right - insets.left) / 2, y: (insets.bottom - insets.top) / 2 };
    const corner = insets.corner && insets.corner.w > 0 && insets.corner.h > 0 ? { w: Math.round(insets.corner.w), h: Math.round(insets.corner.h) } : undefined;
    const fitInsets: Insets = { top: insets.top, left: insets.left, right: Math.min(insets.right, 24), bottom: Math.min(insets.bottom, 64), corner };
    const f = this.fitInsets;
    const changed = f.top !== fitInsets.top || f.left !== fitInsets.left || f.right !== fitInsets.right || f.bottom !== fitInsets.bottom
      || f.corner?.w !== corner?.w || f.corner?.h !== corner?.h || (!!corner && (base.x !== this.baseOffset.x || base.y !== this.baseOffset.y));
    this.baseOffset = base;
    if (changed) { this.fitInsets = fitInsets; this.refit(); }
    this.offsetT = { x: base.x, y: base.y + this.cornerLift };
    // Apply the first edges immediately (clicks miss while the first framing slides). Later changes, e.g. the detail panel, slide
    if (this.still || immediate || !this.insetsSet) { this.offset = { ...this.offsetT }; this.applyOffset(); }
    this.insetsSet = true;
    this.request();
  }
  /** Scene labels on/off: changes only the label layer, leaving scene, camera and motion as is (redraws one frame even when paused or reduced motion) */
  setLabels(on: boolean) {
    if (this.labelsOn === on) return;
    this.labelsOn = on;
    this.labelLayer.hidden = !on;
    if (!on) { for (const el of this.labels) el.hidden = true; this.labelShown = new Set(); this.labelHold.clear(); this.labelSide.clear(); }
    this.labelFresh = true;
    this.request();
  }
  /** For verification (?perf=1): compare glow depth. lift = default (in front of own assembly), raw = old (node center depth), off = no depth test, none = hide glow */
  debugGlowDepth(mode: GlowDepthMode) {
    (this.nodeMat.uniforms.uLift as { value: number }).value = mode === 'lift' ? 1 : 0;
    this.nodeMat.depthTest = mode !== 'off';
    this.points.visible = mode !== 'none';
    this.request();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) { if (this.opening < 1) this.finishOpening(true); this.settle(); }
    this.request();
  }
  setAutoRotate(on: boolean) {
    if (on && !this.autoRotate) this.holdRotation(ORBIT_SETTLE_MS);
    this.autoRotate = on;
    this.request();
  }
  /** Stop auto-rotation now and slowly restart after ms (only a timer runs meanwhile, no frames) */
  holdRotation(ms = ORBIT_RESUME_MS) {
    this.rot.factor = 0;
    this.rot.holdUntil = Math.max(this.rot.holdUntil, performance.now() + ms);
    window.clearTimeout(this.rot.timer);
    this.rot.timer = window.setTimeout(() => this.request(), Math.max(0, this.rot.holdUntil - performance.now()) + 16);
    this.request();
  }
  /** Auto-rotation state (for verification and reporting) */
  rotation() {
    const allowed = this.autoRotate && !this.paused && !this.reduced && this.opening >= 1;
    const now = performance.now();
    const state = !allowed ? 'off' : this.rot.dragging ? 'drag' : now < this.rot.holdUntil ? 'hold' : this.rot.factor > 0.995 ? 'running' : 'easing';
    return { state, factor: this.rot.factor, degPerSec: (360 / 60) * ORBIT_SPEED * this.rot.factor, turnSeconds: ORBIT_TURN_S, azimuth: this.controls.getAzimuthalAngle() };
  }
  setReducedMotion(reduced: boolean) {
    this.reduced = reduced;
    if (reduced) { if (this.opening < 1) this.finishOpening(true); this.settle(); }
    this.request();
  }
  skipOpening() { if (this.opening < 1) this.finishOpening(true); }
  get openingProgress() { return this.opening; }

  /** Move the camera toward the picked document (the panel area is avoided via the screen center offset) */
  focus(id: string) {
    const i = this.index.get(id);
    if (i === undefined) return;
    const n = this.nodes[i];
    const target = new THREE.Vector3(...n.pos).multiplyScalar(n.kind === 'router' ? 0 : 0.78);
    const dist = this.nearDistance * (n.kind === 'material' ? 0.7 : n.kind === 'router' ? 0.9 : 0.78);
    this.atHome = false;
    this.animateCamera(target, dist);
  }
  fit() { this.atHome = true; this.animateCamera(new THREE.Vector3(0, 0, 0), this.fitDistance); }
  /** Current viewpoint, to carry the camera over when a data update rebuilds the scene */
  getView(): { pos: number[]; target: number[] } { return { pos: this.camera.position.toArray(), target: this.controls.target.toArray() }; }
  setView(view: { pos: number[]; target: number[] }) {
    this.camAnim = null;
    this.atHome = false;
    this.controls.target.fromArray(view.target);
    this.camera.position.fromArray(view.pos);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.request();
  }

  /** Stop any camera move where it is (search start, direct interaction, demo stop) */
  cancelCamera() {
    this.camAnim = null;
    this.stopMomentum();
    this.offset = { ...this.offsetT };
    this.applyOffset();
    this.request();
  }
  /** End leftover damping inertia from drag or auto-rotation now (the tiny remaining rotation is applied at once) */
  private stopMomentum() {
    const damping = this.controls.enableDamping, auto = this.controls.autoRotate;
    this.controls.enableDamping = false;
    this.controls.autoRotate = false;
    this.controls.update();
    this.controls.enableDamping = damping;
    this.controls.autoRotate = auto;
  }
  zoom(factor: number) {
    const dist = THREE.MathUtils.clamp(this.camera.position.distanceTo(this.controls.target) / factor, this.controls.minDistance, this.controls.maxDistance);
    this.atHome = false;
    this.holdRotation();
    this.animateCamera(this.controls.target.clone(), dist);
  }
  /** Keyboard rotation (radians) */
  orbit(dTheta: number, dPhi: number) {
    this.holdRotation();
    const off = this.camera.position.clone().sub(this.controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta += dTheta;
    sph.phi = THREE.MathUtils.clamp(sph.phi + dPhi, 0.15, Math.PI - 0.15);
    off.setFromSpherical(sph);
    this.camera.position.copy(this.controls.target).add(off);
    this.camAnim = null;
    this.request();
  }
  /** Currently drawn node positions (intermediate during a transition). The next scene takes them over */
  positions(): Map<string, Vec3> {
    const pos = this.nodeGeo.getAttribute('position') as THREE.BufferAttribute;
    return new Map(this.nodes.map((n, i) => [n.id, [pos.getX(i), pos.getY(i), pos.getZ(i)] as Vec3]));
  }
  /**
   * Update handoff: remaining nodes move from old to new positions (new nodes appear in place).
   * With an anchor (selected node) the camera moves by that node's shift, so it stays at the same screen spot.
   * When paused, in reduced motion or during the opening, jump to the final state (camera moves instantly).
   */
  morphFrom(prev: Map<string, Vec3>, anchor: string | null) {
    const from = new Float32Array(this.nodes.length * 3);
    let moved = 0;
    this.nodes.forEach((n, i) => {
      const p = prev.get(n.id) ?? n.pos;
      from.set(p, i * 3);
      moved = Math.max(moved, Math.hypot(p[0] - n.pos[0], p[1] - n.pos[1], p[2] - n.pos[2]));
    });
    const a = anchor ? this.index.get(anchor) : undefined, was = anchor ? prev.get(anchor) : undefined;
    const delta = a !== undefined && was ? new THREE.Vector3(...this.nodes[a].pos).sub(new THREE.Vector3(...was)) : new THREE.Vector3();
    if (moved < 1e-4) return;
    if (this.still || this.opening < 1) {
      this.camera.position.add(delta); this.controls.target.add(delta); this.controls.update(); this.request();
      return;
    }
    this.morph = { start: performance.now(), from, delta, done: 0 };
    this.setNodePositions(0);
    this.request();
  }
  private setNodePositions(e: number) {
    const m = this.morph, pos = this.nodeGeo.getAttribute('position') as THREE.BufferAttribute;
    const at = (i: number): Vec3 => {
      const n = this.nodes[i].pos;
      if (!m) return n;
      const o = i * 3;
      return [m.from[o] + (n[0] - m.from[o]) * e, m.from[o + 1] + (n[1] - m.from[o + 1]) * e, m.from[o + 2] + (n[2] - m.from[o + 2]) * e];
    };
    this.nodes.forEach((_, i) => pos.setXYZ(i, ...at(i)));
    pos.needsUpdate = true;
    const lpos = this.lineGeo.getAttribute('position') as THREE.BufferAttribute, K = this.K;
    this.edges.forEach((edge, i) => {
      const A = at(this.index.get(edge.a)!), B = at(this.index.get(edge.b)!);
      this.curve.set([...A, ...this.controlPoint(A, B, edge), ...B], i * 9);
      for (let k = 0; k < K; k++) {
        const p0 = this.bezier(i, k / K), p1 = this.bezier(i, (k + 1) / K);
        (lpos.array as Float32Array).set([...p0, ...p1], (i * K + k) * 6);
      }
    });
    lpos.needsUpdate = true;
  }
  private stepMorph(now: number): boolean {
    const m = this.morph;
    if (!m) return false;
    const t = this.still ? 1 : Math.min(1, (now - m.start) / MORPH_MS);
    const e = ease(t);
    this.setNodePositions(e);
    // Add only the camera delta since the last frame (so user rotation or zoom in between still applies)
    const step = m.delta.clone().multiplyScalar(e - m.done);
    m.done = e;
    this.camera.position.add(step); this.controls.target.add(step);
    if (t >= 1) { this.morph = null; this.nodeGeo.computeBoundingSphere(); }
    return true;
  }

  /** Node position in screen coordinates (canvas) — for verification and tooltips */
  screenOf(id: string): { x: number; y: number } | null {
    const i = this.index.get(id);
    if (i === undefined) return null;
    this.camera.updateMatrixWorld();
    this.root.updateMatrixWorld();
    const v = this.worldOf(i).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * this.width, y: (1 - v.y) / 2 * this.height };
  }
  stats() {
    const t = this.frameTimes.slice(-120);
    const counts = { nodes: this.nodes.length, voxels: this.pieceNode.length, rotation: this.rotation() };
    if (t.length < 2) return { frames: t.length, total: this.frameCount, avgMs: 0, fps: 0, ...counts };
    const span = t[t.length - 1] - t[0];
    return { frames: t.length, total: this.frameCount, avgMs: span / (t.length - 1), fps: ((t.length - 1) * 1000) / span, ...counts };
  }
  dispose() {
    window.clearTimeout(this.rot.timer);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizeObserver.disconnect();
    for (const off of this.disposers) off();
    this.controls.dispose();
    for (const g of [this.nodeGeo, this.voxGeo, this.lineGeo, this.sigGeo, this.dustGeo, this.floor.geometry, this.cage.geometry]) g.dispose();
    for (const m of [this.nodeMat, this.voxMat, this.lineMat, this.sigMat, this.dustMat, this.bgMat, this.floorMat, this.cage.material as THREE.Material]) m.dispose();
    this.renderer.dispose();
    for (const l of this.labels) l.remove();
  }

  /* ── Internal: geometry ── */
  private controlPoint(A: Vec3, B: Vec3, e: SceneEdgeInput): Vec3 {
    const ab = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    const len = ab.length() || 1e-6;
    const axis = ab.clone().divideScalar(len);
    const mid = new THREE.Vector3((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2);
    // Bulge outward from the center (organic arc), twisted slightly along the axis per pair
    let n = mid.clone().sub(axis.clone().multiplyScalar(mid.dot(axis)));
    if (n.lengthSq() < 1e-6) n = new THREE.Vector3(0, 1, 0).cross(axis);
    if (n.lengthSq() < 1e-6) n = new THREE.Vector3(1, 0, 0);
    n.normalize().applyAxisAngle(axis, (hash(e.key) - 0.5) * 1.6);
    const bend = BEND[e.kind] * (0.7 + 0.6 * hash(`${e.key}#`));
    const c = mid.add(n.multiplyScalar(len * bend));
    return [c.x, c.y, c.z];
  }
  private bezier(i: number, t: number): Vec3 {
    const c = this.curve, o = i * 9, u = 1 - t;
    return [0, 1, 2].map(k => u * u * c[o + k] + 2 * u * t * c[o + 3 + k] + t * t * c[o + 6 + k]) as Vec3;
  }
  private worldOf(i: number) {
    const pos = this.nodeGeo.getAttribute('position') as THREE.BufferAttribute;
    return new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(this.root.matrixWorld);
  }

  /* ── Internal: camera ── */
  private resize() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    if (w === this.width && h === this.height && this.renderer.getSize(new THREE.Vector2()).x === w) return;
    this.width = w; this.height = h;
    this.labelFresh = true;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyOffset();
    const proj = (h * this.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.nodeMat.uniforms.uProj.value = proj; this.sigMat.uniforms.uProj.value = proj; this.dustMat.uniforms.uProj.value = proj;
    this.bgMat.uniforms.uAspect.value.set(w / Math.max(w, h), h / Math.max(w, h));
    this.refit();
  }
  /**
   * Fit distance: every node assembly stays inside the safe area (minus top bar, toolbar and legend) through one auto-rotation turn from the default view.
   * If the camera is still at the fit view (before user interaction or focus), only the distance is adjusted along the current direction.
   */
  private refit() {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    this.nearDistance = (this.extent * 0.92) / Math.sin(Math.min(vfov, hfov) / 2);
    const ins = this.fitInsets;
    const input = { points: this.nodes.map(n => n.pos), halves: this.half, dir: HOME_DIR, vfov, width: this.width, height: this.height, insets: ins };
    let lift = 0;
    if (ins.corner) {
      // Portrait phone control bar: a distance where no node sits under the bar. If there's spare height, raise the projection center a bit (away from the bar)
      // to keep the network larger (8px steps, up to half the spare height). Search with fewer sample angles, then measure once at full resolution
      const spare = Math.max(0, (this.height - ins.top - ins.bottom) - (this.width - ins.left - ins.right)) / 2;
      let best = Infinity;
      for (let s = 0; s <= Math.min(spare, this.height * 0.15); s += 8) {
        const d = fitFor({ ...input, steps: 40, insets: { ...ins, top: ins.top + s, bottom: ins.bottom + s }, corner: ins.corner, offset: { x: this.baseOffset.x, y: this.baseOffset.y + s } });
        if (d < best * 0.995) { best = d; lift = s; }
      }
    }
    this.cornerLift = lift;
    this.fitDistance = Math.max(1, fitFor(ins.corner
      ? { ...input, insets: { ...ins, top: ins.top + lift, bottom: ins.bottom + lift }, corner: ins.corner, offset: { x: this.baseOffset.x, y: this.baseOffset.y + lift } }
      : input));
    const target = { x: this.baseOffset.x, y: this.baseOffset.y + lift };
    if (target.x !== this.offsetT.x || target.y !== this.offsetT.y) {
      this.offsetT = target;
      if (this.still || !this.insetsSet) { this.offset = { ...target }; this.applyOffset(); }
    }
    this.controls.minDistance = 0.55;
    this.controls.maxDistance = this.fitDistance * 2.2;
    // Before the first draw (no camera position) home places it. First edges, paused and reduced motion apply at once; others (legend collapse, resize) ease the distance only
    if (this.atHome && this.camera.position.lengthSq() > 1e-9) {
      const cur = this.camAnim ? this.camAnim.toDist : this.camera.position.distanceTo(this.controls.target);
      if (Math.abs(cur - this.fitDistance) > 1e-4) {
        if (!this.insetsSet && !this.camAnim && this.controls.target.lengthSq() < 1e-9) this.camera.position.setLength(this.fitDistance);
        else this.animateCamera(new THREE.Vector3(0, 0, 0), this.fitDistance);
      }
    }
    this.request();
  }
  private applyOffset() {
    if (Math.abs(this.offset.x) < 0.5 && Math.abs(this.offset.y) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.width, this.height, this.offset.x, this.offset.y, this.width, this.height);
    this.camera.updateProjectionMatrix();
  }
  private home(animate: boolean) {
    const dir = new THREE.Vector3(...HOME_DIR).normalize();
    this.atHome = true;
    if (!animate) {
      this.controls.target.set(0, 0, 0);
      this.camera.position.copy(dir.multiplyScalar(this.fitDistance));
      this.camera.lookAt(0, 0, 0);
    } else this.fit();
  }
  /** Static: when paused or in reduced motion, camera, screen center and brightness changes finish instantly */
  private get still() { return this.paused || this.reduced; }
  /** Jump any ongoing motion to its final state */
  private settle() {
    if (this.camAnim) {
      const a = this.camAnim;
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.controls.target.copy(a.to);
      this.camera.position.copy(a.to).add(dir.multiplyScalar(a.toDist));
      this.camAnim = null;
    }
    this.stopMomentum();
    this.snap();
    this.applyOffset();
  }
  private animateCamera(target: THREE.Vector3, dist: number) {
    if (this.still) {
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.controls.target.copy(target);
      this.camera.position.copy(target).add(dir.multiplyScalar(dist));
      this.camAnim = null;
      this.request();
      return;
    }
    this.camAnim = { from: this.controls.target.clone(), to: target, fromDist: this.camera.position.distanceTo(this.controls.target), toDist: dist, t: 0, dur: 0.95 };
    this.request();
  }

  /* ── Internal: opening ── */
  private startOpening() {
    this.opening = 0;
    this.openStart = performance.now();
    const pos = this.nodeGeo.getAttribute('position') as THREE.BufferAttribute;
    this.nodes.forEach((n, i) => pos.setXYZ(i, ...n.brain));
    pos.needsUpdate = true;
    this.grow.fill(0.3);
    this.floorMat.uniforms.uFade.value = 0;
    this.writeNodes();
    this.root.rotation.y = -0.45;
  }
  private finishOpening(notify: boolean) {
    const wasOpening = this.opening < 1;
    this.opening = 1;
    const pos = this.nodeGeo.getAttribute('position') as THREE.BufferAttribute;
    this.nodes.forEach((n, i) => pos.setXYZ(i, ...n.pos));
    pos.needsUpdate = true;
    this.nodeGeo.computeBoundingSphere();
    this.root.rotation.y = 0;
    this.dustMat.uniforms.uFade.value = 0;
    this.floorMat.uniforms.uFade.value = 1;
    this.grow.fill(1);
    this.writeNodes();
    this.eGrow.fill(1);
    if (wasOpening || !notify) this.hooks.onOpeningDone();
    this.holdRotation(ORBIT_SETTLE_MS);
    this.request();
  }
  private stepOpening(now: number): boolean {
    if (this.opening >= 1) return false;
    const t = Math.min(1, (now - this.openStart) / OPEN_MS);
    if (t >= 1) { this.finishOpening(true); return true; }
    this.opening = t;
    const pos = this.nodeGeo.getAttribute('position') as THREE.BufferAttribute;
    this.nodes.forEach((n, i) => {
      const local = ease(smooth(0.28 + Math.min(n.depth, 5) * 0.05, 0.86 + Math.min(n.depth, 5) * 0.02, t));
      pos.setXYZ(i, n.brain[0] + (n.pos[0] - n.brain[0]) * local, n.brain[1] + (n.pos[1] - n.brain[1]) * local, n.brain[2] + (n.pos[2] - n.brain[2]) * local);
      // Scattered small pieces grow to full size as they reach their spots
      this.grow[i] = 0.3 + 0.7 * local;
    });
    pos.needsUpdate = true;
    this.writeNodes();
    this.floorMat.uniforms.uFade.value = smooth(0.35, 0.95, t);
    // Brain-shaped particles: gather, then unravel outward and fade
    this.dustMat.uniforms.uFade.value = smooth(0, 0.18, t) * (1 - smooth(0.42, 0.84, t));
    const dpos = this.dustGeo.getAttribute('position') as THREE.BufferAttribute, base = this.dustGeo.userData.base as Float32Array;
    const k = 1 + 0.35 * smooth(0.4, 1, t);
    for (let i = 0; i < dpos.count; i++) dpos.setXYZ(i, base[i * 3] * k, base[i * 3 + 1] * k, base[i * 3 + 2] * k);
    dpos.needsUpdate = true;
    this.root.rotation.y = -0.45 * (1 - ease(t));
    return true;
  }

  /* ── Internal: signals ── */
  private assignSignals() {
    const shown: number[] = [], lit: number[] = [];
    this.eShown.forEach((s, i) => { if (s) { shown.push(i); if (this.eLit[i]) lit.push(i); } });
    this.signals.forEach((sig, i) => {
      const pool = lit.length && i % 2 === 0 ? lit : shown;
      sig.edge = pool.length ? pool[Math.floor(hash(`a${i}:${pool.length}`) * pool.length)] : -1;
    });
  }
  private stepSignals(): boolean {
    const active = !this.paused && !this.reduced && this.opening >= 1;
    const pos = this.sigGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.sigGeo.getAttribute('aColor') as THREE.BufferAttribute;
    const alpha = this.sigGeo.getAttribute('aAlpha') as THREE.BufferAttribute;
    const lineCol = this.lineGeo.getAttribute('aColor') as THREE.BufferAttribute;
    this.signals.forEach((s, i) => {
      for (let j = 0; j < TRAIL; j++) {
        const o = i * TRAIL + j;
        if (!active || s.edge < 0) { alpha.setX(o, 0); continue; }
        const head = (s.phase + this.time * s.speed) % 1;
        const t = head - j * TRAIL_GAP;
        if (t <= 0) { alpha.setX(o, 0); continue; }
        pos.setXYZ(o, ...this.bezier(s.edge, t));
        const v = s.edge * this.K * 2;
        col.setXYZ(o, lineCol.getX(v), lineCol.getY(v), lineCol.getZ(v));
        const strength = this.eLit[s.edge] ? 1 : this.state.selected ? 0.12 : 0.6;
        alpha.setX(o, Math.sin(Math.PI * head) * strength * Math.min(1, this.eAlpha[s.edge] * 2.4) * (1 - j * 0.32));
      }
    });
    pos.needsUpdate = true; col.needsUpdate = true; alpha.needsUpdate = true;
    return active;
  }

  /* ── Internal: state transitions ── */
  private snap() {
    this.nAlpha.set(this.nAlphaT); this.nScale.set(this.nScaleT); this.nGlow.set(this.nGlowT);
    this.eAlpha.set(this.eAlphaT); this.eGrow.fill(1);
    this.offset = { ...this.offsetT };
    this.writeNodes(); this.writeEdges();
  }
  private stepStates(dt: number): boolean {
    const k = this.still ? 1 : 1 - Math.exp(-dt * 9);
    let busy = false, nodesDirty = false, edgesDirty = false;
    const approach = (cur: Float32Array, tgt: Float32Array, i: number) => {
      const d = tgt[i] - cur[i];
      if (Math.abs(d) < 0.002) { if (d !== 0) { cur[i] = tgt[i]; return true; } return false; }
      cur[i] += d * k; busy = true; return true;
    };
    for (let i = 0; i < this.nodes.length; i++) {
      const a = approach(this.nAlpha, this.nAlphaT, i), b = approach(this.nScale, this.nScaleT, i), c = approach(this.nGlow, this.nGlowT, i);
      nodesDirty = nodesDirty || a || b || c;
    }
    for (let i = 0; i < this.edges.length; i++) {
      if (approach(this.eAlpha, this.eAlphaT, i)) edgesDirty = true;
      if (this.eGrow[i] < 1) { this.eGrow[i] = this.still ? 1 : Math.min(1, this.eGrow[i] + dt / 0.7); busy = true; edgesDirty = true; }
    }
    if (this.opening < 1) edgesDirty = true;
    if (nodesDirty) this.writeNodes();
    if (edgesDirty) this.writeEdges();
    return busy;
  }
  private writeNodes() {
    const a = this.nodeGeo.getAttribute('aAlpha') as THREE.BufferAttribute, s = this.nodeGeo.getAttribute('aSize') as THREE.BufferAttribute;
    const g = this.nodeGeo.getAttribute('aGlow') as THREE.BufferAttribute, base = this.nodeGeo.userData.baseSize as Float32Array;
    const lift = this.nodeGeo.getAttribute('aLift') as THREE.BufferAttribute;
    for (let i = 0; i < this.nodes.length; i++) {
      a.setX(i, this.nAlpha[i]); s.setX(i, base[i] * this.nScale[i] * this.grow[i]); g.setX(i, this.nGlow[i]);
      // Glow pull distance = the assembly's outer sphere radius (to the farthest corner)
      lift.setX(i, assemblyRadius(this.half[i], this.nScale[i] * this.grow[i]));
    }
    a.needsUpdate = true; s.needsUpdate = true; g.needsUpdate = true; lift.needsUpdate = true;
    this.writeVoxels();
  }
  /** Copy node state (brightness, size, glow, grow-in) to all of its pieces */
  private writeVoxels() {
    const sc = this.voxGeo.getAttribute('aScale') as THREE.InstancedBufferAttribute, al = this.voxGeo.getAttribute('aAlpha') as THREE.InstancedBufferAttribute;
    const gl = this.voxGeo.getAttribute('aGlow') as THREE.InstancedBufferAttribute;
    for (let p = 0; p < this.pieceNode.length; p++) {
      const i = this.pieceNode[p];
      sc.setX(p, this.nScale[i] * this.grow[i]); al.setX(p, this.nAlpha[i]); gl.setX(p, this.nGlow[i]);
    }
    sc.needsUpdate = true; al.needsUpdate = true; gl.needsUpdate = true;
  }
  /** If node positions changed (intermediate during opening or update transitions), move piece centers with them */
  private syncCenters() {
    const pos = this.nodeGeo.getAttribute('position') as THREE.BufferAttribute;
    if (pos.version === this.centerVersion) return;
    this.centerVersion = pos.version;
    const c = this.voxGeo.getAttribute('aCenter') as THREE.InstancedBufferAttribute;
    for (let p = 0; p < this.pieceNode.length; p++) { const i = this.pieceNode[p]; c.setXYZ(p, pos.getX(i), pos.getY(i), pos.getZ(i)); }
    c.needsUpdate = true;
  }
  /** Selection outline: cube edges around the selected node's assembly (slowly breathing when motion is allowed) */
  private updateCage() {
    const i = this.state.selected ? this.index.get(this.state.selected) : undefined;
    this.cage.visible = i !== undefined && this.opening >= 1;
    if (i === undefined) return;
    const pos = this.nodeGeo.getAttribute('position') as THREE.BufferAttribute;
    this.cage.position.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const pulse = this.still ? 1 : 1 + 0.06 * Math.sin(this.time * 2.4);
    this.cage.scale.setScalar((this.half[i] * 2 * this.nScale[i] * 1.35 + 0.02) * pulse);
  }
  private writeEdges() {
    const al = this.lineGeo.getAttribute('aAlpha') as THREE.BufferAttribute, K = this.K;
    const fade = this.opening >= 1 ? 1 : smooth(0.62, 1, this.opening);
    for (let i = 0; i < this.edges.length; i++) {
      const a = this.eAlpha[i] * fade, grow = this.opening >= 1 ? this.eGrow[i] : smooth(0.6, 1, this.opening);
      for (let s = 0; s < K; s++) {
        const t0 = s / K, t1 = (s + 1) / K;
        const taper = (t: number) => 0.55 + 0.45 * Math.sin(Math.PI * t);
        al.setX((i * K + s) * 2, t0 <= grow ? a * taper(t0) : 0);
        al.setX((i * K + s) * 2 + 1, t1 <= grow + 1e-6 ? a * taper(t1) : 0);
      }
    }
    al.needsUpdate = true;
  }

  /* ── Internal: labels (overlap control) ── */
  /** settle: nothing is drawn after this frame (last frame after motion stops, or the single draw when paused or reduced motion) — place labels without hold time */
  private updateLabels(settle: boolean) {
    if (!this.labelsOn) return;
    const { visible, selected, hover, emphasis } = this.state;
    const lit = new Set<string>();
    this.edges.forEach((e, i) => { if (this.eLit[i]) { lit.add(e.a); lit.add(e.b); } });
    const showMaterials = this.opening >= 1;
    const cands: { i: number; rank: number; x: number; y: number; z: number; r: number }[] = [];
    const camDist = this.camera.position.distanceTo(this.controls.target);
    const v = new THREE.Vector3();
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (this.opening < 0.82 && n.kind !== 'router' && n.kind !== 'area') continue;
      const isSel = n.id === selected, isHover = n.id === hover, isLit = lit.has(n.id);
      const hub = n.kind !== 'material';
      if (!visible.has(n.id) && !isSel && !isHover) continue;
      if (!hub && !(isSel || isHover || isLit || (showMaterials && camDist < this.nearDistance * 0.45))) continue;
      if (selected && !isSel && !isLit && n.kind !== 'router' && n.kind !== 'area' && !isHover) continue;
      v.copy(this.worldOf(i)).project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
      const rank = isSel ? 0 : isHover ? 1 : isLit && hub ? LABEL_RANK[n.kind] - 0.5 : isLit ? 7 : LABEL_RANK[n.kind];
      cands.push({ i, rank, x: (v.x + 1) / 2 * this.width, y: (1 - v.y) / 2 * this.height, z: v.z, r: 6 + this.nScale[i] * 4 });
    }
    const was = this.labelShown;
    cands.sort((a, b) => a.rank - b.rank || +was.has(this.nodes[b.i].id) - +was.has(this.nodes[a.i].id) || a.z - b.z);
    const now = performance.now();
    // Temporal stabilization applies only while moving. When motion stops, waiting labels and held overlaps resolve that frame, so a still view needs no timer or extra frames.
    // Right after a state change (on, select, hover, data, size) only new labels skip the wait; already shown labels keep their hold and lock
    const pace: LabelPace = settle ? 'settle' : this.labelFresh ? 'show' : 'hold';
    this.labelFresh = false;
    const shownNow = new Set<string>();
    const seen = new Set<string>();
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    let used = 0;
    const limit = this.width < 720 ? 22 : 46;
    const ins = this.fitInsets;
    // Router assembly's screen circle (projected outer sphere radius + 3px): no other label goes on it (so labels don't flash over the central assembly while rotating)
    const reserve = this.routerReserve(v);
    const hits = (b: { x: number; y: number; w: number; h: number }) => {
      if (!reserve) return false;
      const qx = Math.min(Math.max(reserve.x, b.x), b.x + b.w), qy = Math.min(Math.max(reserve.y, b.y), b.y + b.h);
      return (qx - reserve.x) ** 2 + (qy - reserve.y) ** 2 < reserve.r * reserve.r;
    };
    // Never under the top bar, legend, toolbar (safe-area edges) or the portrait phone control bar
    const outside = (b: { x: number; y: number; w: number; h: number }) =>
      b.x < Math.max(4, ins.left - 8) || b.x + b.w > this.width - Math.max(4, ins.right - 8) || b.y < ins.top - 8 || b.y + b.h > this.height - Math.max(4, ins.bottom - 8)
      || (!!ins.corner && b.x + b.w > this.width - ins.corner.w - 4 && b.y + b.h > this.height - ins.corner.h - 4);
    for (const c of cands) {
      if (used >= limit) break;
      const n = this.nodes[c.i];
      const isSel = n.id === selected;
      const h = n.kind === 'area' ? 22 : 18;
      const count = this.state.folded?.get(n.id);
      const text = labelText(n.title, count);
      // Width is measured after drawing (selected labels differ in weight and border, so measured separately). Before measuring, Hangul is estimated wide to avoid overlap
      const key = `${n.id}${isSel ? '*' : ''}${count ? `+${count}` : ''}`;
      const w = this.labelWidth.get(key) ?? labelEstimate(text, n.kind === 'area' ? 14 : 12) + (isSel ? 18 : 14);
      // Side: the router is always on the right (the origin projects to the screen center, where float error used to flip it); others keep their previous side within the center dead band
      const geo = n.kind === 'router' ? true : labelSide(c.x, this.width / 2 - this.offset.x, this.labelSide.get(n.id));
      const prevGeo = this.labelSide.get(n.id);
      this.labelSide.set(n.id, geo);
      const prev = this.labelHold.get(n.id);
      // Try the previous side first (unless it crossed the center line), so a label pushed to the other side by overlap stays until that spot is blocked
      const want = prev && prevGeo === geo ? prev.side : geo;
      const y = c.y - h / 2;
      const at = (side: boolean) => ({ x: side ? c.x + c.r + 4 : c.x - c.r - 4 - w, y, w, h });
      const own = n.kind === 'router';
      const hard = (b: { x: number; y: number; w: number; h: number }) => outside(b) || (!own && hits(b));
      seen.add(n.id);
      let box: { x: number; y: number; w: number; h: number } | null = null;
      if (c.rank <= 1) {
        // Selected and hovered labels always show but never cover the central router assembly: try both sides → same side pushed outside the assembly → above/below it
        const opts = [at(want), at(!want)];
        if (reserve && !own) {
          for (const side of [want, !want]) opts.push({ x: side ? reserve.x + reserve.r + 4 : reserve.x - reserve.r - 4 - w, y, w, h });
          opts.push({ x: c.x - w / 2, y: reserve.y - reserve.r - 4 - h, w, h }, { x: c.x - w / 2, y: reserve.y + reserve.r + 4, w, h });
        }
        box = opts.find(b => !hard(b)) ?? opts[0];
        const side = box.x + w / 2 >= c.x;
        this.labelHold.set(n.id, { shown: true, side, movedAt: prev && prev.side === side && Number.isFinite(prev.movedAt) ? prev.movedAt : now, clashAt: 0, freeAt: 0 });
      } else {
        // Others use temporal stabilization: hold through brief overlaps; to appear or reappear, a free spot must last the hold time
        const block = (side: boolean): LabelBlock => { const b = at(side); return hard(b) ? 2 : placed.some(p => overlaps(b, p, LABEL_GAP)) ? 1 : 0; };
        const r = holdLabel(prev, want, block, now, pace);
        this.labelHold.set(n.id, r.next);
        if (r.side !== null) box = at(r.side);
      }
      if (!box) continue;
      placed.push(box);
      let el = this.labels[used];
      if (!el) { el = document.createElement('div'); this.labelLayer.appendChild(el); this.labels.push(el); }
      if (el.dataset.id !== n.id) {
        el.dataset.id = n.id;
        el.className = `scene-label scene-label--${n.kind}`;
      }
      if (el.textContent !== text) el.textContent = text;
      el.classList.toggle('is-folded', !!count);
      el.classList.toggle('is-selected', isSel);
      el.classList.toggle('is-dim', !!emphasis && !emphasis.has(n.id) && n.kind !== 'router');
      el.style.transform = `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`;
      el.hidden = false;
      if (!this.labelWidth.has(key) && el.offsetWidth) this.labelWidth.set(key, el.offsetWidth);
      shownNow.add(n.id);
      used++;
    }
    this.labelShown = shownNow;
    for (let i = used; i < this.labels.length; i++) this.labels[i].hidden = true;
    // Labels that weren't candidates this frame (hidden, deleted, private, source switch, off screen, count cap) are removed without hold time
    for (const id of this.labelHold.keys()) if (!seen.has(id)) this.labelHold.delete(id);
    for (const id of this.labelSide.keys()) if (!seen.has(id)) this.labelSide.delete(id);
  }

  /** Router assembly's screen circle (px). null if the router isn't visible or is behind the camera */
  private routerReserve(v: THREE.Vector3): { x: number; y: number; r: number } | null {
    const i = this.routerIndex;
    if (i < 0 || this.nAlpha[i] < 0.05) return null;
    const world = this.worldOf(i);
    const depth = -world.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
    if (depth <= 1e-4) return null;
    v.copy(world).project(this.camera);
    const px = assemblyRadius(this.half[i], this.nScale[i] * this.grow[i]) * this.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * depth);
    return { x: (v.x + 1) / 2 * this.width, y: (1 - v.y) / 2 * this.height, r: px + 3 };
  }

  /* ── Internal: input (raycast picking) ── */
  private pick(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const dist = this.camera.position.distanceTo(this.controls.target);
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.raycaster.params.Points = { threshold: dist * (coarse ? 0.035 : 0.022) };
    const hits = this.raycaster.intersectObject(this.points, false);
    let best: { id: string; score: number } | null = null;
    for (const h of hits) {
      const i = h.index!;
      if (this.nAlpha[i] < 0.05) continue;
      const n = this.nodes[i];
      const radius = this.half[i] * this.nScale[i];
      const score = (h.distanceToRay ?? 0) / (radius + dist * 0.004) + (this.state.visible.has(n.id) ? 0 : 1.5) + h.distance * 0.05;
      if (!best || score < best.score) best = { id: n.id, score };
    }
    return best?.id ?? null;
  }
  private bindInput() {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      c.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => c.removeEventListener(type, fn as EventListener, opts));
    };
    on('pointerdown', e => { this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; this.hooks.onInteract(); if (this.opening < 1) this.finishOpening(true); });
    on('pointerup', e => {
      const d = this.down;
      this.down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
      this.hooks.onPick(this.pick(e.clientX, e.clientY));
    });
    on('dblclick', e => { const id = this.pick(e.clientX, e.clientY); if (id) this.hooks.onDoublePick(id); });
    on('pointermove', e => {
      if (e.pointerType !== 'mouse' || this.down) return;
      this.hoverPending = { x: e.clientX, y: e.clientY };
      this.request();
    });
    on('pointerleave', () => { this.hoverPending = null; this.hooks.onHover(null); });
    on('wheel', () => this.hooks.onInteract(), { passive: true });
    const lost = (e: Event) => { e.preventDefault(); this.hooks.onContextLost(); };
    c.addEventListener('webglcontextlost', lost);
    this.disposers.push(() => c.removeEventListener('webglcontextlost', lost));
    const vis = () => { if (!document.hidden) { this.last = performance.now(); this.request(); } };
    document.addEventListener('visibilitychange', vis);
    this.disposers.push(() => document.removeEventListener('visibilitychange', vis));
  }

  /* ── Render loop ── */
  request() {
    if (this.raf || this.inFrame || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.raf = 0;
    if (document.hidden) return;
    this.inFrame = true;
    // Frame delta capped at 0.1 s: transitions and camera moves finish in real time on slow devices (10fps+), clamped only to avoid jumps after a stall
    const raw = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.1, raw);
    this.last = now;
    if (!this.paused && !this.reduced) this.time += dt;
    let busy = this.stepOpening(now);
    busy = this.stepMorph(now) || busy;
    busy = this.stepStates(dt) || busy;
    if (this.camAnim) {
      const a = this.camAnim;
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = ease(a.t);
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.controls.target.lerpVectors(a.from, a.to, e);
      this.camera.position.copy(this.controls.target).add(dir.multiplyScalar(a.fromDist + (a.toDist - a.fromDist) * e));
      if (a.t >= 1) this.camAnim = null;
      busy = true;
    }
    const dx = this.offsetT.x - this.offset.x, dy = this.offsetT.y - this.offset.y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      const k = this.still ? 1 : 1 - Math.exp(-dt * 8);
      this.offset.x += dx * k; this.offset.y += dy * k;
      this.applyOffset();
      busy = true;
    } else if (dx || dy) { this.offset = { ...this.offsetT }; this.applyOffset(); }
    // Auto-rotation: if allowed and the pause is over, ramp up slowly to target speed; otherwise ramp down quickly (paused/reduced motion: 0 at once)
    const allowed = this.autoRotate && !this.still && this.opening >= 1 && !this.rot.dragging;
    const goal = allowed && now >= this.rot.holdUntil ? 1 : 0;
    if (this.still) this.rot.factor = 0;
    else {
      this.rot.factor += (goal - this.rot.factor) * (1 - Math.exp(-dt / (goal > this.rot.factor ? ORBIT_EASE_IN : ORBIT_EASE_OUT)));
      if (goal === 0 && this.rot.factor < 0.003) this.rot.factor = 0;
      if (goal === 1 && this.rot.factor > 0.9995) this.rot.factor = 1;
    }
    this.controls.autoRotate = this.rot.factor > 0;
    this.controls.autoRotateSpeed = ORBIT_SPEED * this.rot.factor;
    // Rotation angle follows real elapsed time (same turn time even on slow frames). On the first frame back from hidden, request() resets the clock
    const moved = this.controls.update(Math.min(0.25, raw));
    busy = busy || moved || this.controls.autoRotate;
    busy = this.stepSignals() || busy;
    if (this.hoverPending) {
      const id = this.pick(this.hoverPending.x, this.hoverPending.y);
      this.hoverPending = null;
      this.canvas.style.cursor = id ? 'pointer' : 'grab';
      if (id !== this.state.hover) this.hooks.onHover(id);
    }
    this.syncCenters();
    this.updateCage();
    this.renderer.render(this.scene, this.camera);
    this.updateLabels(!busy);
    this.frameTimes.push(now);
    this.frameCount++;
    if (this.frameTimes.length > 240) this.frameTimes.splice(0, 120);
    this.inFrame = false;
    if (busy) this.raf = requestAnimationFrame(this.frame);
  };
}

/** Whether WebGL2 is available (decides the fallback screen) */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}
