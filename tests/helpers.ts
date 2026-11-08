// 시험용 가상 볼트: 이름 → [볼트 기준 경로, 본문]. 디스크를 읽지 않는다.
import { buildGraph } from '../src/core/graph';
import type { VaultFile } from '../src/core/vault';
import { demoDataset } from '../src/data/demo';

export function vault(spec: Record<string, [path: string, body: string]>) {
  const files: VaultFile[] = Object.entries(spec).map(([name, [path, body]]) => ({ path, title: name, summary: name, body, updated: '2026-11-01' }));
  const g = buildGraph({ label: '시험', synthetic: true, files });
  const ids = new Map(Object.entries(spec).map(([name, [path]]) => [name, g.idOfPath.get(path.normalize('NFC')) ?? `?${name}`]));
  const names = new Map([...ids].map(([name, id]) => [id, name]));
  return {
    g,
    id: (name: string) => ids.get(name)!,
    name: (id: string) => names.get(id) ?? id,
    names: (list: Iterable<string>) => [...list].map(id => names.get(id) ?? id).sort()
  };
}

/** 데모 볼트 그래프와 경로 → ID 찾기 */
export function demo() {
  const g = buildGraph(demoDataset);
  const id = (path: string) => {
    const found = g.idOfPath.get(path);
    if (!found) throw new Error(`데모에 없는 경로: ${path}`);
    return found;
  };
  return { g, id };
}
