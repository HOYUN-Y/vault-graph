// Real vault connection (browser side): calls only the same-origin local read-only API. Sends no path arguments, only opaque IDs.
import type { VaultFile } from '../core/vault';

export type LiveState = 'demo' | 'connecting' | 'connected' | 'unavailable' | 'blocked' | 'invalid';

export interface LiveStatus {
  mode: 'demo' | 'real';
  version: number;
  /** Vault identifier (not a path). When it changes, previous real data · open body · search are all discarded */
  vaultKey: string | null;
  /** Structure from settings.json: indexed · workspace. Only workspace mode starts with folded clusters */
  structure?: 'indexed' | 'workspace';
  state: LiveState;
  reason: string | null;
  /** The vault is unreachable, so the last verified view is shown */
  stale: boolean;
  updatedAt: number | null;
  checkedAt: number | null;
  counts: { guides: number; materials: number; links: number; roots: number; privateRules: number; hiddenLinks: number; problems: number } | null;
  roots: number;
  problems: string[];
}

export interface LiveGraph extends LiveStatus {
  files: VaultFile[];
  /** Material ID → metadata check result (ok · missing · unreachable · outside · denied · error · unchecked) */
  meta: Record<string, string>;
}

export type PreviewState = 'loading' | 'ok' | 'changed' | 'gone' | 'private' | 'blocked' | 'unsupported' | 'unregistered' | 'root-unavailable'
  | 'missing' | 'denied' | 'read-error' | 'offline' | 'outside' | 'not-file' | 'too-large' | 'timeout' | 'not-text' | 'demo' | 'error';
export interface Preview { state: PreviewState; body?: string; bytes?: number }

async function get<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin', ...init }); // the server responds with Cache-Control: no-store
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

export const fetchStatus = () => get<LiveStatus>('/api/vault/status');
export const fetchGraph = () => get<LiveGraph>('/api/vault/graph');
export const requestRefresh = () => get<LiveStatus>('/api/vault/refresh', { method: 'POST' });
export async function fetchPreview(id: string): Promise<Preview> {
  return (await get<Preview>(`/api/vault/doc/${encodeURIComponent(id)}`)) ?? { state: 'error' };
}

/** Preview status messages shown to the user (no paths or names) */
export const PREVIEW_MESSAGE: Record<PreviewState, string> = {
  loading: 'Reading the source file…',
  ok: '',
  changed: 'The vault settings or private rules changed while reading, so the body is not shown. Please select it again.',
  gone: 'This item is no longer in the index.',
  private: 'A private rule applies, so the body is not opened.',
  blocked: 'Private rules could not be checked, so the body is not opened.',
  unsupported: 'No body preview for this format (Markdown and text only). Showing the index description only.',
  unregistered: 'This external folder is not registered in the router, so the body is not opened.',
  'root-unavailable': 'Could not reach the external material folder. The drive may be off or offline (not treated as deleted).',
  missing: 'The source file is missing. It may have been moved or deleted.',
  denied: 'No permission to read the source file (file or folder permissions). Not treated as deleted.',
  'read-error': 'An I/O error occurred while reading the source file. Select it again in a moment (not treated as deleted).',
  offline: 'The vault connection dropped, so the source file could not be read. It refreshes automatically once reachable (not treated as deleted).',
  outside: 'The source file points outside the allowed workspace and registered external folders, so it is not opened.',
  'not-file': 'This is a folder or special file, so there is no body.',
  'too-large': 'The file is too large (over 512 KB), so the preview was skipped.',
  timeout: 'The source file could not be read in time. It may be an online-only file, or the drive may be slow.',
  'not-text': 'Not UTF-8 text, so the preview was skipped.',
  demo: '',
  error: 'Could not load the preview. Please check the connection.'
};
