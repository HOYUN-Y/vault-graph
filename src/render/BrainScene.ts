// Three.js 3D 신경망 장면. 데이터 · 규칙(core/)과 분리된 그리기 · 입력 전용 모듈이다.
// - 노드: 복셀(정육면체 조각을 인스턴싱한 한 번의 그리기). 문서 하나 = 노드 하나이고 종류마다 조립 형태가 다르다(render/voxel.ts).
//   면마다 밝기가 달라 회전하면 입체 면이 읽히고, 모서리는 밝은 테두리로 격자를 드러낸다. 노드 자리는 격자에 맞춘다.
//   노드 뒤 발광은 Points(픽셀 띠 모양) 한 겹이며 누르기 판정도 이 Points로 한다(조각 수와 무관하게 노드 기준).
// - 선: 곡선(2차 베지어)을 잘게 나눈 LineSegments, 신호: 보이는 선을 따라 흐르는 픽셀 블록 세 칸, 바닥: 옅은 격자면
// - 오프닝: 뇌 형상 좌표(장식 입자 + 노드 출발점)에서 실제 자리로 풀린다. 실제 자리는 바꾸지 않는다.
// - 지속 효과(자동 회전 · 신호)는 정지 · 동작 줄이기 · 탭 숨김에서 멈추고, 할 일이 없으면 그리기를 쉰다.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Vec3 } from '../core/layout3d';
import { hash } from '../core/layout3d';
import { holdLabel, labelSide, type LabelBlock, type LabelHold, type LabelPace } from '../core/label-side';
import type { DocFormat, EdgeKind, NodeKind } from '../core/types';
import { fitDistance as fitFor } from './fit';
import { assemblyRadius } from './glow-lift';
import { CELL, assembly, snapToGrid } from './voxel';

export interface SceneNodeInput { id: string; kind: NodeKind; format: DocFormat; title: string; color: string; pos: Vec3; brain: Vec3; depth: number }
export interface SceneEdgeInput { key: string; a: string; b: string; kind: EdgeKind }
export type GlowDepthMode = 'lift' | 'raw' | 'off' | 'none';
export interface SceneState {
  visible: ReadonlySet<string>;
  /** 보이는 선: 쌍 키 → 이 보기에서의 대표 종류 */
  shown: ReadonlyMap<string, EdgeKind>;
  emphasis: ReadonlySet<string> | null;
  selected: string | null;
  hover: string | null;
}
export interface SceneHooks {
  onPick(id: string | null): void;
  onDoublePick(id: string): void;
  onHover(id: string | null): void;
  /** 끌기 · 휠 · 누르기 등 직접 조작(자동 시연 중단용) */
  onInteract(): void;
  onOpeningDone(): void;
  onContextLost(): void;
}
/** 기본 시선 방향(원점에서 카메라 쪽) */
const HOME_DIR: Vec3 = [0.12, 0.42, 1];

/** corner: 오른쪽 아래 구석을 가리는 도구줄(휴대폰 세로 조작 막대)의 크기(px, 캔버스 오른쪽 · 아래 가장자리부터) */
export interface Insets { top: number; right: number; bottom: number; left: number; corner?: { w: number; h: number } }

const TOPIC = new THREE.Color('#FFB52E');
const WHITE = new THREE.Color('#ffffff');
// 발광(Points) 반지름 — 복셀 조립보다 조금 넓게
const SIZE: Record<NodeKind, number> = { router: 0.075, area: 0.04, subindex: 0.028, guide: 0.028, moc: 0.036, material: 0.0132 };
/**
 * 자동 회전(카메라가 그래프 둘레를 세로축으로 돈다).
 * OrbitControls 단위는 '60초에 autoRotateSpeed 바퀴'다. 이전 값 0.45는 한 바퀴 133초(초당 2.7°)라 눈에 거의 띄지 않았다.
 */
