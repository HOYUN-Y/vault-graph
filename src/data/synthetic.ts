// 성능 측정용 합성 볼트(?nodes=1000 · 3000). 결정적으로 만들며 화면에는 "합성 성능 데이터"로 표시한다.
// 데모와 같은 구조(최상위 안내 문서 · src-* 원문 · 상대경로 링크)를 쓴다. 원문 위치(묶음 폴더)는 분류와 일부러 다르게 둔다.
import { relativeHref } from '../core/markdown';
import type { Dataset } from '../core/types';
import type { VaultFile } from '../core/vault';
import { hash } from '../core/layout3d';

const AREAS = ['업무', '개인', '연구', '모임'];
const SUBS = ['프로젝트', '운영', '기록', '학습', '자료', '계획'];
const MOCS = ['기획', '개발', 'AI 활용', '글쓰기', '의사결정', '데이터', '디자인', '협업'];

export function syntheticDataset(total: number): Dataset {
  const title = new Map<string, string>(), path = new Map<string, string>();
  const children = new Map<string, string[]>();
  const child = (parent: string, id: string) => children.set(parent, [...(children.get(parent) ?? []), id]);
  const node = (id: string, t: string, p: string) => { title.set(id, t); path.set(id, p); };
  const mocLinks = new Map<string, string[]>(MOCS.map((_, i) => [`moc-${i}`, []]));
  const indexes: string[] = [];

  node('router', 'CLAUDE.md', 'CLAUDE.md');
  MOCS.forEach((m, i) => node(`moc-${i}`, m, `moc-${i}.md`));
  AREAS.forEach((a, ai) => {
    const area = `area-${ai}`;
    node(area, a, `area-${ai}.md`);
    child('router', area);
    SUBS.forEach((s, si) => {
      const sub = `sub-${ai}-${si}`;
      node(sub, `${a} · ${s}`, `area-${ai}--sub-${si}.md`);
      child(area, sub); indexes.push(sub);
      for (let gi = 0; gi < 2; gi++) {
        const guide = `guide-${ai}-${si}-${gi}`;
        node(guide, `${s} 안내 ${gi + 1}`, `project-${ai}-${si}-${gi}.md`);
        child(sub, guide); indexes.push(guide);
      }
    });
  });
  const hubs = 1 + AREAS.length + MOCS.length + indexes.length;
  const mats: string[] = [];
  for (let i = 0; i < Math.max(0, total - hubs); i++) {
    const id = `mat-${i}`;
    node(id, `합성 자료 ${i + 1}`, `src-synth/batch-${i % 12}/mat-${i}.md`);
    child(indexes[Math.floor(hash(`p${i}`) * indexes.length)], id);
    mats.push(id);
    if (hash(`m${i}`) < 0.22) mocLinks.get(`moc-${Math.floor(hash(`mm${i}`) * MOCS.length)}`)!.push(id);
  }

  const files: VaultFile[] = [];
  const link = (from: string) => (to: string) => `- [${title.get(to)}](${relativeHref(path.get(from)!, path.get(to)!)})`;
  const file = (id: string, body: string) =>
    files.push({ path: path.get(id)!, title: title.get(id)!, summary: `${title.get(id)} (합성)`, body: `# ${title.get(id)}\n\n${body}`, updated: '2026-11-01' });
  file('router', [...(children.get('router') ?? []), ...MOCS.map((_, i) => `moc-${i}`)].map(link('router')).join('\n'));
  AREAS.forEach((_, ai) => file(`area-${ai}`, (children.get(`area-${ai}`) ?? []).map(link(`area-${ai}`)).join('\n')));
  MOCS.forEach((_, i) => file(`moc-${i}`, mocLinks.get(`moc-${i}`)!.map(link(`moc-${i}`)).join('\n')));
  for (const id of indexes) {
    const extra = hash(`x${id}`) < 0.3 && mats.length ? [mats[Math.floor(hash(`xx${id}`) * mats.length)]] : [];
    file(id, [...(children.get(id) ?? []), ...extra].map(link(id)).join('\n'));
  }
  mats.forEach((id, i) => {
    const other = mats.length > 1 && hash(`r${i}`) < 0.35 ? mats[Math.floor(hash(`rr${i}`) * mats.length)] : null;
    file(id, other && other !== id ? `관련: ${link(id)(other).slice(2)}` : '합성 본문');
  });
  return { label: `합성 성능 데이터 ${files.length}개`, synthetic: true, files };
}
