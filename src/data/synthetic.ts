// Synthetic vault for performance measurement (?nodes=1000 · 3000). Built deterministically and labeled "synthetic performance data" on screen.
// Uses the same structure as the demo (top-level guide documents · src-* source files · relative links). Source locations (batch folders) deliberately differ from the classification.
import { relativeHref } from '../core/markdown';
import type { Dataset } from '../core/types';
import type { VaultFile } from '../core/vault';
import { hash } from '../core/layout3d';

const AREAS = ['Work', 'Personal', 'Research', 'Groups'];
const SUBS = ['Projects', 'Operations', 'Logs', 'Learning', 'Resources', 'Plans'];
const MOCS = ['Planning', 'Development', 'AI in practice', 'Writing', 'Decisions', 'Data', 'Design', 'Collaboration'];

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
        node(guide, `${s} guide ${gi + 1}`, `project-${ai}-${si}-${gi}.md`);
        child(sub, guide); indexes.push(guide);
      }
    });
  });
  const hubs = 1 + AREAS.length + MOCS.length + indexes.length;
  const mats: string[] = [];
  for (let i = 0; i < Math.max(0, total - hubs); i++) {
    const id = `mat-${i}`;
    node(id, `Synthetic material ${i + 1}`, `src-synth/batch-${i % 12}/mat-${i}.md`);
    child(indexes[Math.floor(hash(`p${i}`) * indexes.length)], id);
    mats.push(id);
    if (hash(`m${i}`) < 0.22) mocLinks.get(`moc-${Math.floor(hash(`mm${i}`) * MOCS.length)}`)!.push(id);
  }

  const files: VaultFile[] = [];
  const link = (from: string) => (to: string) => `- [${title.get(to)}](${relativeHref(path.get(from)!, path.get(to)!)})`;
  const file = (id: string, body: string) =>
    files.push({ path: path.get(id)!, title: title.get(id)!, summary: `${title.get(id)} (synthetic)`, body: `# ${title.get(id)}\n\n${body}`, updated: '2026-11-01' });
  file('router', [...(children.get('router') ?? []), ...MOCS.map((_, i) => `moc-${i}`)].map(link('router')).join('\n'));
  AREAS.forEach((_, ai) => file(`area-${ai}`, (children.get(`area-${ai}`) ?? []).map(link(`area-${ai}`)).join('\n')));
  MOCS.forEach((_, i) => file(`moc-${i}`, mocLinks.get(`moc-${i}`)!.map(link(`moc-${i}`)).join('\n')));
  for (const id of indexes) {
    const extra = hash(`x${id}`) < 0.3 && mats.length ? [mats[Math.floor(hash(`xx${id}`) * mats.length)]] : [];
    file(id, [...(children.get(id) ?? []), ...extra].map(link(id)).join('\n'));
  }
  mats.forEach((id, i) => {
    const other = mats.length > 1 && hash(`r${i}`) < 0.35 ? mats[Math.floor(hash(`rr${i}`) * mats.length)] : null;
    file(id, other && other !== id ? `Related: ${link(id)(other).slice(2)}` : 'Synthetic body');
  });
  return { label: `Synthetic performance data (${files.length} docs)`, synthetic: true, files };
}