export const ORBIT_TURN_S = 45;
const ORBIT_SPEED = 60 / ORBIT_TURN_S;
/** 직접 조작(끌기 · 휠 · 키보드 회전 · 확대 단추 · 검색 입력)이 끝나고 다시 돌기 시작할 때까지 */
export const ORBIT_RESUME_MS = 4000;
/** 오프닝 끝 · 선택 해제 · 시연 종료 뒤 다시 돌기 시작할 때까지 */
export const ORBIT_SETTLE_MS = 1200;
/** 회전 속도가 목표에 다가가는 시간 상수(초): 출발은 천천히, 멈춤은 빨리 */
const ORBIT_EASE_IN = 0.7, ORBIT_EASE_OUT = 0.18;
const GLOW: Record<NodeKind, number> = { router: 1.25, area: 0.95, subindex: 0.6, guide: 0.55, moc: 0.85, material: 0.4 };
const BG = new THREE.Color('#162033');
const IVORY = new THREE.Color('#F6F1E7');
const BEND: Record<EdgeKind, number> = { primary: 0.12, index: 0.24, topic: 0.3 };
const BASE_ALPHA: Record<EdgeKind, number> = { primary: 0.36, index: 0.6, topic: 0.3 };
// 이름표 겹침 판정 여백(px)과 그리기 전 너비 추정: 한글 · 한자 등 넓은 글자는 글자 크기만큼, 나머지는 0.6배
const LABEL_GAP = 4;
const labelEstimate = (text: string, size: number) => [...text].reduce((w, ch) => w + (ch.charCodeAt(0) >= 0x1100 ? size : size * 0.6), 0);
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, gap: number) =>
  !(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);
const LABEL_RANK: Record<NodeKind, number> = { router: 2, area: 3, moc: 4, subindex: 5, guide: 6, material: 9 };
const HALO = 2.8; // 스프라이트 = 도형 반지름 × HALO(바깥은 발광)
const OPEN_MS = 2900;
/** 데이터 갱신 뒤 노드가 새 자리로 옮겨 가는 시간 */
const MORPH_MS = 600;
/** 신호 꼬리 칸 수와 칸 사이 간격(곡선 비율) */
const TRAIL = 3;
const TRAIL_GAP = 0.028;

