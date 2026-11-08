import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGraph } from '../src/core/graph';
import { layoutGraph } from '../src/core/layout3d';
import { syntheticDataset } from '../src/data/synthetic';
import { demoDataset } from '../src/data/demo';
import { CELL, SHAPE_CELLS, assembly, snapToGrid } from '../src/render/voxel';
import { fitDistance } from '../src/render/fit';
import { voxelFaces } from '../src/ui/voxel-faces';
import type { NodeKind } from '../src/core/types';

const KINDS: NodeKind[] = ['router', 'area', 'subindex', 'guide', 'moc', 'material'];

test('복셀 조립: 종류마다 조각 수 · 형태가 다르고(범례와 같은 칸 좌표), 본문 없는 파일만 속이 빈다', () => {
  const counts = KINDS.map(k => assembly(k).pieces.length);
  assert.deepEqual(counts, [31, 8, 4, 6, 7, 1]);
  assert.equal(new Set(KINDS.map(k => JSON.stringify(SHAPE_CELLS[k]))).size, KINDS.length);
  for (const k of KINDS) {
    const a = assembly(k);
    assert.equal(a.hollow, false, k);
    assert.ok(a.half > 0 && a.half < CELL * 4, `${k}: 반 너비 ${a.half}`);
    // 범례 그림은 칸마다 보이는 면 세 개
    assert.equal(voxelFaces(k).length, SHAPE_CELLS[k].length * 3, k);
  }
  assert.equal(assembly('material', 'pdf').hollow, true);
  assert.equal(assembly('material', 'image').hollow, true);
  // 안내 문서는 자료보다 크다
  for (const k of KINDS.filter(k => k !== 'material')) assert.ok(assembly(k).half > assembly('material').half, k);
});

test('복셀 격자: 5,000개 데모의 모든 노드가 서로 다른 격자 칸에 놓이고, 거의 모두 원래 배치에서 칸 두 개 안쪽만 움직이며 결정적이다', () => {
  const g = buildGraph(demoDataset);
  const pos = layoutGraph(g);
  const nodes = g.docs.map(d => ({ kind: d.kind, pos: pos.get(d.id)! }));
  const a = snapToGrid(nodes), b = snapToGrid(nodes);
  assert.deepEqual(a, b);
  assert.equal(a.length, 5000);
  assert.equal(new Set(a.map(p => p.map(v => Math.round(v / CELL)).join())).size, 5000);
  let far = 0;
  for (let i = 0; i < a.length; i++) {
    for (const v of a[i]) assert.ok(Math.abs(v / CELL - Math.round(v / CELL)) < 1e-6, '격자 위');
    const moved = Math.hypot(a[i][0] - nodes[i].pos[0], a[i][1] - nodes[i].pos[1], a[i][2] - nodes[i].pos[2]);
    assert.ok(moved < CELL * 3.5, `${g.docs[i].path}: ${moved}`);
    if (moved >= CELL * 2) far++;
  }
  // 5배 촘촘해진 군집 가운데 일부만 빈칸을 찾아 조금 더 움직인다(0.1% 이하)
  assert.ok(far <= a.length * 0.001, `칸 두 개 넘게 움직인 노드 ${far}`);
  // 조각 수는 노드 수와 다르다(개수는 노드 = 문서 기준)
  const pieces = g.docs.reduce((t, d) => t + assembly(d.kind, d.format).pieces.length, 0);
  assert.ok(pieces > g.docs.length);
});

test('치수: 자료 큐브는 이전(0.018)보다 15~20% 작고, 같은 색인 안 이웃 자료 간격(격자 칸)은 이전(0.024)보다 10~15% 넓다 — 안내 문서 조립 크기는 그대로', () => {
  const cube = assembly('material').pieces[0].size;
  assert.ok(cube / 0.018 >= 0.8 && cube / 0.018 <= 0.85, `큐브 ${cube}`);
  assert.ok(CELL / 0.024 >= 1.1 && CELL / 0.024 <= 1.15, `칸 ${CELL}`);
  assert.equal(assembly('subindex').pieces[0].size, 0.016 * 0.88);
  assert.equal(assembly('area').pieces[0].size, 0.023 * 0.9);
  // 실제 배치에서 같은 색인 자료끼리 가장 가까운 이웃 거리의 가운데 값 = 한 칸(이전 배치 0.024의 1.125배)
  const g = buildGraph(demoDataset);
  const pos = layoutGraph(g);
  const snapped = snapToGrid(g.docs.map(d => ({ kind: d.kind, pos: pos.get(d.id)! })));
  const at = new Map(g.docs.map((d, i) => [d.id, snapped[i]]));
  const nn: number[] = [];
  for (const kids of g.children.values()) {
    const mats = kids.filter(k => k.kind === 'material').map(k => at.get(k.id)!);
    for (const p of mats) {
      let best = Infinity;
      for (const q of mats) if (q !== p) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      if (Number.isFinite(best)) nn.push(best);
    }
  }
  nn.sort((x, y) => x - y);
  const median = nn[Math.floor(nn.length / 2)];
  assert.ok(median >= 0.024 * 1.1 && median <= 0.024 * 1.15, `이웃 간격 ${median}`);
  // 큐브 사이 틈(간격 − 큐브)은 이전(0.024 − 0.018 = 0.006)의 두 배 가까이
  assert.ok(median - cube >= 0.006 * 1.8, `틈 ${median - cube}`);
});

