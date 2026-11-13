// 3D layout worker: runs the layout of large graphs (thousands of documents, several seconds) off the main thread.
// Same data gives the same graph and positions as the main thread (buildGraph and layoutGraph are deterministic).
import { buildGraph } from '../core/graph';
import { layoutGraph } from '../core/layout3d';
import type { Dataset } from '../core/types';

interface Request { seq: number; dataset: Dataset }

self.onmessage = (event: MessageEvent<Request>) => {
  const { seq, dataset } = event.data;
  const t = performance.now();
  const g = buildGraph(dataset);
  const pos = layoutGraph(g);
  const ids = [...pos.keys()];
  const xyz = new Float64Array(ids.length * 3);
  ids.forEach((id, i) => xyz.set(pos.get(id)!, i * 3));
  (self as unknown as Worker).postMessage({ seq, ids, xyz, ms: performance.now() - t }, [xyz.buffer]);
};
