// Presentation-only "stale" tinting (AC46). This is a UI concern, not domain
// logic, so it lives alongside the components rather than in `lib/domain`.

export const STALE_THRESHOLDS = {
  /** Subtle orange tint once an active block has run this long. */
  warnMs: 4 * 60 * 60 * 1000,
  /** Subtle red tint + small badge once an active block has run this long. */
  dangerMs: 24 * 60 * 60 * 1000,
} as const;

export type StaleLevel = 'none' | 'warn' | 'danger';

export function staleLevel(elapsedMs: number): StaleLevel {
  if (elapsedMs >= STALE_THRESHOLDS.dangerMs) return 'danger';
  if (elapsedMs >= STALE_THRESHOLDS.warnMs) return 'warn';
  return 'none';
}
