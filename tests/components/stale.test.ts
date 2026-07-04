import { describe, it, expect } from 'vitest';
import { STALE_THRESHOLDS, staleLevel } from '../../src/lib/components/stale';

describe('stale.staleLevel', () => {
  it('is "none" well below the warn threshold', () => {
    expect(staleLevel(0)).toBe('none');
    expect(staleLevel(STALE_THRESHOLDS.warnMs - 1)).toBe('none');
  });

  it('reaches "warn" exactly at the warn threshold and stays warn up to (not including) danger', () => {
    expect(staleLevel(STALE_THRESHOLDS.warnMs)).toBe('warn');
    expect(staleLevel(STALE_THRESHOLDS.warnMs + 1)).toBe('warn');
    expect(staleLevel(STALE_THRESHOLDS.dangerMs - 1)).toBe('warn');
  });

  it('reaches "danger" exactly at the danger threshold and beyond', () => {
    expect(staleLevel(STALE_THRESHOLDS.dangerMs)).toBe('danger');
    expect(staleLevel(STALE_THRESHOLDS.dangerMs + 1)).toBe('danger');
    expect(staleLevel(STALE_THRESHOLDS.dangerMs * 10)).toBe('danger');
  });

  it('derives its tiers from the exported constants, not hardcoded ms values', () => {
    // Sanity-check the constants themselves so a future retuning of
    // STALE_THRESHOLDS is reflected here automatically instead of silently
    // diverging from the AC46 4h/24h intent.
    expect(STALE_THRESHOLDS.warnMs).toBe(4 * 60 * 60 * 1000);
    expect(STALE_THRESHOLDS.dangerMs).toBe(24 * 60 * 60 * 1000);
    expect(STALE_THRESHOLDS.dangerMs).toBeGreaterThan(STALE_THRESHOLDS.warnMs);
  });
});
