import { describe, it, expect } from 'vitest';
import type { Block } from '../../src/lib/domain';
import { elapsedMs, formatElapsed } from '../../src/lib/domain';

function block(partial: Partial<Block>): Block {
  return {
    id: 'x',
    text: 'x',
    createdAt: 0,
    parentId: null,
    workUnitId: 'w',
    order: 0,
    status: 'active',
    accumulatedHeldMs: 0,
    collapsed: false,
    ...partial,
  };
}

describe('timer.elapsedMs', () => {
  it('active block tracks now', () => {
    const blk = block({ createdAt: 1000 });
    expect(elapsedMs(blk, 4000)).toBe(3000);
  });

  it('subtracts accumulated held time', () => {
    const blk = block({ createdAt: 1000, accumulatedHeldMs: 500 });
    expect(elapsedMs(blk, 4000)).toBe(2500);
  });

  it('held block freezes at heldAt regardless of now', () => {
    const blk = block({ createdAt: 1000, status: 'held', heldAt: 5000 });
    expect(elapsedMs(blk, 9999)).toBe(4000);
    expect(elapsedMs(blk, 1_000_000)).toBe(4000);
  });

  it('clamps negative results to 0', () => {
    const blk = block({ createdAt: 5000 });
    expect(elapsedMs(blk, 1000)).toBe(0);
  });
});

describe('timer.formatElapsed', () => {
  it('formats HH:MM:SS with two-digit padding', () => {
    expect(formatElapsed(0)).toBe('00:00:00');
    expect(formatElapsed(1000)).toBe('00:00:01');
    expect(formatElapsed(61_000)).toBe('00:01:01');
    expect(formatElapsed(3_723_000)).toBe('01:02:03');
  });

  it('lets hours grow past 24 with no day rollover (D10)', () => {
    // 72h 15m 3s
    const ms = (72 * 3600 + 15 * 60 + 3) * 1000;
    expect(formatElapsed(ms)).toBe('72:15:03');
  });
});
