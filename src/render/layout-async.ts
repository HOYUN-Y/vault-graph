// 큰 그래프의 3D 배치를 작업자(Web Worker)에서 계산한다. 작업자를 쓸 수 없으면 화면 스레드에서 한 번 계산한다.
// 같은 데이터 묶음(Dataset 객체)은 한 번만 계산한다(React StrictMode의 이중 실행 · 장면 재생성에도 재사용).
import type { BrainGraph } from '../core/graph';
import { layoutGraph, type Vec3 } from '../core/layout3d';
import type { Dataset } from '../core/types';

/** 이 문서 수보다 크면 작업자에서 계산한다(실제 볼트 · 시험 볼트처럼 작은 그래프는 그대로 화면 스레드에서 바로) */
export const ASYNC_LAYOUT_MIN = 1500;

export interface LayoutResult { positions: Map<string, Vec3>; ms: number; where: 'worker' | 'main' }

const cache = new WeakMap<Dataset, Promise<LayoutResult>>();
let seq = 0;

export function layoutAsync(dataset: Dataset, graph: BrainGraph): Promise<LayoutResult> {
  const known = cache.get(dataset);
  if (known) return known;
  const main = (): LayoutResult => { const t = performance.now(); const positions = layoutGraph(graph); return { positions, ms: performance.now() - t, where: 'main' }; };
  const job = new Promise<LayoutResult>(resolve => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      setTimeout(() => resolve(main()), 0);
      return;
    }
    const id = ++seq;
    worker.onmessage = (event: MessageEvent<{ seq: number; ids: string[]; xyz: Float64Array; ms: number }>) => {
      if (event.data.seq !== id) return;
      const { ids, xyz, ms } = event.data;
      worker.terminate();
      // 작업자가 만든 그래프와 화면 그래프의 문서가 다르면(있을 수 없지만) 화면 스레드에서 다시 계산한다
      if (ids.length !== graph.docs.length || ids.some(d => !graph.byId.has(d))) { resolve(main()); return; }
      resolve({ positions: new Map(ids.map((d, i) => [d, [xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]] as Vec3])), ms, where: 'worker' });
    };
    worker.onerror = () => { worker.terminate(); resolve(main()); };
    worker.postMessage({ seq: id, dataset });
  });
  cache.set(dataset, job);
  return job;
}
