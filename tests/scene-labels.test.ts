import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { LABEL_HOLD_MS, LABEL_SIDE_BAND, LABEL_SIDE_LOCK_MS, holdLabel, labelSide, type LabelBlock, type LabelHold } from '../src/core/label-side';
import { assemblyRadius, liftAlongRay } from '../src/render/glow-lift';
import { assembly } from '../src/render/voxel';

test('이름표 좌우: 중심선의 부동소수점 흔들림(873.9999… ↔ 874.0000…)에는 방향이 바뀌지 않는다', () => {
  const mid = 874;
  let side = labelSide(873.9999999999999, mid, undefined);
  let flips = 0;
  for (let f = 0; f < 400; f++) {
    const x = f % 2 ? 874.0000000000001 : 873.9999999999999;
    const next = labelSide(x, mid, side);
    if (next !== side) flips++;
    side = next;
  }
  assert.equal(flips, 0);
});

test('이름표 좌우: 데드밴드 안 흔들림은 유지, 밴드를 넘어 지나가면 한 번만 바뀐다', () => {
  const mid = 500;
  let side = labelSide(mid + 40, mid, undefined);
  assert.equal(side, true);
  // 밴드 안에서 ±(밴드-1)px 왕복: 그대로
  for (let f = 0; f < 200; f++) side = labelSide(mid + (f % 2 ? 1 : -1) * (LABEL_SIDE_BAND - 1), mid, side);
  assert.equal(side, true);
  // 오른쪽 → 왼쪽으로 1px씩 지나가며 바뀌는 횟수
  let flips = 0;
  for (let x = mid + 60; x >= mid - 60; x--) { const n = labelSide(x, mid, side); if (n !== side) flips++; side = n; }
  assert.equal(flips, 1);
  assert.equal(side, false);
  // 처음 보는 노드는 중심선 기준
  assert.equal(labelSide(mid - 0.5, mid, undefined), false);
  assert.equal(labelSide(mid, mid, undefined), true);
});

test('발광 깊이 보정: 카메라→노드 광선 위로 옮겨 화면 위치가 그대로이고(시점 이동 · 회전 · 확대 · 화면 중심 보정 포함) 더 가까워진다', () => {
  const cam = new THREE.PerspectiveCamera(40, 1440 / 900, 0.02, 50);
  let worst = 0;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let c = 0; c < 40; c++) {
    const dist = 0.8 + rnd() * 4, theta = rnd() * Math.PI * 2, phi = 0.2 + rnd() * 2.7;
    cam.position.setFromSphericalCoords(dist, phi, theta);
    cam.lookAt(0, 0, 0);
    // 상세 패널 · 범례 자리만큼 화면 중심을 비켜 둔 경우(setViewOffset)도 포함
    if (c % 2) cam.setViewOffset(1440, 900, (rnd() - 0.5) * 300, (rnd() - 0.5) * 120, 1440, 900); else cam.clearViewOffset();
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    for (let k = 0; k < 50; k++) {
      const p = new THREE.Vector3((rnd() - 0.5) * 2, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2);
      const eye = p.clone().applyMatrix4(cam.matrixWorldInverse);
      if (-eye.z < 0.1) continue;
      const kind = (['router', 'area', 'moc', 'subindex', 'guide', 'material'] as const)[k % 6];
      const lift = assemblyRadius(assembly(kind).half, 1 + rnd() * 0.6);
      const lifted = new THREE.Vector3(...liftAlongRay([eye.x, eye.y, eye.z], lift));
      const a = eye.clone().applyMatrix4(cam.projectionMatrix), b = lifted.clone().applyMatrix4(cam.projectionMatrix);
      worst = Math.max(worst, Math.abs(a.x - b.x) * 720, Math.abs(a.y - b.y) * 450);
      assert.ok(lifted.length() < eye.length() || lifted.length() <= 0.0300001);
    }
  }
  assert.ok(worst < 1e-6, `화면 차이 ${worst}px`);
});

// 시간 안정화: 프레임마다 holdLabel을 불러 보인 쪽 기록을 남긴다(16ms 간격)
// want가 undefined면 장면과 같이 직전에 놓은 쪽을 원한다(중심선을 넘지 않은 경우)
function run(frames: number, block: (f: number, side: boolean) => LabelBlock, want: (f: number) => boolean | undefined = () => undefined, immediateAt: (f: number) => boolean = () => false, settleAt: (f: number) => boolean = () => false) {
  let st: LabelHold | undefined;
  const out: (boolean | null)[] = [];
  for (let f = 0; f < frames; f++) {
    const r = holdLabel(st, want(f) ?? st?.side ?? true, side => block(f, side), f * 16, immediateAt(f) ? 'show' : settleAt(f) ? 'settle' : 'hold');
    st = r.next;
    out.push(r.side);
  }
  return out;
}
const changes = (xs: (boolean | null)[]) => xs.reduce((n, x, i) => n + (i > 0 && x !== xs[i - 1] ? 1 : 0), 0);

test('이름표 유지 시간: 새 이름표는 빈자리가 유지 시간 동안 이어진 뒤에 보이고, 바로 보이기(켬 · 선택 직후)는 기다리지 않는다', () => {
  const out = run(40, () => 0);
  const first = out.findIndex(x => x !== null);
  assert.ok(first * 16 >= LABEL_HOLD_MS && first * 16 < LABEL_HOLD_MS + 32, `처음 보인 프레임 ${first}`);
  assert.equal(run(3, () => 0, () => undefined, f => f === 0)[0], true);
  // 한두 프레임만 나는 빈자리에는 나타나지 않는다(짧은 출몰 0)
  assert.equal(run(120, f => (f % 10 < 2 ? 0 : 1)).filter(x => x !== null).length, 0);
});

