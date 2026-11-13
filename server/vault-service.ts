// Real vault service (Node server only, read-only): read settings, publish snapshots, watch changes, preview.
// - Re-checks the policy (router and ledger fingerprint) and generation right before publishing; results built while the policy changed are not published.
// - Private rule failures, settings errors and vault changes discard earlier results. Only when the vault is unreachable is the last verified result kept as disconnected.
// - Responses and logs use relative paths and generic wording only.
import { createHash } from 'node:crypto';
import { watch as fsWatch, promises as fsp } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import path from 'node:path';
import { isPolicyPath, isPrivate, isSecretPath, makeRedactor } from './privacy';
import { aliasesOf, empty, ioKind, loadPolicy, underPrivate, readSnapshot, rootReals, toPublic, withTimeout } from './vault-reader';
import type { Snapshot } from './vault-reader';

export const PREVIEW_MAX_BYTES = 512 * 1024, PREVIEW_TIMEOUT = 4000;
const PREVIEW_EXT = /\.(md|markdown|txt)$/i;

export type PreviewState = 'ok' | 'changed' | 'gone' | 'private' | 'blocked' | 'unsupported' | 'unregistered' | 'root-unavailable' | 'missing'
  | 'denied' | 'read-error' | 'offline' | 'outside' | 'not-file' | 'too-large' | 'timeout' | 'not-text' | 'demo';
export interface Preview { state: PreviewState; body?: string; bytes?: number }

interface Settings { vaultPath: string | null; structure: 'indexed' | 'workspace'; routerPath: string; error: string | null }
const defaults = { structure: 'indexed' as const, routerPath: 'CLAUDE.md' };

async function readSettings(file: string): Promise<Settings> {
  let text: string;
  try { text = await fsp.readFile(file, 'utf8'); } catch { return { vaultPath: null, ...defaults, error: null }; }
  try {
    const value = JSON.parse(text) as { vaultPath?: unknown; structure?: unknown; routerPath?: unknown };
    if ((value.structure !== undefined && value.structure !== 'indexed' && value.structure !== 'workspace') || (value.routerPath !== undefined && (typeof value.routerPath !== 'string' || !value.routerPath || value.routerPath.includes('\\') || value.routerPath.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(value.routerPath) || value.routerPath.split('/').some(p => !p || p === '.' || p === '..')))) return { vaultPath: null, ...defaults, error: 'structure or routerPath in settings.json is invalid' };
    const structure = (value.structure ?? defaults.structure) as Settings['structure'];
    const routerPath = ((value.routerPath ?? defaults.routerPath) as string).normalize('NFC');
    if (value.vaultPath === undefined || (typeof value.vaultPath === 'string' && !value.vaultPath.trim())) return { vaultPath: null, ...defaults, error: null };
    if (typeof value.vaultPath !== 'string') return { vaultPath: null, ...defaults, error: 'vaultPath in settings.json is invalid' };
    if (!path.isAbsolute(value.vaultPath)) return { vaultPath: null, ...defaults, error: 'vaultPath in settings.json must be an absolute path' };
    return { vaultPath: path.normalize(value.vaultPath), structure, routerPath, error: null };
  } catch { return { vaultPath: null, ...defaults, error: 'Cannot parse settings.json' }; }
}

async function settingsPrint(file: string): Promise<string> {
  try { return createHash('sha256').update(await fsp.readFile(file)).digest('hex'); } catch { return 'none'; }
}

export interface ServiceOptions {
  pollMs?: number;
  debounceMs?: number;
  /** For tests: called after building a snapshot, right before publishing */
  beforePublish?: () => Promise<void> | void;
  /** For tests: called after reading a preview body, right before returning it */
  beforePreviewReturn?: () => Promise<void> | void;
}

export class VaultService {
  private settings: Settings = { vaultPath: null, ...defaults, error: null };
  private published: Snapshot | null = null;
  private lastGood: Snapshot | null = null;
  private stale = false;
  private generation = 0;
  private version = 0;
  private updatedAt: number | null = null;
  private checkedAt: number | null = null;
  private watchers: FSWatcher[] = [];
  private poll: NodeJS.Timeout | null = null;
  private debounce: NodeJS.Timeout | null = null;
  private print = '';
  private running: Promise<void> | null = null;
  private again = false;

  constructor(private settingsFile: string, private opts: ServiceOptions = {}) {}

  /** Settings/vault identity (a hash that hides the path): when it changes, the UI drops all earlier real data */
  private get vaultKey() { return this.settings.vaultPath ? createHash('sha256').update(JSON.stringify([this.settings.vaultPath, this.settings.structure, this.settings.routerPath])).digest('hex').slice(0, 12) : null; }