test('복셀 격자: 안내 문서 조립 둘레에는 다른 노드가 들어오지 않는다(조각이 겹치지 않음) — 합성 3천 노드에서도', () => {
  for (const ds of [demoDataset, syntheticDataset(3000)]) {
    const g = buildGraph(ds);
    const pos = layoutGraph(g, 60);
    const nodes = g.docs.map(d => ({ kind: d.kind, pos: pos.get(d.id)! }));
    const snapped = snapToGrid(nodes);
    const hubs = g.docs.map((d, i) => ({ d, i })).filter(x => x.d.kind !== 'material');
    for (const { d, i } of hubs) {
      const reach = assembly(d.kind).half;
      for (let j = 0; j < snapped.length; j++) {
        if (j === i) continue;
        const gap = Math.max(...[0, 1, 2].map(k => Math.abs(snapped[i][k] - snapped[j][k])));
        assert.ok(gap + 1e-9 >= Math.min(reach + assembly(g.docs[j].kind).half, CELL), `${d.path} ↔ ${g.docs[j].path}`);
      }
    }
  }
});

test('전체 보기 거리: 5,000개 데모가 어느 회전 각도에서도 상단바 · 범례 · 도구줄을 뺀 안전 영역 안에 들고, 필요 이상 멀지 않다', () => {
  const g = buildGraph(demoDataset);
  const pos = layoutGraph(g);
  const points = snapToGrid(g.docs.map(d => ({ kind: d.kind, pos: pos.get(d.id)! })));
  const halves = g.docs.map(d => assembly(d.kind, d.format).half);
  const dir: [number, number, number] = [0.12, 0.42, 1];
  const vfov = (40 * Math.PI) / 180;
  // 검사용 투영(구현과 별개로 카메라 행렬을 직접 계산)
  const worst = (w: number, h: number, ins: { top: number; right: number; bottom: number; left: number }, d: number) => {
    const L = Math.hypot(...dir), c = dir.map(v => (v / L) * d);
    const fz = c.map(v => v / d), rx = [fz[2], 0, -fz[0]].map((v, _, a) => v / Math.hypot(a[0], a[2]));
    const uy = [fz[1] * rx[2] - fz[2] * rx[1], fz[2] * rx[0] - fz[0] * rx[2], fz[0] * rx[1] - fz[1] * rx[0]];
    const f = 1 / Math.tan(vfov / 2);
    let out = 0;
    for (let k = 0; k < 997; k++) {
      const a = (k / 997) * Math.PI * 2;
      for (let i = 0; i < points.length; i++) {
        const [x, y, z] = points[i];
        const p = [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)].map((v, j) => v - c[j]);
        const depth = -(p[0] * fz[0] + p[1] * fz[1] + p[2] * fz[2]);
        const sx = ((p[0] * rx[0] + p[1] * rx[1] + p[2] * rx[2]) * f) / (depth * (w / h));
        const sy = ((p[0] * uy[0] + p[1] * uy[1] + p[2] * uy[2]) * f) / depth;
        // 치우침: 안전 영역 가운데가 투영 중심 → 화면 px
        const px = (ins.left + (w - ins.left - ins.right) / 2) + sx * (w / 2);
        const py = (ins.top + (h - ins.top - ins.bottom) / 2) - sy * (h / 2);
        if (px < ins.left || px > w - ins.right || py < ins.top || py > h - ins.bottom) out++;
      }
    }
    return out;
  };
  for (const [w, h, ins] of [
    [1440, 900, { top: 79, right: 24, bottom: 64, left: 332 }],
    [1920, 1080, { top: 79, right: 24, bottom: 64, left: 332 }],
    [360, 740, { top: 120, right: 0, bottom: 64, left: 0 }],
    [844, 390, { top: 79, right: 0, bottom: 64, left: 0 }]
  ] as const) {
    const d = fitDistance({ points, halves, dir, vfov, width: w, height: h, insets: ins });
    assert.equal(worst(w, h, ins, d), 0, `${w}×${h}: 화면 밖 노드 중심`);
    assert.ok(worst(w, h, ins, d * 0.85) > 0, `${w}×${h}: 지나치게 멀다(${d.toFixed(2)})`);
  }
});

