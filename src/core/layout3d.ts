// 3D 자유형 신경망 배치(순수 계산 — 브라우저 · Three.js에 의존하지 않아 Node 테스트 · Web Worker에서 쓸 수 있다).
// 구 표면 방향 배치와 Barnes–Hut 반발 · 종류별 용수철을 쓰는 결정적 레이아웃이다.
// 설계 참고: n1ghtmare-dev/obsidian-cosmograph(MIT). 계산부는 브라우저 전역에 의존하지 않는다.
//
// 자리는 그래프(분류 소속 · 관계)만으로 한 번 정한다. 펼침 · 필터 · 연결 보기 · 선택은 자리를 바꾸지 않는다.
// 공유 자료는 주 소속(분류 소속) 가지 안에 자리 하나만 갖고, 다른 색인 · MOC 연결은 아주 약한 용수철로만 당긴다.
import type { BrainGraph } from './graph';
import { pairKey } from './graph';

export type Vec3 = [number, number, number];

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
const perpendicular = (a: Vec3) => norm(cross(a, Math.abs(a[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0]));
function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const d = clamp(dot(a, b), -1, 1);
  if (d > 0.9995) return norm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  if (d < -0.9995) { const p = perpendicular(a); return t < 0.5 ? slerp(a, p, t * 2) : slerp(p, b, t * 2 - 1); }
  const w = Math.acos(d), s = Math.sin(w), k0 = Math.sin((1 - t) * w) / s, k1 = Math.sin(t * w) / s;
  return [a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1];
}
function around(center: Vec3, radius: number, angle: number): Vec3 {
  const t1 = perpendicular(center), t2 = cross(center, t1);
  const c = Math.cos(radius), s = Math.sin(radius), ca = Math.cos(angle), sa = Math.sin(angle);
  return norm([0, 1, 2].map(i => center[i] * c + (t1[i] * ca + t2[i] * sa) * s) as Vec3);
}
export function fibonacciSphere(count: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count, r = Math.sqrt(1 - y * y), a = i * GOLDEN;
    out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return out;
}

// 영역 기준 방향: 첫 영역은 왼쪽 반구, 둘째는 오른쪽 반구(뇌의 좌우), 그다음은 남은 곳에서 가장 먼 방향
const AREA_DIRS: Vec3[] = [[-0.9, 0.14, 0.4], [0.9, 0.06, -0.42], [0.08, -0.86, 0.5], [-0.1, 0.74, -0.66]];

/** 영역 · MOC 기준 방향과 문서별 출발 방향(구 표면). 큰 하위 트리일수록 넓은 자리를 갖는다 */
export function directions(g: BrainGraph): { dirs: Map<string, Vec3>; anchors: Map<string, Vec3> } {
  const anchors = new Map<string, Vec3>();
  const used: Vec3[] = [];
  const spare = fibonacciSphere(64);
  g.areas.forEach((area, i) => {
    const dir = i < AREA_DIRS.length ? norm(AREA_DIRS[i])
      : spare.reduce((best, c) => { const near = Math.max(...used.map(u => dot(u, c))); return near < best.near ? { c, near } : best; }, { c: spare[0], near: Infinity }).c;
    anchors.set(area.id, dir); used.push(dir);
  });
  // 주제 MOC: 두 반구 사이의 가운데 면(x ≈ 0)에 고리 모양으로 — 양쪽 영역의 자료를 잇는 다리 자리
  g.mocs.forEach((moc, i) => {
    const a = Math.PI / 2 + (i * TAU) / Math.max(g.mocs.length, 1) + 0.35;
    anchors.set(moc.id, norm([(i % 2 ? 1 : -1) * 0.12, Math.cos(a), Math.sin(a)]));
  });

  const area = new Map<string, number>();
  const areaOf = (id: string): number => {
    const known = area.get(id);
    if (known !== undefined) return known;
    let a = 1;
    for (const c of g.children.get(id) ?? []) if (c.kind !== 'moc') a += areaOf(c.id);
    area.set(id, a);
    return a;
  };
  const count = Math.max(g.docs.length, 1);
  const step = clamp(Math.sqrt(2.4 / count), 0.03, 0.17);
  const dirs = new Map<string, Vec3>();
  const spread = (ids: string[], center: Vec3, phase: number, used0: number) => {
    let usedArea = used0;
    ids.forEach((id, k) => {
      const a = areaOf(id);
      const inner = step * Math.sqrt(usedArea);
      usedArea += a;
      let r = step * Math.sqrt(usedArea - a / 2 + 0.6);
      if (a > 8) r = Math.min(Math.max(r, inner + step * Math.sqrt(a) * 0.7), 1.5);
      const dir = around(center, r, phase + k * GOLDEN);
      dirs.set(id, dir);
      spread((g.children.get(id) ?? []).map(c => c.id), dir, hash(id) * TAU, 0);
    });
  };
  for (const a of g.areas) {
    const anchor = anchors.get(a.id)!;
    dirs.set(a.id, anchor);
    const kids = [...(g.children.get(a.id) ?? [])].sort((x, y) => areaOf(y.id) - areaOf(x.id) || x.title.localeCompare(y.title, 'ko'));
    spread(kids.map(k => k.id), anchor, hash(a.id) * TAU, 1);
  }
  for (const moc of g.mocs) dirs.set(moc.id, anchors.get(moc.id)!);
  return { dirs, anchors };
}

