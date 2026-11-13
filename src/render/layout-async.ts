// Computes the 3D layout of large graphs in a Web Worker. Falls back to one run on the main thread if workers are unavailable.
// Each Dataset object is computed once (reused across React StrictMode double runs and scene rebuilds).
import type { BrainGraph } from '../core/graph';
import { layoutGraph, type Vec3 } from '../core/layout3d';
import type { Dataset } from '../core/types';

/** Use the worker above this document count (small graphs like real or test vaults run directly on the main thread) */
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
      // If the worker's graph documents differ from the main graph (shouldn't happen), recompute on the main thread
      if (ids.length !== graph.docs.length || ids.some(d => !graph.byId.has(d))) { resolve(main()); return; }
      resolve({ positions: new Map(ids.map((d, i) => [d, [xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]] as Vec3])), ms, where: 'worker' });
    };
    worker.onerror = () => { worker.terminate(); resolve(main()); };
    worker.postMessage({ seq: id, dataset });
  });
  cache.set(dataset, job);
  return job;
}
