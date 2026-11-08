// 실제 볼트 연결 서비스(Node 서버 전용, 읽기 전용): 설정 읽기 · 스냅숏 게시 · 변경 감시 · 미리보기.
// - 게시 직전 정책(라우터 · 장부 지문)과 세대를 다시 확인해, 만드는 사이 정책이 바뀐 결과는 게시하지 않는다.
// - 비공개 규칙 실패 · 설정 오류 · 볼트 변경 때는 이전 결과를 버린다. 볼트에 닿지 못할 때만 마지막 검증 결과를 '끊김'으로 유지한다.
// - 응답 · 로그에는 상대경로와 일반 문구만 쓴다.
import { createHash } from 'node:crypto';
import { watch as fsWatch, promises as fsp } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import path from 'node:path';
import { isPrivate, isSecretPath, makeRedactor } from './privacy';
import { aliasesOf, empty, ioKind, loadPolicy, underPrivate, readSnapshot, rootReals, toPublic, withTimeout } from './vault-reader';
import type { Snapshot } from './vault-reader';

export const PREVIEW_MAX_BYTES = 512 * 1024, PREVIEW_TIMEOUT = 4000;
const PREVIEW_EXT = /\.(md|markdown|txt)$/i;

export type PreviewState = 'ok' | 'changed' | 'gone' | 'private' | 'blocked' | 'unsupported' | 'unregistered' | 'root-unavailable' | 'missing'
  | 'denied' | 'read-error' | 'offline' | 'outside' | 'not-file' | 'too-large' | 'timeout' | 'not-text' | 'demo';
export interface Preview { state: PreviewState; body?: string; bytes?: number }

interface Settings { vaultPath: string | null; error: string | null }

async function readSettings(file: string): Promise<Settings> {
  let text: string;
  try { text = await fsp.readFile(file, 'utf8'); } catch { return { vaultPath: null, error: null }; }
  try {
    const value = JSON.parse(text) as { vaultPath?: unknown };
    if (typeof value.vaultPath !== 'string' || !value.vaultPath.trim()) return { vaultPath: null, error: null };
    if (!path.isAbsolute(value.vaultPath)) return { vaultPath: null, error: 'settings.json의 vaultPath는 절대경로여야 합니다' };
    return { vaultPath: path.normalize(value.vaultPath), error: null };
  } catch { return { vaultPath: null, error: 'settings.json을 해석할 수 없습니다' }; }
}

async function settingsPrint(file: string): Promise<string> {
  try { return createHash('sha256').update(await fsp.readFile(file)).digest('hex'); } catch { return 'none'; }
}

export interface ServiceOptions {
  pollMs?: number;
  debounceMs?: number;
  /** 시험용: 스냅숏을 만든 뒤 게시하기 직전에 부른다 */
  beforePublish?: () => Promise<void> | void;
  /** 시험용: 미리보기 본문을 읽은 뒤 돌려주기 직전에 부른다 */
  beforePreviewReturn?: () => Promise<void> | void;
}

export class VaultService {
  private settings: Settings = { vaultPath: null, error: null };
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

  /** 설정 · 볼트 식별값(경로를 드러내지 않는 해시): 바뀌면 화면은 이전 실제 데이터를 모두 버린다 */
  private get vaultKey() { return this.settings.vaultPath ? createHash('sha256').update(this.settings.vaultPath).digest('hex').slice(0, 12) : null; }

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

