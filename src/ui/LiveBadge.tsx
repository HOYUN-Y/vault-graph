// Data source · real vault connection status and manual refresh. Never shows paths or names.
import type { LiveGraph } from '../data/live';

const time = (t: number | null) => (t ? new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—');

/** End the server's reason text with a period so it doesn't run into the next sentence */
const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/** short: header tag, tiny: short tag for a narrow header (≤1100px; keeps status · reference time), long: legend · alerts */
export interface LiveView { tone: 'demo' | 'ok' | 'warn' | 'bad'; short: string; tiny: string; long: string }

/** Status text: short tag (header) and long description (legend · alerts) */
/** pending: waiting for the first response (shows 'Checking' so demo values never pass for real ones, even briefly) */
export function liveView(live: LiveGraph | null, realMode: boolean, synthetic: string | null, pending = false): LiveView {
  if (pending && !synthetic) return CHECKING;
  if (synthetic) return { tone: 'demo', short: synthetic, tiny: 'Synthetic', long: `${synthetic}. Not related to any real vault.` };
  if (!live || live.mode === 'demo') return { tone: 'demo', short: 'Demo data', tiny: 'Demo', long: 'No real vault connected: settings.json has no vaultPath, or the page was opened with ?demo=1.' };
  if (live.state === 'connected' && realMode) return { tone: 'ok', short: `Real vault · read-only · ${time(live.updatedAt)}`, tiny: `Real · ${time(live.updatedAt)}`, long: `Connected to the real vault read-only. Last updated ${time(live.updatedAt)}; changes are applied automatically.` };
  if (live.state === 'unavailable' && realMode) return { tone: 'warn', short: `Disconnected · as of ${time(live.updatedAt)}`, tiny: `Offline · ${time(live.updatedAt)}`, long: `The vault is unreachable, so the view verified at ${time(live.updatedAt)} is shown. Nothing is treated as deleted, and it refreshes automatically once reachable.` };
  if (live.state === 'blocked') return { tone: 'bad', short: 'Real vault blocked · showing demo', tiny: 'Blocked · demo', long: `${sentence(live.reason ?? 'Private rules could not be checked, so real data was blocked')} Real materials are hidden and the synthetic demo is shown.` };
  if (live.state === 'invalid') return { tone: 'bad', short: 'Vault settings error · showing demo', tiny: 'Settings error · demo', long: `${sentence(live.reason ?? 'The settings could not be parsed')} Showing the synthetic demo.` };
  if (live.state === 'unavailable') return { tone: 'warn', short: 'Vault unreachable · showing demo', tiny: 'Unreachable · demo', long: `${sentence(live.reason ?? 'The vault folder cannot be accessed')} No verified real view exists, so the synthetic demo is shown.` };
  return CHECKING;
}
const CHECKING: LiveView = { tone: 'warn', short: 'Checking real vault connection', tiny: 'Checking', long: 'Checking the real vault connection.' };

export function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M3 3h7v2H5v6h6V8h2v5H3V3zm8-1h3v3h-2V4h-1V2z" fill="currentColor" />
    </svg>
  );
}

export function LiveBadge({ view, canRefresh, refreshing, onRefresh }: { view: LiveView; canRefresh: boolean; refreshing: boolean; onRefresh(): void }) {
  return (
    <span className={`live live--${view.tone}`}>
      <span className="live__dot" aria-hidden="true" />
      <span className="live__text" title={view.long}><span className="live__full">{view.short}</span><span className="live__tiny">{view.tiny}</span></span>
      {canRefresh && (
        <button type="button" className="live__refresh" onClick={onRefresh} disabled={refreshing} aria-label="Reread real vault" title="Reread real vault">
          <RefreshIcon />
        </button>
      )}
    </span>
  );
}
