// Left/right placement for scene labels. Near the screen center line the previous side is kept so
// floating-point error in projected coordinates (e.g. 873.9999… ↔ 874.0000…) or tiny jitter doesn't flip sides.

/** Dead band width on each side of the center line (px): no side change inside it */
export const LABEL_SIDE_BAND = 24;

/** true = right of the node, false = left. prev is the node's previous side (undefined the first time) */
export function labelSide(x: number, mid: number, prev: boolean | undefined, band = LABEL_SIDE_BAND): boolean {
  if (prev === undefined || Math.abs(x - mid) >= band) return x >= mid;
  return prev;
}

// ── Temporal stabilization: brief overlaps while rotating shouldn't hide a label for a frame or two or flip its side ──

/** Minimum hold time (ms): free spot must last before showing; overlapped label holds this long */
export const LABEL_HOLD_MS = 250;
/** Minimum time (ms) after a side change (or first show) before changing again. Inside it the label holds or hides (prevents quick flips) */
export const LABEL_SIDE_LOCK_MS = 1000;

/** 0 = free, 1 = overlaps another label (may hold briefly), 2 = can't place (off screen/safe area, toolbar, router assembly — move away now) */
export type LabelBlock = 0 | 1 | 2;

export interface LabelHold {
  /** Currently shown */
  shown: boolean;
  /** Last shown side (true = right) */
  side: boolean;
  /** When the shown side last changed (or first showed). Unchanged if it reappears on the same side (−∞ if never shown) */
  movedAt: number;
  /** When it started holding while overlapped (0 = no overlap) */
  clashAt: number;
  /** When a free spot first appeared for a hidden label (0 = no spot) */
  freeAt: number;
}

/** hold = still moving (temporal stabilization), show = new labels don't wait (right after labels on, select, hover, data or resize), settle = motion stopped (no wait, hold or lock) */
export type LabelPace = 'hold' | 'show' | 'settle';

/**
 * One label's spot this frame. side = side to show (null = hidden), wait = waiting for a free spot to last the hold time.
 * - want: left/right decision (the previous side unless it crossed the center line)
 * - pace: LabelPace above
 * Off screen, hidden, deleted, private, source switch and labels off never reach here; the caller clears them directly.
 */
export function holdLabel(prev: LabelHold | undefined, want: boolean, block: (side: boolean) => LabelBlock, now: number, pace: LabelPace, hold = LABEL_HOLD_MS, lock = LABEL_SIDE_LOCK_MS): { side: boolean | null; wait: boolean; next: LabelHold } {
  const settle = pace === 'settle';
  // May change side: first time, motion stopped, or the lock time passed since the last side change
  const free = !prev || settle || now - prev.movedAt >= lock;
  const show = (side: boolean) => ({ side, wait: false, next: { shown: true, side, movedAt: prev && prev.side === side && Number.isFinite(prev.movedAt) ? prev.movedAt : now, clashAt: 0, freeAt: 0 } });
  const hide = (freeAt = 0) => ({ side: null, wait: freeAt > 0, next: { shown: false, side: prev?.side ?? want, movedAt: prev?.movedAt ?? -Infinity, clashAt: 0, freeAt } });
  if (prev?.shown) {
    const s = prev.side;
    // Crossed the center line so the wanted side changed: move once (after the lock time)
    if (want !== s && free && block(want) === 0) return show(want);
    const here = block(s);
    if (here === 0) return show(s);
    // Only overlapping another label: hold in place for the hold time (don't hide or flip for an overlap that clears soon)
    if (here === 1 && !settle) {
      const clashAt = prev.clashAt || now;
      if (now - clashAt < hold) return { side: s, wait: false, next: { ...prev, clashAt } };
    }
    // Long overlap or unplaceable spot (immediately): move once if the lock passed and the other side is free, else hide
    if (free && block(!s) === 0) return show(!s);
    return hide();
  }
  // Hidden label: within the lock time it reappears only on its last side (reappearing on the other side is a side change too)
  const options = free ? [want, !want] : [prev!.side];
  const side = options.find(o => block(o) === 0);
  if (side === undefined) return hide();
  // Show only if the free spot lasts the hold time (no flashing into a spot open for a frame or two)
  const freeAt = prev?.freeAt || now;
  if (pace !== 'hold' || now - freeAt >= hold) return show(side);
  return hide(freeAt);
}