interface Point { dir: Vec3; depth: number; group: string; hub: boolean; weight: number; areaRoot?: boolean }
interface Link { a: number; b: number; kind: 'primary' | 'link' }

// 길이는 모두 간격 s(단위 공을 N개로 나눈 간격) 배수. 원본 NEURAL 값(실제 사본 1,313개에서 고른 값)에서
// 송이(색인 → 자료) 길이와 반발만 키웠다: 홍보 화면에서 개별 자료가 점으로 읽히고 가지 사이가 덜 비게
const NEURAL = { leaf: 3.2, branch: [2.2, 0.5, 0.5], trunk: 6, link: 4, k: { leaf: 0.22, branch: 0.3, trunk: 0.15, link: 0.01 },
  charge: 0.24, near: 0.6, theta: 0.9, gravity: 0.004, squeeze: 0.45, hold: 0.004, shell: [2, 3.2], iterations: 300, keep: 0.97, soft: 0.25 };

/** 신경망 배치: 가지 · 송이로 펼친다. links의 -1은 원점에 고정된 가운데 핵(라우터) */
export function neuralLayout(points: Point[], links: Link[], anchors: Map<string, Vec3>, iterations = NEURAL.iterations): Vec3[] {
  const N = points.length;
  if (!N) return [];
  const P = new Float64Array(N * 3), V = new Float64Array(N * 3), F = new Float64Array(N * 3), D = new Float64Array(N * 3);
  const s = Math.cbrt(4.19 / N), vmax = 0.6 * s, q = NEURAL.charge * s * s, near2 = (NEURAL.near * s) ** 2;
  points.forEach((p, i) => {
    const anchor = anchors.get(p.group);
    const d = anchor ? slerp(anchor, p.dir, NEURAL.squeeze) : p.dir;
    const r = s * (NEURAL.shell[0] + NEURAL.shell[1] * p.depth) * (0.92 + 0.16 * hash(`${i}:${p.depth}`));
    D[i * 3] = d[0]; D[i * 3 + 1] = d[1]; D[i * 3 + 2] = d[2];
    P[i * 3] = d[0] * r; P[i * 3 + 1] = d[1] * r; P[i * 3 + 2] = d[2] * r;
  });
  const deg = new Float64Array(N);
  for (const l of links) { if (l.a >= 0) deg[l.a]++; if (l.b >= 0) deg[l.b]++; }
  const springs = links.map(l => {
    const lo = Math.max(1, Math.min(l.a >= 0 ? deg[l.a] : 1, l.b >= 0 ? deg[l.b] : 1));
    if (l.a < 0 || l.b < 0) return { a: l.a, b: l.b, rest: NEURAL.trunk * s, k: NEURAL.k.trunk };
    if (l.kind === 'link') return { a: l.a, b: l.b, rest: NEURAL.link * s, k: NEURAL.k.link / lo };
    const child = points[l.b];
    return child.hub
      ? { a: l.a, b: l.b, rest: (NEURAL.branch[0] + NEURAL.branch[1] * Math.pow(child.weight || 0, NEURAL.branch[2])) * s, k: NEURAL.k.branch / lo }
      : { a: l.a, b: l.b, rest: NEURAL.leaf * s, k: NEURAL.k.leaf };
  });
  const BH_LEAF = 6, BH_DEPTH = 18, theta2 = NEURAL.theta * NEURAL.theta;
  const order = new Int32Array(N), tmp = new Int32Array(N), oct = new Uint8Array(N), stack = new Int32Array(8 * (BH_DEPTH + 2) + 16);
  let tCnt: number[] = [], tMx: number[] = [], tMy: number[] = [], tMz: number[] = [], tSize: number[] = [], tLo: number[] = [], tHi: number[] = [], tKid: number[] = [], tKids: number[] = [];
  function build(lo: number, hi: number, cx: number, cy: number, cz: number, half: number, depth: number): number {
    const id = tCnt.length;
    let sx = 0, sy = 0, sz = 0;
    for (let k = lo; k < hi; k++) { const i = order[k] * 3; sx += P[i]; sy += P[i + 1]; sz += P[i + 2]; }
    const n = hi - lo;
    tCnt.push(n); tMx.push(sx / n); tMy.push(sy / n); tMz.push(sz / n); tSize.push(half * 2); tLo.push(lo); tHi.push(hi); tKid.push(-1);
    if (n <= BH_LEAF || depth >= BH_DEPTH) return id;
    const counts = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = lo; k < hi; k++) {
      const i = order[k] * 3, o = (P[i] > cx ? 1 : 0) | (P[i + 1] > cy ? 2 : 0) | (P[i + 2] > cz ? 4 : 0);
      oct[k] = o; counts[o]++;
    }
    const at = [lo];
    for (let o = 0; o < 7; o++) at.push(at[o] + counts[o]);
    const put = at.slice();
    for (let k = lo; k < hi; k++) tmp[put[oct[k]]++] = order[k];
    for (let k = lo; k < hi; k++) order[k] = tmp[k];
    const kids: number[] = [], h2 = half / 2;
    for (let o = 0; o < 8; o++) {
      if (!counts[o]) continue;
      kids.push(build(at[o], at[o] + counts[o], cx + (o & 1 ? h2 : -h2), cy + (o & 2 ? h2 : -h2), cz + (o & 4 ? h2 : -h2), h2, depth + 1));
    }
    tKid[id] = tKids.length;
    tKids.push(kids.length, ...kids);
    return id;
  }
  for (let it = 0; it < iterations; it++) {
    const heat = 1 - it / iterations;
    let radiusSquared = 0;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < N; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
      const r = Math.hypot(x, y, z);
      radiusSquared += r * r;
      F[i * 3] = NEURAL.hold * (D[i * 3] * r - x) - NEURAL.gravity * x;
      F[i * 3 + 1] = NEURAL.hold * (D[i * 3 + 1] * r - y) - NEURAL.gravity * y;
      F[i * 3 + 2] = NEURAL.hold * (D[i * 3 + 2] * r - z) - NEURAL.gravity * z;
      order[i] = i;
    }
    tCnt = []; tMx = []; tMy = []; tMz = []; tSize = []; tLo = []; tHi = []; tKid = []; tKids = [];
    build(0, N, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, y1 - y0, z1 - z0, 1e-6) / 2 + 1e-9, 0);
    for (let i = 0; i < N; i++) {
      const xi = P[i * 3], yi = P[i * 3 + 1], zi = P[i * 3 + 2];
      let fx = 0, fy = 0, fz = 0, sp = 0;
      stack[sp++] = 0;
      while (sp) {
        const nd = stack[--sp];
        const dx = xi - tMx[nd], dy = yi - tMy[nd], dz = zi - tMz[nd], d2 = dx * dx + dy * dy + dz * dz;
        if (tKid[nd] < 0) {
          for (let k = tLo[nd], end = tHi[nd]; k < end; k++) {
            const j = order[k];
            if (j === i) continue;
            const ex = xi - P[j * 3], ey = yi - P[j * 3 + 1], ez = zi - P[j * 3 + 2];
            const f = q / Math.max(near2, ex * ex + ey * ey + ez * ez);
            fx += ex * f; fy += ey * f; fz += ez * f;
          }
        } else if (tSize[nd] * tSize[nd] < theta2 * d2) {
          const f = (q * tCnt[nd]) / Math.max(near2, d2);
          fx += dx * f; fy += dy * f; fz += dz * f;
        } else {
          for (let c = tKid[nd] + 1, end = tKid[nd] + 1 + tKids[tKid[nd]]; c < end; c++) stack[sp++] = tKids[c];
        }
      }
      F[i * 3] += fx; F[i * 3 + 1] += fy; F[i * 3 + 2] += fz;
    }
    for (const sp of springs) {
      const a = sp.a * 3, b = sp.b * 3;
      const dx = (sp.b < 0 ? 0 : P[b]) - (sp.a < 0 ? 0 : P[a]), dy = (sp.b < 0 ? 0 : P[b + 1]) - (sp.a < 0 ? 0 : P[a + 1]), dz = (sp.b < 0 ? 0 : P[b + 2]) - (sp.a < 0 ? 0 : P[a + 2]);
      const d = Math.hypot(dx, dy, dz) || 1e-6, f = (sp.k * (d - sp.rest)) / d;
      if (sp.a >= 0) { F[a] += dx * f; F[a + 1] += dy * f; F[a + 2] += dz * f; }
      if (sp.b >= 0) { F[b] -= dx * f; F[b + 1] -= dy * f; F[b + 2] -= dz * f; }
    }
    const lim = vmax * (0.15 + 0.85 * heat);
    for (let i = 0; i < N * 3; i += 3) {
      let vx = (V[i] + F[i]) * 0.6, vy = (V[i + 1] + F[i + 1]) * 0.6, vz = (V[i + 2] + F[i + 2]) * 0.6;
      const m = Math.hypot(vx, vy, vz);
      if (m > lim) { const k = lim / m; vx *= k; vy *= k; vz *= k; }
      V[i] = vx; V[i + 1] = vy; V[i + 2] = vz;
      P[i] += vx; P[i + 1] += vy; P[i + 2] += vz;
      // 영역 핵은 매 반복 기준 광선 위에서만 이동해 하위 군집도 같은 경계를 보며 수렴한다.
      if (points[i / 3].areaRoot) {
        const radius = Math.max(NEURAL.trunk * s * 0.5, Math.sqrt(radiusSquared / N) * 0.5, Math.hypot(P[i], P[i + 1], P[i + 2]));
        const speed = V[i] * D[i] + V[i + 1] * D[i + 1] + V[i + 2] * D[i + 2];
        for (let axis = 0; axis < 3; axis++) { P[i + axis] = D[i + axis] * radius; V[i + axis] = D[i + axis] * speed; }
      }
    }
  }
  const radii = points.map((_, i) => Math.hypot(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
  const q97 = Float64Array.from(radii).sort()[Math.min(N - 1, Math.floor(N * NEURAL.keep))] || 1;
  return radii.map((r, i) => {
    const u = r / q97, w = u > 1 ? 1 + NEURAL.soft * Math.tanh((u - 1) / NEURAL.soft) : u, k = r > 0 ? w / r : 0;
    return [P[i * 3] * k, P[i * 3 + 1] * k, P[i * 3 + 2] * k] as Vec3;
  });
}

/** 그래프 전체의 고정 자리. 라우터는 원점 */
export function layoutGraph(g: BrainGraph, iterations?: number): Map<string, Vec3> {
  const { dirs, anchors } = directions(g);
  const planet = g.docs.filter(d => d.id !== g.routerId);
  const at = new Map(planet.map((d, i) => [d.id, i]));
  const end = (id: string) => (id === g.routerId ? -1 : at.get(id));
  // 하위 자료 수(가지 길이)
  const weight = new Map<string, number>();
  const count = (id: string): number => {
    const known = weight.get(id);
    if (known !== undefined) return known;
    const doc = g.byId.get(id)!;
    const c = doc.kind === 'material' ? 1 : (g.children.get(id) ?? []).reduce((sum, k) => sum + count(k.id), 0);
    weight.set(id, c);
    return c;
  };
  const points: Point[] = planet.map(d => ({
    dir: dirs.get(d.id) ?? [0, 1, 0], depth: g.depth.get(d.id) || 1,
    group: d.kind === 'moc' ? d.id : g.areaOf.get(d.id) ?? d.id,
    hub: d.kind !== 'material', weight: count(d.id), areaRoot: d.kind === 'area'
  }));
  const links: Link[] = [];
  const seen = new Set<string>();
  for (const d of planet) {
    const p = d.parent === null ? undefined : end(d.parent);
    if (p === undefined) continue;
    links.push({ a: p, b: at.get(d.id)!, kind: 'primary' });
    seen.add(pairKey(d.parent!, d.id));
  }
  for (const r of g.relations) {
    const key = pairKey(r.source, r.target);
    if (seen.has(key)) continue;
    const a = end(r.source), b = end(r.target);
    if (a === undefined || b === undefined || a === b) continue;
    seen.add(key);
    links.push({ a, b, kind: 'link' });
  }
  const xyz = neuralLayout(points, links, anchors, iterations);
  const out = new Map<string, Vec3>();
  if (g.routerId) out.set(g.routerId, [0, 0, 0]);
  planet.forEach((d, i) => out.set(d.id, xyz[i]));
  return out;
}

/** 오프닝용 뇌 형상 좌표(장식 · 출발점 전용). 실제 그래프 자리와 분리되어 연결 관계를 왜곡하지 않는다 */
export function brainShape(count: number, seed = 'brain'): Vec3[] {
  const out: Vec3[] = [];
  const half = Math.ceil(count / 2);
  const shell = fibonacciSphere(half);
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const u = shell[Math.floor(i / 2) % half];
    const h = hash(`${seed}:${i}`);
    // 반구 하나: 좌우로 납작하고 앞뒤로 긴 타원체, 안쪽(가운데) 면은 평평하게
    let x = u[0] * 0.36, y = u[1] * 0.56, z = u[2] * 0.82;
    if (x * side < 0) x *= 0.25;
    if (y < -0.25) y = -0.25 + (y + 0.25) * 0.55;
    // 주름(이랑): 표면을 조금 들고 내린다
    const gyri = 1 + 0.07 * Math.sin(u[1] * 11 + u[2] * 7 + side) * Math.sin(u[2] * 13 - u[0] * 5);
    const depth = 0.82 + 0.18 * Math.sqrt(h);
    out.push([(x * gyri * depth + side * 0.34) * 1.15, y * gyri * depth * 1.15 + 0.05, z * gyri * depth * 1.15]);
  }
  return out;
}