  async start() {
    await this.refresh();
    this.poll = setInterval(() => { void this.checkChanges(); }, this.opts.pollMs ?? 4000);
    this.poll.unref?.();
  }

  close() {
    if (this.poll) clearInterval(this.poll);
    if (this.debounce) clearTimeout(this.debounce);
    for (const w of this.watchers) w.close();
    this.watchers = [];
  }

  /** Debounce change events, then rebuild */
  schedule() {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => { void this.refresh(); }, this.opts.debounceMs ?? 300);
  }

  /** Rebuild (overlapping calls run once more after the current one finishes) */
  refresh(): Promise<void> {
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => {
      do { this.again = false; await this.build(); } while (this.again);
    })().finally(() => { this.running = null; });
    return this.running;
  }

  private async build() {
    const gen = ++this.generation;
    const prevKey = this.vaultKey;
    this.settings = await readSettings(this.settingsFile);
    this.checkedAt = Date.now();
    if (this.vaultKey !== prevKey) { this.lastGood = null; this.published = null; this.stale = false; this.version++; this.resetWatch(); }
    const vault = this.settings.vaultPath;
    if (!vault) { this.publish(null); return; }
    const settingsAt = await settingsPrint(this.settingsFile);
    for (let attempt = 0; attempt < 3; attempt++) {
      const snap = await readSnapshot(vault, this.settings.structure, this.settings.routerPath);
      await this.opts.beforePublish?.();
      if (gen !== this.generation) return; // a newer refresh has started
      // Pre-publish check: restart if settings changed (the vault may differ), rebuild if the policy changed
      if (await settingsPrint(this.settingsFile) !== settingsAt) { this.again = true; return; }
      const now = await loadPolicy(vault, this.settings.routerPath);
      if (now.print !== snap.policy) continue;
      this.publish(snap);
      return;
    }
    this.publish(empty('blocked', 'Publishing postponed because private rules keep changing'));
  }

  private publish(snap: Snapshot | null) {
    const before = this.published?.signature ?? 'none', beforeStale = this.stale, beforeState = this.published?.state;
    if (!snap) { this.published = null; this.lastGood = null; this.stale = false; }
    else if (snap.state === 'connected') { this.published = snap; this.lastGood = snap; this.stale = false; this.updatedAt = Date.now(); }
    else if (snap.state === 'unavailable' && this.lastGood) { this.published = { ...this.lastGood, state: 'unavailable', reason: snap.reason }; this.stale = true; }
    else { this.published = snap; this.lastGood = null; this.stale = false; }
    if ((this.published?.signature ?? 'none') !== before || this.stale !== beforeStale || this.published?.state !== beforeState) this.version++;
    this.resetWatch();
    void this.fingerprint().then(p => { this.print = p; });
  }

  private watchTargets(): string[] {
    const out = new Set<string>([path.dirname(this.settingsFile)]);
    const vault = this.settings.vaultPath;
    if (vault) { out.add(vault); out.add(path.join(vault, '.secondbrain')); for (const file of this.published?.watch ?? []) out.add(path.dirname(file)); }
    return [...out];
  }

  private resetWatch() {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    for (const dir of this.watchTargets()) {
      try {
        const w = fsWatch(dir, { persistent: false }, (_event, name) => {
          if (dir === path.dirname(this.settingsFile) && name && String(name) !== path.basename(this.settingsFile)) return;
          this.schedule();
        });
        w.on('error', () => { /* if the folder disappears, polling takes over */ });
        this.watchers.push(w);
      } catch { /* missing folder: polling */ }
    }
  }

  /** Polling fingerprint: mtime and size of settings, router, ledger, guide documents and vault folder */
  private async fingerprint(): Promise<string> {
    const files = [this.settingsFile, ...(this.settings.vaultPath ? [this.settings.vaultPath, path.join(this.settings.vaultPath, this.settings.routerPath), path.join(this.settings.vaultPath, '.secondbrain', 'private-paths.txt')] : []),
      ...(this.lastGood?.watch ?? this.published?.watch ?? [])];
    const parts = await Promise.all([...new Set(files)].map(async f => {
      const st = await withTimeout(fsp.stat(f).catch(() => null), 1500);
      return st && st !== 'timeout' ? `${st.mtimeMs}:${st.size}` : 'x';
    }));
    return parts.join('|');
  }

  private async checkChanges() {
    const p = await this.fingerprint();
    if (p !== this.print || this.stale || this.published?.state === 'unavailable') { this.print = p; await this.refresh(); }
  }

  status() {
    const s = this.published;
    const mode = this.settings.vaultPath ? 'real' : 'demo';
    return {
      mode, version: this.version, vaultKey: this.vaultKey, structure: this.settings.structure,
      state: this.settings.error ? 'invalid' : mode === 'demo' ? 'demo' : (s?.state ?? 'connecting'),
      reason: this.settings.error ?? s?.reason ?? null, stale: this.stale,
      updatedAt: this.updatedAt, checkedAt: this.checkedAt,
      counts: s?.counts ?? null, roots: s?.roots.length ?? 0, problems: s?.problems ?? []
    };
  }

  graph() {
    const s = this.published;
    if (!s || !this.settings.vaultPath) return { ...this.status(), files: [], meta: {} };
    return { ...this.status(), ...toPublic(s) };
  }

  /** Preview: accepts opaque IDs only. Re-checks the latest private rules, registered roots and real paths on every request */
  async preview(id: string): Promise<Preview> {
    const vault = this.settings.vaultPath;
    if (!vault) return { state: 'demo' };
    const ref = this.published?.materials.get(id);
    if (!ref || this.published?.state === 'blocked') return { state: 'gone' };
    const settingsAt = await settingsPrint(this.settingsFile);
    if (JSON.stringify(await readSettings(this.settingsFile)) !== JSON.stringify(this.settings)) { void this.refresh(); return { state: 'changed' }; }
    const policy = await loadPolicy(vault, this.settings.routerPath);
    // Vault unreachable (disconnected) is 'offline'; rules that cannot be verified (blocked, no router) are 'blocked' and no body is opened
    if (!policy.ok) { void this.refresh(); return { state: policy.state === 'unavailable' ? 'offline' : 'blocked' }; }
    const { priv, roots, vaultReal } = policy;
    const hidden = (rel: string) => isPolicyPath(rel) || isPrivate(rel, priv) || isSecretPath(rel);
    if (hidden(ref.rel)) { void this.refresh(); return { state: 'private' }; }
    if (!PREVIEW_EXT.test(ref.rel)) return { state: 'unsupported' };
    const root = ref.rel.split('/')[0];
    if (this.settings.structure !== 'workspace' && !roots.includes(root)) return { state: 'unregistered' };
    const reals = await rootReals(vault, roots);
    const rootReal = reals.get(root);
    if (roots.includes(root) && !rootReal) return { state: 'root-unavailable' };
    // I/O failures by kind: only ENOENT/ENOTDIR is 'missing', permission is 'denied', anything else is 'read-error' (not assumed deleted)
    let failed: PreviewState = 'missing';
    const fail = (e: unknown) => { const k = ioKind(e); failed = k === 'missing' ? 'missing' : k === 'denied' ? 'denied' : 'read-error'; return null; };
    const real = await withTimeout(fsp.realpath(path.join(vault, ref.rel)).catch(fail), PREVIEW_TIMEOUT);
    if (real === 'timeout') return { state: 'timeout' };
    if (!real) return { state: failed };
    if (!(this.settings.structure === 'workspace' && (real === vaultReal || real.startsWith(vaultReal + path.sep))) && ![...reals.values()].some(r => r && (real === r || real.startsWith(r + path.sep)))) return { state: 'outside' };
    if (aliasesOf(real, reals, vaultReal).some(hidden) || underPrivate(real, policy.privReals)) { void this.refresh(); return { state: 'private' }; }
    if (policy.print !== this.published?.policy) { void this.refresh(); return { state: 'changed' }; }
    const st = await withTimeout(fsp.stat(real).catch(fail), PREVIEW_TIMEOUT);
    if (st === 'timeout') return { state: 'timeout' };
    if (!st) return { state: failed };
    if (!st.isFile()) return { state: 'not-file' };
    if (st.size > PREVIEW_MAX_BYTES) return { state: 'too-large', bytes: st.size };
    const buf = await withTimeout(fsp.readFile(real).catch(fail), PREVIEW_TIMEOUT);
    if (buf === 'timeout') return { state: 'timeout' };
    if (!buf) return { state: failed };
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return { state: 'not-text' }; }
    const body = makeRedactor(priv)(text);
    await this.opts.beforePreviewReturn?.();
    // Pre-return check: if settings or private policy changed while reading, or the material left the published snapshot, do not return the body
    const latest = await loadPolicy(vault, this.settings.routerPath);
    if (await settingsPrint(this.settingsFile) !== settingsAt || latest.print !== policy.print || !this.published?.materials.has(id)) {
      void this.refresh();
      return { state: 'changed' };
    }
    return { state: 'ok', body, bytes: buf.length };
  }
}
