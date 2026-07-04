import { describe, it, expect, vi, afterEach } from 'vitest';
import { createClock } from '../../src/lib/ui/clock';
import type { Platform } from '../../src/lib/platform';

/** Platform mock that lets the test drive visibility transitions. */
function visibilityPlatform(): { platform: Platform; setVisible: (v: boolean) => void } {
  let cb: (visible: boolean) => void = () => {};
  const platform: Platform = {
    loadState: vi.fn().mockResolvedValue(null),
    saveState: vi.fn().mockResolvedValue(undefined),
    exportJson: vi.fn().mockResolvedValue(undefined),
    importJson: vi.fn().mockResolvedValue(null),
    onVisibilityChange: (fn) => {
      cb = fn;
      return () => {};
    },
    onCloseRequested: vi.fn(),
  };
  return { platform, setVisible: (v) => cb(v) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createClock (visibility-gated 1Hz tick)', () => {
  it('ticks while visible, stops while hidden, and recomputes immediately on restore', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const { platform, setVisible } = visibilityPlatform();
    const clock = createClock(platform, 1000);

    const values: number[] = [];
    const unsub = clock.now.subscribe((v) => values.push(v));

    // Advance one interval while visible → a tick lands. Note: advancing fake
    // timers also advances the mocked Date, so Date.now() becomes 2000.
    vi.advanceTimersByTime(1000);
    expect(values[values.length - 1]).toBe(2000);

    // Hidden: the interval is cleared → zero periodic work.
    setVisible(false);
    const countWhenHidden = values.length;
    vi.advanceTimersByTime(3000); // Date.now() → 5000, but no ticks fire
    expect(values.length).toBe(countWhenHidden);

    // Restored: recompute once immediately.
    setVisible(true);
    expect(values[values.length - 1]).toBe(5000);

    unsub();
    clock.destroy();
  });

  it('stops the interval when the last subscriber unsubscribes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const { platform } = visibilityPlatform();
    const clock = createClock(platform, 1000);

    const values: number[] = [];
    const unsub = clock.now.subscribe((v) => values.push(v));
    unsub(); // no subscribers left

    const countAfterUnsub = values.length;
    vi.setSystemTime(10_000);
    vi.advanceTimersByTime(5000);
    expect(values.length).toBe(countAfterUnsub); // no further ticks

    clock.destroy();
  });
});