test('이름표 유지 시간: 보이는 이름표는 잠깐 겹침(유지 시간 미만)에 숨거나 옮기지 않고, 오래 겹치면 그때 반대쪽으로 한 번 옮긴다', () => {
  const T = Math.ceil(LABEL_SIDE_LOCK_MS / 16) + 5; // 처음 보인 뒤 잠금 시간이 지난 프레임
  // 처음부터 보이는 상태(바로 보이기)에서 오른쪽 자리가 3프레임씩 번갈아 막힘 → 깜박임 · 왕복 0
  const flick = run(300, (f, side) => (side && f > 5 && f % 6 < 3 ? 1 : 0), () => undefined, f => f === 0);
  assert.equal(changes(flick), 0, '잠깐 겹침에 숨거나 옮김');
  // 오른쪽이 계속 막히면(겹침) 유지 시간 뒤에 왼쪽으로 한 번만 옮긴다
  const stuck = run(T + 60, (f, side) => (side && f >= T ? 1 : 0), () => undefined, f => f === 0);
  const moved = stuck.findIndex((x, i) => i > 0 && x === false);
  assert.equal(changes(stuck), 1);
  assert.ok((moved - T) * 16 >= LABEL_HOLD_MS - 16, `겹침 뒤 ${(moved - T) * 16}ms에 옮김`);
  // 놓을 수 없는 자리(조작 막대 · 라우터 조립 · 안전 영역 밖)는 기다리지 않고 바로 비킨다(잠금 안이면 옮기지 않고 숨는다)
  assert.equal(run(T + 5, (f, side) => (side && f >= T ? 2 : 0), () => undefined, f => f === 0)[T], false);
  assert.equal(run(30, (f, side) => (side && f >= 10 ? 2 : 0), () => undefined, f => f === 0)[10], null);
  assert.equal(run(T + 5, f => (f >= T ? 2 : 0), () => undefined, f => f === 0)[T], null);
});

test('이름표 유지 시간: 좌우를 바꾼 뒤 잠금 시간 안에는 다시 바꾸지 않는다(즉시 · 짧은 왕복 0), 중심선을 넘는 정상 전환은 한 번', () => {
  // 원하는 쪽이 2프레임마다 뒤집히는 극단(판정 경계 흔들림)
  const jitter = run(400, () => 0, f => f < 20 || Math.floor(f / 2) % 2 === 0, f => f === 0);
  const flips: number[] = [];
  jitter.forEach((x, i) => { if (i > 0 && x !== jitter[i - 1]) flips.push(i); });
  for (let k = 1; k < flips.length; k++) assert.ok((flips[k] - flips[k - 1]) * 16 >= LABEL_SIDE_LOCK_MS, `쪽 바꿈 간격 ${(flips[k] - flips[k - 1]) * 16}ms`);
  // 양쪽이 번갈아 오래 겹쳐도(겹침으로 옮긴 뒤 새 자리도 겹침) 잠금 안에서 되돌아가지 않는다: 숨었다가 잠금 뒤에만 다른 쪽
  const T = Math.ceil(LABEL_SIDE_LOCK_MS / 16) + 5;
  const both = run(T + 120, (f, side) => (f >= T && f < T + 30 ? (side ? 1 : 0) : f >= T + 30 && f < T + 60 ? (side ? 0 : 1) : 0), () => undefined, f => f === 0);
  const shownSides: { f: number; s: boolean }[] = [];
  both.forEach((x, f) => { if (x !== null && (shownSides.length === 0 || shownSides[shownSides.length - 1].s !== x)) shownSides.push({ f, s: x }); });
  for (let k = 1; k < shownSides.length; k++) assert.ok((shownSides[k].f - shownSides[k - 1].f) * 16 >= LABEL_SIDE_LOCK_MS, `보인 쪽 바꿈 간격 ${(shownSides[k].f - shownSides[k - 1].f) * 16}ms`);
  // 한 번 넘어가면 한 번만 바뀐다
  assert.equal(changes(run(200, () => 0, f => f < 100, f => f === 0)), 1);
});

test('이름표 유지 시간: 움직임이 멈춘 프레임(settle)은 기다림 · 버팀 · 잠금 없이 바로 정하고, 상태 바뀜(show)은 새 이름표만 기다리지 않는다', () => {
  const T = Math.ceil(LABEL_SIDE_LOCK_MS / 16) + 5;
  // 오른쪽이 겹친 채 버티는 중(유지 시간 안)에 움직임이 멈추면 그 프레임에 왼쪽으로 옮긴다
  const stop = run(T + 10, (f, side) => (side && f >= T ? 1 : 0), () => undefined, f => f === 0, f => f === T + 3);
  assert.equal(stop[T + 2], true);
  assert.equal(stop[T + 3], false);
  // 숨은 이름표는 멈춘 프레임에 바로 보인다
  assert.equal(run(5, () => 0, () => undefined, () => false, f => f === 2)[2], true);
  // show는 겹쳐 버티던 이름표를 숨기거나 옮기지 않는다(가리킴이 바뀌어도 이미 보이던 이름표가 한꺼번에 움직이지 않게)
  const hov = run(T + 10, (f, side) => (side && f >= T ? 1 : 0), () => undefined, f => f === 0 || f === T + 3);
  assert.equal(hov[T + 3], true);
});
