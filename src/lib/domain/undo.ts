// Session-only undo as a snapshot ring buffer. Each domain action pushes a deep
// clone of the pre-mutation state; a soft cap bounds RAM on multi-day sessions
// while staying effectively unlimited for human use (D6, AC35).

import type { AppState } from './types';

/** Soft cap on retained snapshots (documented deviation from "unlimited"). */
export const UNDO_CAP = 500;

export interface UndoStack {
  /** Oldest → newest snapshots of state taken before each domain action. */
  snapshots: AppState[];
  /** Maximum retained snapshots; the oldest is evicted past this. */
  cap: number;
}

export function createUndoStack(cap: number = UNDO_CAP): UndoStack {
  return { snapshots: [], cap };
}

/**
 * Push a deep clone of `state`. Returns a new stack; when the cap is exceeded
 * the oldest snapshot is dropped (ring-buffer eviction).
 */
export function pushUndo(stack: UndoStack, state: AppState): UndoStack {
  const snapshots = [...stack.snapshots, structuredClone(state)];
  if (snapshots.length > stack.cap) {
    snapshots.splice(0, snapshots.length - stack.cap);
  }
  return { snapshots, cap: stack.cap };
}

/**
 * Pop the most recent snapshot. Returns the restored state (or null when the
 * stack is empty) alongside the shortened stack.
 */
export function popUndo(stack: UndoStack): {
  stack: UndoStack;
  state: AppState | null;
} {
  if (stack.snapshots.length === 0) {
    return { stack, state: null };
  }
  const snapshots = stack.snapshots.slice();
  const state = snapshots.pop()!;
  return { stack: { snapshots, cap: stack.cap }, state };
}

export function canUndo(stack: UndoStack): boolean {
  return stack.snapshots.length > 0;
}
