import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { LABEL_HOLD_MS, LABEL_SIDE_BAND, LABEL_SIDE_LOCK_MS, holdLabel, labelSide, type LabelBlock, type LabelHold } from '../src/core/label-side';
import { assemblyRadius, liftAlongRay } from '../src/render/glow-lift';
import { assembly } from '../src/render/voxel';

test('label side: floating-point jitter at the center line (873.9999… ↔ 874.0000…) does not flip the side', () => {
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

test('label side: jitter inside the dead band keeps the side; passing across the band flips it once', () => {
  const mid = 500;
  let side = labelSide(mid + 40, mid, undefined);
  assert.equal(side, true);
  // Oscillate ±(band-1)px inside the band: unchanged
  for (let f = 0; f < 200; f++) side = labelSide(mid + (f % 2 ? 1 : -1) * (LABEL_SIDE_BAND - 1), mid, side);
  assert.equal(side, true);
  // Flip count while sweeping right → left in 1px steps
  let flips = 0;
  for (let x = mid + 60; x >= mid - 60; x--) { const n = labelSide(x, mid, side); if (n !== side) flips++; side = n; }
  assert.equal(flips, 1);
  assert.equal(side, false);
  // A first-seen node uses the center line
  assert.equal(labelSide(mid - 0.5, mid, undefined), false);
  assert.equal(labelSide(mid, mid, undefined), true);
});

test('glow depth correction: moving along the camera→node ray keeps screen position (with pan, rotation, zoom and view offset) and brings it closer', () => {
  const cam = new THREE.PerspectiveCamera(40, 1440 / 900, 0.02, 50);
  let worst = 0;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let c = 0; c < 40; c++) {
    const dist = 0.8 + rnd() * 4, theta = rnd() * Math.PI * 2, phi = 0.2 + rnd() * 2.7;
    cam.position.setFromSphericalCoords(dist, phi, theta);
    cam.lookAt(0, 0, 0);
    // Also covers a view center shifted for the detail panel or legend (setViewOffset)
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
  assert.ok(worst < 1e-6, `screen difference ${worst}px`);
});

// Temporal stabilization: call holdLabel every frame and record the shown side (16ms apart)
// If want is undefined, prefer the previous side like the scene does (when the center line wasn't crossed)
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

test('label hold: a new label shows after a free spot lasts the hold time; immediate show (right after on or select) does not wait', () => {
  const out = run(40, () => 0);
  const first = out.findIndex(x => x !== null);
  assert.ok(first * 16 >= LABEL_HOLD_MS && first * 16 < LABEL_HOLD_MS + 32, `first shown frame ${first}`);
  assert.equal(run(3, () => 0, () => undefined, f => f === 0)[0], true);
  // Never appears in a spot free for only a frame or two (zero brief flashes)
  assert.equal(run(120, f => (f % 10 < 2 ? 0 : 1)).filter(x => x !== null).length, 0);
});

test('label hold: a shown label neither hides nor moves on a brief overlap (under the hold time); a long overlap moves it to the other side once', () => {
  const T = Math.ceil(LABEL_SIDE_LOCK_MS / 16) + 5; // first frame after the lock time since first shown
  // Shown from the start (immediate show), right spot blocked every other 3 frames → zero flicker or flips
  const flick = run(300, (f, side) => (side && f > 5 && f % 6 < 3 ? 1 : 0), () => undefined, f => f === 0);
  assert.equal(changes(flick), 0, 'hid or moved on a brief overlap');
  // If the right stays blocked (overlap), move left once after the hold time
  const stuck = run(T + 60, (f, side) => (side && f >= T ? 1 : 0), () => undefined, f => f === 0);
  const moved = stuck.findIndex((x, i) => i > 0 && x === false);
  assert.equal(changes(stuck), 1);
  assert.ok((moved - T) * 16 >= LABEL_HOLD_MS - 16, `moved ${(moved - T) * 16}ms after overlap`);
  // Unplaceable spots (control bar, router assembly, outside safe area) clear immediately (within the lock it hides instead of moving)
  assert.equal(run(T + 5, (f, side) => (side && f >= T ? 2 : 0), () => undefined, f => f === 0)[T], false);
  assert.equal(run(30, (f, side) => (side && f >= 10 ? 2 : 0), () => undefined, f => f === 0)[10], null);
  assert.equal(run(T + 5, f => (f >= T ? 2 : 0), () => undefined, f => f === 0)[T], null);
});

test('label hold: no side change again within the lock time (zero instant or quick flips); a normal center-line crossing flips once', () => {
  // Extreme case: the wanted side flips every 2 frames (jitter at the decision boundary)
  const jitter = run(400, () => 0, f => f < 20 || Math.floor(f / 2) % 2 === 0, f => f === 0);
  const flips: number[] = [];
  jitter.forEach((x, i) => { if (i > 0 && x !== jitter[i - 1]) flips.push(i); });
  for (let k = 1; k < flips.length; k++) assert.ok((flips[k] - flips[k - 1]) * 16 >= LABEL_SIDE_LOCK_MS, `side change interval ${(flips[k] - flips[k - 1]) * 16}ms`);
  // Even if both sides take turns overlapping (the new spot overlaps after moving), no going back within the lock: hide, then switch only after the lock
  const T = Math.ceil(LABEL_SIDE_LOCK_MS / 16) + 5;
  const both = run(T + 120, (f, side) => (f >= T && f < T + 30 ? (side ? 1 : 0) : f >= T + 30 && f < T + 60 ? (side ? 0 : 1) : 0), () => undefined, f => f === 0);
  const shownSides: { f: number; s: boolean }[] = [];
  both.forEach((x, f) => { if (x !== null && (shownSides.length === 0 || shownSides[shownSides.length - 1].s !== x)) shownSides.push({ f, s: x }); });
  for (let k = 1; k < shownSides.length; k++) assert.ok((shownSides[k].f - shownSides[k - 1].f) * 16 >= LABEL_SIDE_LOCK_MS, `shown side change interval ${(shownSides[k].f - shownSides[k - 1].f) * 16}ms`);
  // One crossing, one flip
  assert.equal(changes(run(200, () => 0, f => f < 100, f => f === 0)), 1);
});

test('label hold: a frame where motion stopped (settle) decides at once without wait, hold or lock; a state change (show) skips the wait only for new labels', () => {
  const T = Math.ceil(LABEL_SIDE_LOCK_MS / 16) + 5;
  // If motion stops while the right side is holding through an overlap (within the hold time), move left that frame
  const stop = run(T + 10, (f, side) => (side && f >= T ? 1 : 0), () => undefined, f => f === 0, f => f === T + 3);
  assert.equal(stop[T + 2], true);
  assert.equal(stop[T + 3], false);
  // A hidden label shows immediately on the stop frame
  assert.equal(run(5, () => 0, () => undefined, () => false, f => f === 2)[2], true);
  // show doesn't hide or move a label holding through an overlap (so a hover change doesn't shift all shown labels at once)
  const hov = run(T + 10, (f, side) => (side && f >= T ? 1 : 0), () => undefined, f => f === 0 || f === T + 3);
  assert.equal(hov[T + 3], true);
});
