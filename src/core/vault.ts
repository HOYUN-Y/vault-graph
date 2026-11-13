// Virtual vault reader (adapter): file list (path, body) -> documents, links, primary parent. Never touches disk or symlinks.
// Follows the secondbrain-index-sync skill layout.
//   - Top-level guide documents: CLAUDE.md (router), <area>.md (area index), <area>--<topic>.md (sub-index)
//     moc-<topic>.md (topic MOC), project-<name>.md (project guide)
//   - Source files: src-<name>/... (inside external folder links listed in the router's external folder table). Demo paths are all virtual.
//   - Relations come only from [label](document-relative path) links in bodies. Links resolve canonical path -> unique ID,
//     so a source file linked from several indexes or MOCs is still one node.
//   - The primary parent ignores which disk folder a source file lives in. Index links alone decide it (classify).
import { normalizePath, parseLinks, resolveHref } from './markdown';
import type { BrainDoc, DocFormat, NodeKind } from './types';

/** One adapter input: vault-relative path plus the document's metadata and UTF-8 body */
export interface VaultFile {
  path: string;
  title: string;
  summary: string;
  body: string;
  /** YYYY-MM-DD (empty for a real vault, which never opens source files) */
  updated: string;
  /** Format override instead of the extension (real vault: 'dir' for folders, 'other' for unknown extensions) */
  format?: DocFormat;
  kind?: NodeKind;
}

export interface VaultRead {
  docs: BrainDoc[];
  /** Document ID -> IDs its body links to (body order, deduplicated, self excluded) */
  links: Map<string, string[]>;
  /** Canonical path (NFC) -> unique ID */
  idOfPath: Map<string, string>;
  /** src-* external folders linked from the router. Later connectors find source roots here instead of separate config */
  sourceRoots: string[];
  problems: string[];
}

/** Decide the document kind from path rules. Anything not top-level or not .md is a material */
export function kindOfPath(path: string): NodeKind {
  if (path.includes('/') || !/\.md$/i.test(path)) return 'material';
  if (path === 'CLAUDE.md') return 'router';
  if (path.startsWith('moc-')) return 'moc';
  if (path.startsWith('project-')) return 'guide';
  if (path.includes('--')) return 'subindex';
  return 'area';
}

const FORMATS: [RegExp, DocFormat][] = [[/\.md$/i, 'md'], [/\.pdf$/i, 'pdf'], [/\.(png|jpe?g|gif|webp|svg)$/i, 'image']];
export function formatOfPath(path: string): DocFormat | null {
  return FORMATS.find(([re]) => re.test(path))?.[1] ?? null;
}

function fnv(text: string, seed: number) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** Opaque ID derived from the canonical path. The UI, URLs and later read APIs use it instead of the path */
export const opaqueId = (path: string) => `d${fnv(path, 2166136261).toString(36)}${fnv(path, 0x9e3779b9).toString(36)}`;

const AREA_AXIS: ReadonlySet<NodeKind> = new Set<NodeKind>(['area', 'subindex', 'guide']);

/**
 * Decide the primary parent (logical parent) from index links, not disk folders.
 *   1) Area axis: router -> area index -> (sub-index, project guide) -> document. Breadth-first; same depth follows body link order.
 *      The first index reached is the primary parent; links from other area indexes stay as index links.
 *   2) Remaining router links (project table shortcuts etc.): only documents no area index claimed go under the router.
 *   3) Topic axis: documents linked only from a MOC go under that MOC.
 */
function classify(router: string | undefined, links: Map<string, string[]>, kindOf: (id: string) => NodeKind) {
  const parent = new Map<string, string | null>();
  if (!router) return parent;
  parent.set(router, null);
  const top = links.get(router) ?? [];
  const queue: string[] = [];
  const walk = () => {
    while (queue.length) {
      const s = queue.shift()!;
      for (const t of links.get(s) ?? []) {
        if (parent.has(t)) continue;
        parent.set(t, s);
        if (AREA_AXIS.has(kindOf(t))) queue.push(t);
      }
    }
  };
  for (const t of top) {
    const k = kindOf(t);
    if ((k === 'area' || k === 'moc') && !parent.has(t)) { parent.set(t, router); if (k === 'area') queue.push(t); }
  }
  walk();
  for (const t of top) if (!parent.has(t)) { parent.set(t, router); if (AREA_AXIS.has(kindOf(t))) queue.push(t); }
  walk();
  const topics = [...parent.keys()].filter(t => kindOf(t) === 'moc');
  while (topics.length) {
    const m = topics.shift()!;
    for (const t of links.get(m) ?? []) {
      if (parent.has(t)) continue;
      parent.set(t, m);
      if (kindOf(t) === 'moc') topics.push(t);
    }
  }
  return parent;
}

export function readVault(files: VaultFile[]): VaultRead {
  const problems: string[] = [];
  const idOfPath = new Map<string, string>();
  const ids = new Set<string>();
  const entries: { file: VaultFile; path: string; id: string; kind: NodeKind; format: DocFormat }[] = [];
  for (const file of files) {
    const path = normalizePath(file.path);
    if (!path) { problems.push(`Invalid path: ${file.path}`); continue; }
    if (idOfPath.has(path)) { problems.push(`Duplicate source path: ${path}`); continue; }
    const format = file.format ?? formatOfPath(path) ?? 'other';
    const id = opaqueId(path);
    if (ids.has(id)) { problems.push(`ID collision: ${path}`); continue; }
    ids.add(id);
    idOfPath.set(path, id);
    entries.push({ file, path, id, kind: file.kind ?? kindOfPath(path), format });
  }
  const kindById = new Map(entries.map(e => [e.id, e.kind]));
  const dirs = new Set<string>();
  for (const path of idOfPath.keys()) {
    const segs = path.split('/');
    for (let i = 1; i < segs.length; i++) dirs.add(segs.slice(0, i).join('/'));
  }

  const links = new Map<string, string[]>();
  const sourceRoots: string[] = [];
  for (const e of entries) {
    if (e.format !== 'md') continue;
    const out: string[] = [];
    for (const link of parseLinks(e.file.body)) {
      const t = resolveHref(e.path, link.href);
      if (t.type === 'external' || t.type === 'anchor') continue;
      if (t.type === 'invalid') { problems.push(`Broken link (${t.reason}): ${e.path} → ${link.href}`); continue; }
      const id = idOfPath.get(t.path);
      if (!id) {
        // Folder link: the router's external folder table (src-*) becomes the source root list, not nodes
        if (dirs.has(t.path)) {
          if (e.kind === 'router' && /^src-[^/]+$/.test(t.path) && !sourceRoots.includes(t.path)) sourceRoots.push(t.path);
          continue;
        }
        problems.push(`Broken link: ${e.path} → ${link.href}`);
        continue;
      }
      if (id !== e.id && !out.includes(id)) out.push(id);
    }
    if (out.length) links.set(e.id, out);
  }

  const routers = entries.filter(e => e.kind === 'router');
  const parent = classify(routers[0]?.id, links, id => kindById.get(id)!);
  const docs: BrainDoc[] = entries.map(({ file, path, id, kind, format }) => {
    if (!parent.has(id) && kind !== 'router') problems.push(`Document not reachable from the router via index links: ${path}`);
    return { id, kind, title: file.title, path, parent: parent.get(id) ?? null, summary: file.summary, body: file.body, format, updated: file.updated };
  });
  return { docs, links, idOfPath, sourceRoots, problems };
}
