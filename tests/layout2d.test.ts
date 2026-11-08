import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGraph } from '../src/core/graph';
import { radialLayout, wedgeWidth } from '../src/core/layout2d';
import { demoDataset } from '../src/data/demo';

test('임시 2D 배치: 모든 문서가 한 자리씩 받고, 같은 데이터면 같은 자리이며 자리가 겹치지 않는다', () => {
  const g = buildGraph(demoDataset);
  const a = radialLayout(g), b = radialLayout(buildGraph(demoDataset));
  assert.equal(a.size, g.docs.length);
  for (const [id, p] of a) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), id);
    assert.ok(Math.hypot(p.x, p.y) <= 1.11, id);
    assert.deepEqual(b.get(id), p);
  }
  const pts = [...a.values()];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > 0.01);
});

test('임시 2D 배치: 자료는 주 분류 영역의 부채꼴 안에 고정된다 — 다른 영역 색인 · MOC가 연결한 공유 자료도 마찬가지', () => {
  const g = buildGraph(demoDataset);
  const pos = radialLayout(g);
  const n = g.areas.length;
  const half = wedgeWidth(n) / 2 + 1e-9;
  const gap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const [first] = g.areas;
  assert.ok(pos.get(first.id)!.x < 0, '첫 영역은 왼쪽');
  // 영역 i의 부채꼴 가운데 = 180° + 360°/n × i(영역 노드 자체는 하위 각도의 가운데라 부채꼴 가운데와 다를 수 있다)
  const wedgeOf = (id: string) => g.areas.findIndex((_, i) => gap(pos.get(id)!.angle, (180 + (360 / n) * i) * (Math.PI / 180)) <= half);
  for (const d of g.docs) {
    const area = g.areaOf.get(d.id);
    if (area && d.id !== area) assert.equal(wedgeOf(d.id), g.areas.findIndex(a => a.id === area), d.path);
  }
  assert.equal(wedgeOf(g.idOfPath.get('src-work/operations/prompts/회의록 요약 프롬프트.md')!), wedgeOf(g.idOfPath.get('work.md')!));
});