  /** 변경 감지 뒤 짧게 모아서 다시 만든다 */
  schedule() {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => { void this.refresh(); }, this.opts.debounceMs ?? 300);
  }

  /** 다시 만들기(겹쳐 부르면 진행 중인 것이 끝난 뒤 한 번 더) */
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
      const snap = await readSnapshot(vault);
      await this.opts.beforePublish?.();
      if (gen !== this.generation) return; // 더 새로운 갱신이 시작됨
      // 게시 직전 확인: 설정이 바뀌었으면 처음부터 다시(볼트가 바뀌었을 수 있음), 정책이 바뀌었으면 다시 만든다
      if (await settingsPrint(this.settingsFile) !== settingsAt) { this.again = true; return; }
      const now = await loadPolicy(vault);
      if (now.print !== snap.policy) continue;
      this.publish(snap);
      return;
    }
    this.publish(empty('blocked', '비공개 규칙이 계속 바뀌는 중이라 게시를 미뤘습니다'));
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
    if (vault) { out.add(vault); out.add(path.join(vault, '.secondbrain')); }
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
        w.on('error', () => { /* 폴더가 사라지면 주기 확인이 이어 받는다 */ });
        this.watchers.push(w);
      } catch { /* 없는 폴더: 주기 확인 */ }
    }
  }

  /** 주기 확인용 지문: 설정 · 라우터 · 장부 · 안내 문서 · 볼트 폴더의 수정 시각 · 크기 */
  private async fingerprint(): Promise<string> {
    const files = [this.settingsFile, ...(this.settings.vaultPath ? [this.settings.vaultPath, path.join(this.settings.vaultPath, 'CLAUDE.md'), path.join(this.settings.vaultPath, '.secondbrain', 'private-paths.txt')] : []),
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
      mode, version: this.version, vaultKey: this.vaultKey,
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

  /** 미리보기: 불투명 ID만 받는다. 매 요청 최신 비공개 규칙 · 등록 루트 · 실경로를 다시 확인한다 */
  async preview(id: string): Promise<Preview> {
    const vault = this.settings.vaultPath;
    if (!vault) return { state: 'demo' };
    const ref = this.published?.materials.get(id);
    if (!ref || this.published?.state === 'blocked') return { state: 'gone' };
    const settingsAt = await settingsPrint(this.settingsFile);
    const policy = await loadPolicy(vault);
    // 볼트 자체에 닿지 못함(끊김)은 'offline', 규칙을 확인할 수 없는 경우(차단 · 라우터 없음)는 본문을 열지 않는 'blocked'
    if (!policy.ok) { void this.refresh(); return { state: policy.state === 'unavailable' ? 'offline' : 'blocked' }; }
    const { priv, roots, vaultReal } = policy;
    const hidden = (rel: string) => isPrivate(rel, priv) || isSecretPath(rel);
    if (hidden(ref.rel)) { void this.refresh(); return { state: 'private' }; }
    if (!PREVIEW_EXT.test(ref.rel)) return { state: 'unsupported' };
    const root = ref.rel.split('/')[0];
    if (!roots.includes(root)) return { state: 'unregistered' };
    const reals = await rootReals(vault, roots);
    const rootReal = reals.get(root);
    if (!rootReal) return { state: 'root-unavailable' };
    // 입출력 실패는 종류별로: 없음(ENOENT · ENOTDIR)만 'missing', 권한은 'denied', 그 밖은 'read-error'(삭제로 단정하지 않음)
    let failed: PreviewState = 'missing';
    const fail = (e: unknown) => { const k = ioKind(e); failed = k === 'missing' ? 'missing' : k === 'denied' ? 'denied' : 'read-error'; return null; };
    const real = await withTimeout(fsp.realpath(path.join(vault, ref.rel)).catch(fail), PREVIEW_TIMEOUT);
    if (real === 'timeout') return { state: 'timeout' };
    if (!real) return { state: failed };
    if (![...reals.values()].some(r => r && (real === r || real.startsWith(r + path.sep)))) return { state: 'outside' };
    if (aliasesOf(real, reals, vaultReal).some(hidden) || underPrivate(real, policy.privReals)) { void this.refresh(); return { state: 'private' }; }
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
    // 반환 직전 확인: 읽는 사이 설정 · 비공개 정책이 바뀌었거나 자료가 게시본에서 빠졌으면 이전 본문을 돌려주지 않는다
    const latest = await loadPolicy(vault);
    if (await settingsPrint(this.settingsFile) !== settingsAt || latest.print !== policy.print || !this.published?.materials.has(id)) {
      void this.refresh();
      return { state: 'changed' };
    }
    return { state: 'ok', body, bytes: buf.length };
  }
}
