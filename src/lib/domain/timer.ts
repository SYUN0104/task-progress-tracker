// Wall-clock-derived elapsed time. There is no running clock in the domain:
// elapsed is always computed from timestamps, so it survives app restarts.

import type { Block } from './types';

/**
 * Elapsed working time of a block in milliseconds.
 *
 *   elapsed = (heldAt ?? now) - createdAt - accumulatedHeldMs
 *
 * While held, the end bound is frozen at `heldAt`; while active it tracks `now`.
 * `accumulatedHeldMs` excludes time already spent in previous hold cycles, so
 * resuming continues from the frozen value. Clamped at 0.
 */
export function elapsedMs(block: Block, now: number): number {
  const end = block.heldAt ?? now;
  const raw = end - block.createdAt - block.accumulatedHeldMs;
  return raw > 0 ? raw : 0;
}

/**
 * Format milliseconds as HH:MM:SS. Hours are never rolled over into days, so a
 * long-lived block reads e.g. `72:15:03` (D10). Minutes/seconds are always two
 * digits; hours are at least two.
 */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