test('전체 보기 거리: 휴대폰 세로 조작 막대(오른쪽 아래 구석)가 있으면 한 바퀴 내내 노드 조립이 막대 사각형에 닿지 않고, 투영 중심을 올려도 안전 영역 안이다', () => {
  const g = buildGraph(demoDataset);
  const pos = layoutGraph(g);
  const points = snapToGrid(g.docs.map(d => ({ kind: d.kind, pos: pos.get(d.id)! })));
  const halves = g.docs.map(d => assembly(d.kind, d.format).half);
  const dir: [number, number, number] = [0.12, 0.42, 1];
  const vfov = (40 * Math.PI) / 180;
  const [w, h] = [360, 740];
  const ins = { top: 120, right: 0, bottom: 64, left: 0 };
  const corner = { w: 58, h: 287 }; // 막대 46×275 + 오른쪽 · 아래 12px
  const base = { x: (ins.right - ins.left) / 2, y: (ins.bottom - ins.top) / 2 };
  // 검사용 투영(구현과 별개로 카메라 행렬을 직접 계산). 노드 조립은 화면에서 반 너비 × 1.4 원으로 본다
  const check = (d: number, lift: number) => {
    const L = Math.hypot(...dir), c = dir.map(v => (v / L) * d);
    const fz = c.map(v => v / d), rx = [fz[2], 0, -fz[0]].map((v, _, a) => v / Math.hypot(a[0], a[2]));
    const uy = [fz[1] * rx[2] - fz[2] * rx[1], fz[2] * rx[0] - fz[0] * rx[2], fz[0] * rx[1] - fz[1] * rx[0]];
    const f = 1 / Math.tan(vfov / 2);
    const cx0 = w / 2 - base.x, cy0 = h / 2 - (base.y + lift);
    let inDock = 0, out = 0;
    for (let k = 0; k < 997; k++) {
      const a = (k / 997) * Math.PI * 2;
      for (let i = 0; i < points.length; i++) {
        const [x, y, z] = points[i];
        const p = [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)].map((v, j) => v - c[j]);
        const depth = -(p[0] * fz[0] + p[1] * fz[1] + p[2] * fz[2]);
        const px = cx0 + (((p[0] * rx[0] + p[1] * rx[1] + p[2] * rx[2]) * f) / (depth * (w / h))) * (w / 2);
        const py = cy0 - (((p[0] * uy[0] + p[1] * uy[1] + p[2] * uy[2]) * f) / depth) * (h / 2);
        const rpx = (halves[i] * 1.4 * f / depth) * (h / 2);
        if (px + rpx > w - corner.w && py + rpx > h - corner.h) inDock++;
        if (px < ins.left || px > w - ins.right || py < ins.top || py > h - ins.bottom) out++;
      }
    }
    return { inDock, out };
  };
  const plain = fitDistance({ points, halves, dir, vfov, width: w, height: h, insets: ins });
  // 막대를 빼지 않으면(이전) 막대 밑에 깔리는 각도가 있다
  assert.ok(check(plain, 0).inDock > 0, '막대를 빼지 않은 거리에서 막대 밑 노드가 없다(시험 전제 확인)');
  for (const lift of [0, 48]) {
    const d = fitDistance({ points, halves, dir, vfov, width: w, height: h, insets: { ...ins, top: ins.top + lift, bottom: ins.bottom + lift }, corner, offset: { x: base.x, y: base.y + lift } });
    const r = check(d, lift);
    assert.equal(r.inDock, 0, `중심 올림 ${lift}px: 막대 밑 노드 조립`);
    assert.equal(r.out, 0, `중심 올림 ${lift}px: 안전 영역 밖 노드 중심`);
    assert.ok(d >= plain - 1e-9, '막대를 빼면 같거나 멀어진다');
  }
});