const NODE_VERT = /* glsl */ `
attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aGlow; attribute float aLift;
uniform float uProj; uniform float uFar; uniform float uLift;
varying vec3 vColor; varying float vAlpha; varying float vGlow; varying float vFog; varying float vInner;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // 발광의 깊이만 그 노드 조립의 바깥 구(반지름 aLift)만큼 카메라 쪽으로 당긴다. 카메라→노드 광선 위에서 옮기므로
  // 화면 위치 · 크기는 그대로이고, 자기 조립 큐브에는 가리지 않되 앞에 있는 다른 노드에는 그대로 가린다(깊이 검사 유지)
  float len = length(mv.xyz);
  vec3 eye = mv.xyz * (max(0.03, len - aLift * uLift) / max(len, 1e-4));
  gl_Position = projectionMatrix * vec4(eye, 1.0);
  float dist = max(0.05, -mv.z);
  float px = aSize * ${HALO.toFixed(1)} * uProj / dist;
  gl_PointSize = clamp(px, 1.5, 320.0);
  vColor = aColor; vAlpha = aAlpha; vGlow = aGlow;
  vFog = clamp(1.35 - dist / uFar, 0.38, 1.0);
  // 조립 반폭(스프라이트 단위): 앞으로 당긴 발광이 자기 큐브 면을 덮지 않도록 이 안쪽은 비운다
  vInner = uLift > 0.5 ? aLift / (1.7320508 * max(aSize, 1e-5)) : 0.0;
}`;
const NODE_FRAG = /* glsl */ `
varying vec3 vColor; varying float vAlpha; varying float vGlow; varying float vFog; varying float vInner;
void main() {
  // 복셀 뒤의 발광: 둥근 번짐 대신 네모에 가까운 거리 · 계단 띠(픽셀 발광). 도형은 복셀이 그린다
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
// 신호 · 오프닝 입자: 네모 픽셀(밝은 속 + 옅은 테두리)
const DOT_FRAG = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main() {
  vec2 q = abs(gl_PointCoord - 0.5) * 2.0;
  float m = max(q.x, q.y);
  float a = ((1.0 - step(0.52, m)) + (1.0 - step(0.98, m)) * 0.3) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.35), a);
}`;
// 복셀: 노드 중심(aCenter) + 조각 위치(aOffset) + 정육면체(position × aSize), 노드 크기(aScale)로 함께 자란다
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
// 면 밝기: 윗면 > 빛 쪽 옆면 > 그늘 옆면 > 아랫면. 모서리 띠는 밝게(격자), 흐린 노드는 지면 색으로 물러난다(불투명 · 깊이 기록)
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
// 바닥 격자면: 복셀 칸의 네 배 간격 가는 선 + 다섯 칸마다 굵은 선, 가운데서 멀어지면 사라진다
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
  // 테마 지면: 가운데 Navy 800(#162033)에서 가장자리 Navy 950(#0B1220)로. 좌우 반구 쪽에 슬레이트 · 아이보리의 아주 옅은 기운
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
  /** 발광 겹 + 누르기 판정(노드 하나에 점 하나) */
  private points: THREE.Points;
  private voxGeo = new THREE.InstancedBufferGeometry();
  private voxMat: THREE.ShaderMaterial;
  /** 조각 → 노드 번호. 조각 수(그리기 단위)와 노드 수(문서 수)는 다르다 */
  private pieceNode: Uint32Array;
  /** 노드별 조립 반 너비 */
  private half: Float32Array;
  /** 오프닝 동안 자라 나오는 비율(끝나면 1) */
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
  /** 라우터 노드 번호(-1 = 없음): 중앙 조립 화면 원 예약용 */
  private routerIndex = -1;
  private edges: SceneEdgeInput[];
  private edgeIndex = new Map<string, number>();
  private K: number;
  /** 선이 많을수록(더해 그리는 선이 겹쳐 하얗게 뜨지 않게) 기본 밝기를 낮춘다. 주제 연결(금색)은 한 번 더 낮춘다 */
  private density: number;
  private curve: Float32Array; // 선마다 A · C · B
  private nodeColor: THREE.Color[];
  // 상태(현재 · 목표)
  private nAlpha: Float32Array; private nAlphaT: Float32Array;
  private nScale: Float32Array; private nScaleT: Float32Array;
  private nGlow: Float32Array; private nGlowT: Float32Array;
  private eAlpha: Float32Array; private eAlphaT: Float32Array; private eGrow: Float32Array;
  private eKind: EdgeKind[]; private eLit: Uint8Array; private eShown: Uint8Array;
  private signals: { edge: number; phase: number; speed: number }[] = [];
  private state: SceneState = { visible: new Set(), shown: new Map(), emphasis: null, selected: null, hover: null };
  private prevVisible: ReadonlySet<string> = new Set();
  private prevShown!: Uint8Array;
  /** 전체 보기 거리를 정할 때 빼는 가장자리(상세 패널처럼 잠깐 열리는 것은 빼지 않는다) */
  private fitInsets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** 사용자가 아직 확대 · 끌기 · 초점 이동을 하지 않아 카메라가 전체 보기 거리에 있다(창 크기 · 가장자리가 바뀌면 거리를 다시 맞춘다) */
  private atHome = true;
  private insetsSet = false;
  /** 가장자리로 정한 화면 치우침, 구석 막대가 있을 때 투영 중심을 위로 올린 양(px) — 실제 목표 치우침은 둘의 합 */
  private baseOffset = { x: 0, y: 0 };
  private cornerLift = 0;

  private raf = 0; private inFrame = false; private last = 0; private time = 0;
  private paused = false; private reduced = false; private autoRotate = true;
  /** 자동 회전 상태: factor = 목표 속도 대비 지금 속도(0~1), holdUntil = 이 시각까지 쉰다, dragging = 직접 조작 중 */
  private rot = { factor: 0, holdUntil: 0, dragging: false, timer: 0 };
  private opening = 1; // 1 = 끝
  private openStart = 0;
  // 데이터 갱신 뒤 이전 자리 → 새 자리로 옮겨 가는 전환(선택 노드는 카메라가 같이 움직여 화면 자리를 지킨다)
  private morph: { start: number; from: Float32Array; delta: THREE.Vector3; done: number } | null = null;
  private fitDistance = 3;
  /** 노드 초점 · 자료 이름표 기준 거리(배치 반지름 기준 — 전체 보기 거리와 따로 둬 선택 시 확대 정도가 화면 가장자리에 따라 바뀌지 않게) */
  private nearDistance = 3;
  /** 배치가 차지하는 반지름(98% 지점) — 화면을 채우는 카메라 거리 기준 */
  private extent = 1;
  private camAnim: { from: THREE.Vector3; to: THREE.Vector3; fromDist: number; toDist: number; t: number; dur: number } | null = null;
  private offset = { x: 0, y: 0 }; private offsetT = { x: 0, y: 0 };
  private width = 1; private height = 1;
  private down: { x: number; y: number; t: number } | null = null;
  private hoverPending: { x: number; y: number } | null = null;
  private labels: HTMLDivElement[] = [];
  private labelWidth = new Map<string, number>();
  /** 노드별 직전 중심선 기준 방향(데드밴드) */
  private labelSide = new Map<string, boolean>();
  /** 노드별 이름표 시간 안정화 상태(보임 · 놓은 쪽 · 시각). 이번 프레임 후보가 아니면(숨김 · 삭제 · 화면 밖 · 끔) 바로 지운다 */
  private labelHold = new Map<string, LabelHold>();
  /** 다음 이름표 계산은 대기 없이 바로(이름표 켬 · 상태 · 크기 바뀜 직후) */
  private labelFresh = true;
  /** 직전 프레임에 보인 이름표: 같은 순위끼리는 먼저 자리를 잡아, 회전 중 이름표끼리 번갈아 숨었다 나타나지 않게 한다 */
  private labelShown = new Set<string>();
  /** 장면 이름표 표시(글자 켬/끔). 끄면 선택 · 가리킴 · 시연 이름표까지 숨긴다 */
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
    // 노드 자리를 복셀 격자에 맞춘다(이후 선 · 신호 · 이름표 · 누르기 · 갱신 이어 받기가 모두 이 자리를 쓴다)
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

    // 배경
    this.bgMat = new THREE.ShaderMaterial({ vertexShader: BG_VERT, fragmentShader: BG_FRAG, uniforms: { uAspect: { value: new THREE.Vector2(1, 1) } }, depthTest: false, depthWrite: false });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    bg.frustumCulled = false; bg.renderOrder = -10;
    this.scene.add(bg, this.root);

    // 노드
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

    // 복셀 조각(인스턴싱 한 번): 노드마다 종류별 조립 형태
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

    // 바닥 격자면(장식) · 선택 테두리(조립을 감싸는 정육면체 모서리)
    this.floorMat = new THREE.ShaderMaterial({ vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uCell: { value: CELL * 4 }, uFade: { value: 1 } } });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2), this.floorMat);
    this.floor.position.y = -this.extent * 1.2; this.floor.renderOrder = -5; this.floor.frustumCulled = false;
    this.cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: IVORY, transparent: true, opacity: 0.9, depthTest: false }));
    this.cage.visible = false; this.cage.renderOrder = 5; this.cage.frustumCulled = false;

    // 선(곡선)
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

    // 신호(선을 따라 흐르는 빛) — 관계를 보여 주는 연출이며 실제 활동을 뜻하지 않는다
    // 신호 하나 = 픽셀 블록 세 칸(앞 칸이 가장 밝고 크다)
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

    // 오프닝 장식 입자(뇌 형상). 검색 · 개수 · 선택 대상이 아니다
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

    // 카메라 · 조작
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

  /* ── 공개 API ── */
  setState(next: SceneState) {
    this.state = next;
    this.labelFresh = true;
    const N = this.nodes.length;
    const { visible, emphasis, selected, hover } = next;
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
      let alpha = vis ? 1 : 0.2, scale = vis ? 1 : 0.42, glow = vis ? GLOW[n.kind] : 0;
      const outside = emphasis && !emphasis.has(n.id) && n.kind !== 'router';
      if (outside) { alpha *= 0.22; glow *= 0.15; }
      if (selected) {
        if (n.id === selected) { alpha = 1; scale = 1.55; glow = 1.7; }
        else if (neighbors.has(n.id)) { alpha = Math.max(alpha, 0.95); glow = Math.max(glow, 0.7); }
        else { alpha *= 0.3; glow *= 0.25; }
      }
      if (hover === n.id) { scale *= 1.3; alpha = Math.max(alpha, 0.9); glow = Math.max(glow, 1.1); }
      // 새로 보이는 노드(펼침)는 작게 시작해 자라 나온다. 선택 · 필터로 흐려졌다 돌아오는 경우는 아니다
      if (vis && !this.prevVisible.has(n.id) && this.opening >= 1 && !this.still) this.nScale[i] = Math.min(this.nScale[i], 0.2);
      this.nAlphaT[i] = alpha; this.nScaleT[i] = scale; this.nGlowT[i] = glow;
    }
    const lineCol = this.lineGeo.getAttribute('aColor') as THREE.BufferAttribute;
    const tmp = new THREE.Color();
    this.edges.forEach((e, i) => {
      const kind = this.eKind[i];
      const shown = this.eShown[i] === 1;
      let a = shown ? BASE_ALPHA[kind] * this.density * (kind === 'topic' && this.density < 1 ? 0.75 : 1) : 0.032;
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

  /** immediate: 데이터 갱신으로 다시 만든 장면은 화면 치우침을 미끄러지듯 옮기지 않고 바로 맞춘다 */
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
    // 첫 가장자리는 바로 맞춘다(첫 구도가 미끄러지는 동안 누르면 엇나간다). 이후 상세 패널 등으로 바뀔 때만 미끄러진다
    if (this.still || immediate || !this.insetsSet) { this.offset = { ...this.offsetT }; this.applyOffset(); }
    this.insetsSet = true;
    this.request();
  }
  /** 장면 이름표 켬/끔: 장면 · 카메라 · 모션 상태는 그대로 두고 이름표 층만 바꾼다(정지 · 동작 줄이기에서도 한 프레임만 다시 그림) */
  setLabels(on: boolean) {
    if (this.labelsOn === on) return;
    this.labelsOn = on;
    this.labelLayer.hidden = !on;
    if (!on) { for (const el of this.labels) el.hidden = true; this.labelShown = new Set(); this.labelHold.clear(); this.labelSide.clear(); }
    this.labelFresh = true;
    this.request();
  }
  /** 검증용(?perf=1): 발광 깊이 비교. lift = 기본(자기 조립 앞으로), raw = 이전(노드 중심 깊이), off = 깊이 검사 없음, none = 발광 숨김 */
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
  /** 자동 회전을 지금 멈추고 ms 뒤에 다시 천천히 시작한다(그사이에는 프레임을 돌리지 않고 타이머만 둔다) */
  holdRotation(ms = ORBIT_RESUME_MS) {
    this.rot.factor = 0;
    this.rot.holdUntil = Math.max(this.rot.holdUntil, performance.now() + ms);
    window.clearTimeout(this.rot.timer);
    this.rot.timer = window.setTimeout(() => this.request(), Math.max(0, this.rot.holdUntil - performance.now()) + 16);
    this.request();
  }
  /** 자동 회전 상태(검증 · 보고용) */
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

  /** 고른 문서 쪽으로 카메라를 옮긴다(패널 자리는 화면 중심 보정으로 비켜 둔다) */
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
  /** 데이터 갱신으로 장면을 다시 만들 때 카메라를 그대로 잇기 위한 현재 시점 */
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

  /** 진행 중인 카메라 이동을 지금 자리에서 멈춘다(검색 시작 · 직접 조작 · 시연 중단) */
  cancelCamera() {
    this.camAnim = null;
    this.stopMomentum();
    this.offset = { ...this.offsetT };
    this.applyOffset();
    this.request();
  }
  /** 끌기 · 자동 회전 뒤 남은 감쇠 관성을 지금 자리에서 끝낸다(남은 아주 작은 회전량은 한 번에 적용) */
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
  /** 키보드 회전(라디안) */
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
  /** 지금 그려진 노드 자리(전환 중이면 중간 자리). 다음 장면이 이어 받는다 */
  positions(): Map<string, Vec3> {
    const pos = this.nodeGeo.getAttribute('position') as THREE.BufferAttribute;
    return new Map(this.nodes.map((n, i) => [n.id, [pos.getX(i), pos.getY(i), pos.getZ(i)] as Vec3]));
  }
  /**
   * 갱신 이어 받기: 남아 있는 노드는 이전 자리에서 새 자리로 옮겨 간다(새 노드는 제자리).
   * anchor(선택 노드)가 있으면 카메라를 그 노드의 이동만큼 함께 옮겨, 선택 노드가 화면에서 같은 자리에 머문다.
   * 정지 · 동작 줄이기 · 오프닝 중에는 바로 최종 상태(카메라 이동만 즉시)로 둔다.
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
    // 카메라는 직전 프레임에서 늘어난 만큼만 더한다(사용자가 그 사이 돌리거나 확대해도 함께 쓰인다)
    const step = m.delta.clone().multiplyScalar(e - m.done);
    m.done = e;
    this.camera.position.add(step); this.controls.target.add(step);
    if (t >= 1) { this.morph = null; this.nodeGeo.computeBoundingSphere(); }
    return true;
  }

  /** 화면 좌표(캔버스 기준)의 노드 위치 — 검증 · 툴팁용 */
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

  /* ── 내부: 기하 ── */
  private controlPoint(A: Vec3, B: Vec3, e: SceneEdgeInput): Vec3 {
    const ab = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    const len = ab.length() || 1e-6;
    const axis = ab.clone().divideScalar(len);
    const mid = new THREE.Vector3((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2);
    // 가운데에서 바깥으로 부푼 방향(유기적인 호), 쌍마다 축을 따라 조금 비튼다
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

  /* ── 내부: 카메라 ── */
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
   * 전체 보기 거리: 기본 시선에서 자동 회전 한 바퀴 동안 모든 노드 조립이 상단바 · 도구줄 · 범례를 뺀 안전 영역 안에 들도록.
   * 카메라가 아직 전체 보기에 있으면(사용자 조작 · 초점 이동 전) 지금 방향 그대로 거리만 맞춘다.
   */
  private refit() {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    this.nearDistance = (this.extent * 0.92) / Math.sin(Math.min(vfov, hfov) / 2);
    const ins = this.fitInsets;
    const input = { points: this.nodes.map(n => n.pos), halves: this.half, dir: HOME_DIR, vfov, width: this.width, height: this.height, insets: ins };
    let lift = 0;
    if (ins.corner) {
      // 휴대폰 세로 조작 막대: 막대 사각형 밑에 노드가 깔리지 않는 거리. 위아래에 남는 높이가 있으면 투영 중심을 조금 올려(막대에서 멀어지게)
      // 신경망이 덜 작아지는 자리를 고른다(8px 간격, 남는 높이의 절반까지). 고를 때는 표본 각도를 줄이고 마지막 한 번만 원래대로 잰다
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
    // 아직 그리기 전(카메라 자리 없음)이면 home이 놓는다. 첫 가장자리 · 정지 · 동작 줄이기는 바로, 그 밖(범례 접기 · 창 크기)은 부드럽게 거리만 맞춘다
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
  /** 정적인가: 정지 · 동작 줄이기에서는 카메라 · 화면 중심 · 밝기 전환을 애니메이션 없이 바로 끝낸다 */
  private get still() { return this.paused || this.reduced; }
  /** 진행 중인 움직임을 즉시 최종 상태로 */
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

  /* ── 내부: 오프닝 ── */
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
      // 흩어진 작은 조각이 제자리에 닿으며 제 크기로 자란다
      this.grow[i] = 0.3 + 0.7 * local;
    });
    pos.needsUpdate = true;
    this.writeNodes();
    this.floorMat.uniforms.uFade.value = smooth(0.35, 0.95, t);
    // 뇌 형상 입자: 모였다가 바깥으로 풀리며 사라진다
    this.dustMat.uniforms.uFade.value = smooth(0, 0.18, t) * (1 - smooth(0.42, 0.84, t));
    const dpos = this.dustGeo.getAttribute('position') as THREE.BufferAttribute, base = this.dustGeo.userData.base as Float32Array;
    const k = 1 + 0.35 * smooth(0.4, 1, t);
    for (let i = 0; i < dpos.count; i++) dpos.setXYZ(i, base[i * 3] * k, base[i * 3 + 1] * k, base[i * 3 + 2] * k);
    dpos.needsUpdate = true;
    this.root.rotation.y = -0.45 * (1 - ease(t));
    return true;
  }

  /* ── 내부: 신호 ── */
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

  /* ── 내부: 상태 전환 ── */
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
      // 발광을 당길 거리 = 조립의 바깥 구 반지름(가장 먼 모서리까지)
      lift.setX(i, assemblyRadius(this.half[i], this.nScale[i] * this.grow[i]));
    }
    a.needsUpdate = true; s.needsUpdate = true; g.needsUpdate = true; lift.needsUpdate = true;
    this.writeVoxels();
  }
  /** 노드 상태(밝기 · 크기 · 발광 · 자라남)를 그 노드의 모든 조각에 옮긴다 */
  private writeVoxels() {
    const sc = this.voxGeo.getAttribute('aScale') as THREE.InstancedBufferAttribute, al = this.voxGeo.getAttribute('aAlpha') as THREE.InstancedBufferAttribute;
    const gl = this.voxGeo.getAttribute('aGlow') as THREE.InstancedBufferAttribute;
    for (let p = 0; p < this.pieceNode.length; p++) {
      const i = this.pieceNode[p];
      sc.setX(p, this.nScale[i] * this.grow[i]); al.setX(p, this.nAlpha[i]); gl.setX(p, this.nGlow[i]);
    }
    sc.needsUpdate = true; al.needsUpdate = true; gl.needsUpdate = true;
  }
  /** 노드 자리(오프닝 · 갱신 전환 중이면 중간 자리)가 바뀌었으면 조각 중심을 따라 옮긴다 */
  private syncCenters() {
    const pos = this.nodeGeo.getAttribute('position') as THREE.BufferAttribute;
    if (pos.version === this.centerVersion) return;
    this.centerVersion = pos.version;
    const c = this.voxGeo.getAttribute('aCenter') as THREE.InstancedBufferAttribute;
    for (let p = 0; p < this.pieceNode.length; p++) { const i = this.pieceNode[p]; c.setXYZ(p, pos.getX(i), pos.getY(i), pos.getZ(i)); }
    c.needsUpdate = true;
  }
  /** 선택 테두리: 선택 노드의 조립을 감싸는 정육면체 모서리(움직일 수 있으면 아주 천천히 숨 쉬듯) */
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

  /* ── 내부: 이름표(겹침 제어) ── */
  /** settle: 이 프레임 뒤에 이어 그릴 것이 없다(움직임이 멈춘 마지막 프레임 · 정지 · 동작 줄이기의 한 번 그리기) — 유지 시간 없이 바로 자리를 정한다 */
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
    // 시간 안정화는 계속 움직이는 동안만 쓴다. 움직임이 멈추면 기다리던 이름표 · 버티던 겹침을 그 프레임에 바로 정해, 정지 화면에 타이머나 추가 프레임이 필요 없다.
    // 상태가 바뀐 직후(켬 · 선택 · 가리킴 · 데이터 · 크기)에는 새 이름표만 기다리지 않고, 이미 보이던 이름표의 버팀 · 잠금은 그대로 둔다
    const pace: LabelPace = settle ? 'settle' : this.labelFresh ? 'show' : 'hold';
    this.labelFresh = false;
    const shownNow = new Set<string>();
    const seen = new Set<string>();
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    let used = 0;
    const limit = this.width < 720 ? 22 : 46;
    const ins = this.fitInsets;
    // 라우터 조립의 화면 원(조립 바깥 구 반지름의 투영 + 3px): 다른 이름표는 이 위에 놓지 않는다(회전 중 중앙 조립 위로 이름표가 나타났다 사라지며 번쩍이지 않게)
    const reserve = this.routerReserve(v);
    const hits = (b: { x: number; y: number; w: number; h: number }) => {
      if (!reserve) return false;
      const qx = Math.min(Math.max(reserve.x, b.x), b.x + b.w), qy = Math.min(Math.max(reserve.y, b.y), b.y + b.h);
      return (qx - reserve.x) ** 2 + (qy - reserve.y) ** 2 < reserve.r * reserve.r;
    };
    // 상단바 · 범례 · 도구줄(전체 보기 안전 영역의 가장자리)과 휴대폰 세로 조작 막대 밑에는 놓지 않는다
    const outside = (b: { x: number; y: number; w: number; h: number }) =>
      b.x < Math.max(4, ins.left - 8) || b.x + b.w > this.width - Math.max(4, ins.right - 8) || b.y < ins.top - 8 || b.y + b.h > this.height - Math.max(4, ins.bottom - 8)
      || (!!ins.corner && b.x + b.w > this.width - ins.corner.w - 4 && b.y + b.h > this.height - ins.corner.h - 4);
    for (const c of cands) {
      if (used >= limit) break;
      const n = this.nodes[c.i];
      const isSel = n.id === selected;
      const h = n.kind === 'area' ? 22 : 18;
      // 너비는 실제로 그린 뒤 잰 값(선택 표시는 굵기 · 테두리가 달라 따로 잰다). 재기 전에는 한글을 넓게 잡아 겹침을 막는다
      const key = isSel ? `${n.id}*` : n.id;
      const w = this.labelWidth.get(key) ?? labelEstimate(n.title, n.kind === 'area' ? 14 : 12) + (isSel ? 18 : 14);
      // 좌우: 라우터는 항상 오른쪽(원점이 화면 중심에 투영돼 부동소수점 오차로 판정이 뒤집히던 자리), 나머지는 중심선 데드밴드 안에서 직전 방향 유지
      const geo = n.kind === 'router' ? true : labelSide(c.x, this.width / 2 - this.offset.x, this.labelSide.get(n.id));
      const prevGeo = this.labelSide.get(n.id);
      this.labelSide.set(n.id, geo);
      const prev = this.labelHold.get(n.id);
      // 직전에 놓은 쪽을 먼저(중심선을 넘지 않았으면). 그래서 겹침 때문에 반대쪽에 놓인 이름표도 그 자리가 막히기 전까지 오가지 않는다
      const want = prev && prevGeo === geo ? prev.side : geo;
      const y = c.y - h / 2;
      const at = (side: boolean) => ({ x: side ? c.x + c.r + 4 : c.x - c.r - 4 - w, y, w, h });
      const own = n.kind === 'router';
      const hard = (b: { x: number; y: number; w: number; h: number }) => outside(b) || (!own && hits(b));
      seen.add(n.id);
      let box: { x: number; y: number; w: number; h: number } | null = null;
      if (c.rank <= 1) {
        // 선택 · 가리킴 이름표는 항상 보이되 중앙 라우터 조립은 가리지 않는다: 양쪽 → 같은 쪽에서 조립 바깥으로 민 자리 → 조립 위 · 아래 순으로 놓을 수 있는 곳
        const opts = [at(want), at(!want)];
        if (reserve && !own) {
          for (const side of [want, !want]) opts.push({ x: side ? reserve.x + reserve.r + 4 : reserve.x - reserve.r - 4 - w, y, w, h });
          opts.push({ x: c.x - w / 2, y: reserve.y - reserve.r - 4 - h, w, h }, { x: c.x - w / 2, y: reserve.y + reserve.r + 4, w, h });
        }
        box = opts.find(b => !hard(b)) ?? opts[0];
        const side = box.x + w / 2 >= c.x;
        this.labelHold.set(n.id, { shown: true, side, movedAt: prev && prev.side === side && Number.isFinite(prev.movedAt) ? prev.movedAt : now, clashAt: 0, freeAt: 0 });
      } else {
        // 나머지는 시간 안정화: 겹침이 잠깐이면 그 자리에서 버티고, 새로 보이거나 다시 보일 때는 빈자리가 유지 시간 동안 이어져야 한다
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
        el.textContent = n.title;
        el.className = `scene-label scene-label--${n.kind}`;
      }
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
    // 이번 프레임 후보가 아니었던 이름표(숨김 · 삭제 · 비공개 · 출처 전환 · 화면 밖 · 개수 상한)는 유지 시간 없이 바로 지운다
    for (const id of this.labelHold.keys()) if (!seen.has(id)) this.labelHold.delete(id);
    for (const id of this.labelSide.keys()) if (!seen.has(id)) this.labelSide.delete(id);
  }

  /** 라우터 조립의 화면 원(px). 라우터가 보이지 않거나 카메라 뒤면 null */
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

  /* ── 내부: 입력(레이캐스팅 선택) ── */
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

  /* ── 그리기 고리 ── */
  request() {
    if (this.raf || this.inFrame || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.raf = 0;
    if (document.hidden) return;
    this.inFrame = true;
    // 프레임 간격 상한 0.1초: 느린 기기(10fps 이상)에서도 전환 · 카메라 이동이 실제 시간대로 끝나고, 멈췄다 돌아올 때만 튀지 않게 자른다
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
    // 자동 회전: 허용되고 쉬는 시간이 지났으면 목표 속도로 천천히 올리고, 아니면 빨리 내린다(정지 · 동작 줄이기는 즉시 0)
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
    // 회전 각도는 실제 경과 시간대로(느린 프레임에서도 한 바퀴 시간이 같게). 숨김에서 돌아온 첫 프레임은 request()가 시각을 새로 잡는다
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

/** WebGL2를 쓸 수 있는지(대체 화면 판단) */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}
