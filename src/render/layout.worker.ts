// 3D 배치 작업자: 큰 그래프(수천 문서)의 배치 계산(수 초)을 화면 스레드 밖에서 한다.
// 같은 데이터면 화면 스레드와 같은 그래프 · 같은 자리를 만든다(buildGraph · layoutGraph 모두 결정적이다).
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
