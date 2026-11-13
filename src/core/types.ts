// Second brain data types. No browser or renderer dependency (used as-is in Node tests).
import type { VaultFile } from './vault';

/** Router (CLAUDE.md) · area index · sub-index · project guide · topic MOC · material */
export type NodeKind = 'router' | 'area' | 'subindex' | 'guide' | 'moc' | 'material';

/** Only md (UTF-8 text) can show a body. pdf, image, other files and source folders show only a description */
export type DocFormat = 'md' | 'pdf' | 'image' | 'other' | 'dir';

/** A document built by the vault adapter (vault.ts) from the file list. Source location (path) and primary parent (parent) are separate */
export interface BrainDoc {
  /** Opaque unique ID from the normalized path. One node per source file even if several indexes link it */
  id: string;
  /** Kind set by path rules (vault.ts kindOfPath) */
  kind: NodeKind;
  title: string;
  /** Source location: normalized vault path (NFC). Guide documents at top level, source files under src-<name>/… (demo paths are all virtual) */
  path: string;
  /** Primary parent: logical parent ID set by index links, unrelated to disk folders. null for the router and unreachable documents */
  parent: string | null;
  /** One-line summary (index text) */
  summary: string;
  /** UTF-8 body. Relations come only from standard Markdown links [name](path relative to the document) */
  body: string;
  format: DocFormat;
  /** YYYY-MM-DD */
  updated: string;
}

export interface Dataset {
  label: string;
  /** Whether this is synthetic demo data. Keeps demo numbers from looking like real values */
  synthetic: boolean;
  /** Virtual vault file list (path · body). Never reads disk */
  files: VaultFile[];
}

/** primary (primary index → document) · index link (another index also links it) · topic link (MOC or document-to-document). No disk folder relations */
export type EdgeKind = 'primary' | 'index' | 'topic';

/** Edge (drawing only): relations of one pair merged into one. The relations themselves are graph.ts Relation */
export interface Edge {
  /** Direction-independent pair key */
  key: string;
  /** Direction of the representative relation */
  source: string;
  target: string;
  /** Representative kind (primary > index > topic) */
  kind: EdgeKind;
  /** All kinds merged into this pair */
  kinds: EdgeKind[];
}

/** Link view: all · structure (primary + index links) · topic links */
export type EdgeView = 'all' | 'structure' | 'topic';

/** Index-like kinds that list other materials */
export const INDEX_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(['router', 'area', 'subindex', 'guide']);

export const isPreviewable = (doc: BrainDoc) => doc.format === 'md';
