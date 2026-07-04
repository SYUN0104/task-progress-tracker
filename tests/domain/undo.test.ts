import { describe, it, expect } from 'vitest';
import {
  createEmptyState,
  createUndoStack,
  pushUndo,
  popUndo,
  canUndo,
  UNDO_CAP,
  type AppState,
} from '../../src/lib/domain';

function stateWithTheme(theme: 'dark' | 'light'): AppState {
  const s = createEmptyState();
  s.theme = theme;
  return s;
}

describe('undo ring buffer', () => {
  it('push/pop round-trips a snapshot', () => {
    let stack = createUndoStack();
    expect(canUndo(stack)).toBe(false);

    stack = pushUndo(stack, stateWithTheme('dark'));
    expect(canUndo(stack)).toBe(true);

    const { stack: after, state } = popUndo(stack);
    expect(state?.theme).toBe('dark');
    expect(canUndo(after)).toBe(false);
  });

  it('pop on an empty stack returns null', () => {
    const { state } = popUndo(createUndoStack());
    expect(state).toBeNull();
  });

  it('snapshots are deep clones, isolated from later mutation', () => {
    const live = createEmptyState();
    const stack = pushUndo(createUndoStack(), live);
    live.theme = 'light';
    live.workUnits.push({ id: 'w', order: 0 });

    const { state } = popUndo(stack);
    expect(state?.theme).toBe('dark');
    expect(state?.workUnits).toEqual([]);
  });

  it('evicts the oldest snapshot past the cap', () => {
    let stack = createUndoStack(3);
    for (let i = 0; i < 5; i++) {
      const s = createEmptyState();
      s.workUnits.push({ id: `w${i}`, order: i });
      stack = pushUndo(stack, s);
    }
    // Only the last 3 (w2, w3, w4) survive.
    expect(stack.snapshots.length).toBe(3);
    expect(stack.snapshots.map((s) => s.workUnits[0].id)).toEqual([
      'w2',
      'w3',
      'w4',
    ]);
  });

  it('default cap is 500 and holds effectively unlimited history', () => {
    let stack = createUndoStack();
    for (let i = 0; i < UNDO_CAP + 100; i++) {
      stack = pushUndo(stack, createEmptyState());
    }
    expect(stack.snapshots.length).toBe(UNDO_CAP);
  });
});
