// Central application store: the single dispatch gate in front of the pure
// domain reducer (D3/D6/D7). Responsibilities:
//   - domain actions  → push an undo snapshot, apply, schedule a debounced save
//   - view-state actions (collapse/theme) → apply + save, but BYPASS undo
//   - undo()          → pop a snapshot, restore, schedule a save
//   - flush()         → force the pending debounced save synchronously (on close)
//
// State is a `svelte/store` writable so it is framework-agnostic (works in
// Vitest) and consumable in Svelte 5 components via `$appState`. It is exposed
// as `appState` (not `state`) to avoid clashing with the Svelte 5 `$state` rune.

import { writable, get, type Readable } from 'svelte/store';
import {
  applyAction,
  isViewStateAction,
  createEmptyState,
  createUndoStack,
  pushUndo,
  popUndo,
  canUndo as stackCanUndo,
  type Action,
  type AppState,
  type UndoStack,
} from './domain';
import type { Platform } from './platform';

/** Debounce window for auto-save after a mutation (AC31). */
export const DEFAULT_DEBOUNCE_MS = 500;

export interface TaskStore {
  /** Reactive application state (subscribe with `$appState`). */
  readonly appState: Readable<AppState>;
  /** Reactive flag: is there anything to undo? */
  readonly canUndo: Readable<boolean>;
  /** Apply a domain or view-state action through the gate. */
  dispatch(action: Action): void;
  /** Undo the most recent domain action (no-op when the stack is empty). */
  undo(): void;
  /** Force any pending debounced save to run now (used on window close). */
  flush(): Promise<void>;
  /** Load persisted state at startup (does not affect the undo stack). */
  load(): Promise<void>;
  /** Export the current state as JSON via the platform. */
  exportJson(): Promise<void>;
  /** Import state from a user-chosen JSON file (undoable). */
  importJson(): Promise<void>;
}

export interface StoreOptions {
  debounceMs?: number;
}

export function createTaskStore(platform: Platform, options: StoreOptions = {}): TaskStore {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  const appState = writable<AppState>(createEmptyState());
  const canUndoStore = writable<boolean>(false);
  let undoStack: UndoStack = createUndoStack();

  const syncCanUndo = () => canUndoStore.set(stackCanUndo(undoStack));

  // --- debounced persistence -------------------------------------------------
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let saveDirty = false;

  const persistNow = async (): Promise<void> => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!saveDirty) return;
    saveDirty = false;
    await platform.saveState(JSON.stringify(get(appState)));
  };

  const schedulePersist = () => {
    saveDirty = true;
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void persistNow();
    }, debounceMs);
  };

  // --- dispatch gate ---------------------------------------------------------
  const dispatch = (action: Action): void => {
    const current = get(appState);
    const next = applyAction(current, action);
    // The reducer returns the SAME reference for a rejected/guarded no-op;
    // skip snapshotting and persisting in that case.
    if (next === current) return;

    if (!isViewStateAction(action)) {
      // Domain action: snapshot the pre-mutation state for undo.
      undoStack = pushUndo(undoStack, current);
      syncCanUndo();
    }
    appState.set(next);
    schedulePersist();
  };

  const undo = (): void => {
    const { stack, state } = popUndo(undoStack);
    if (state === null) return;
    undoStack = stack;
    syncCanUndo();
    appState.set(state);
    schedulePersist();
  };

  const flush = (): Promise<void> => persistNow();

  const load = async (): Promise<void> => {
    const json = await platform.loadState();
    if (!json) return;
    try {
      const parsed = JSON.parse(json) as AppState;
      appState.set(parsed);
    } catch {
      // Corrupt payload: the persist layer already handles recovery/backup, so
      // here we simply keep the fresh empty state.
    }
  };

  const exportJson = async (): Promise<void> => {
    await platform.exportJson(JSON.stringify(get(appState)));
  };

  const importJson = async (): Promise<void> => {
    const json = await platform.importJson();
    if (!json) return;
    try {
      const parsed = JSON.parse(json) as AppState;
      // Route through dispatch so the import is a single undoable action.
      dispatch({ type: 'importState', state: parsed });
    } catch {
      // Ignore an unparseable import; leave current state untouched.
    }
  };

  return {
    appState: { subscribe: appState.subscribe },
    canUndo: { subscribe: canUndoStore.subscribe },
    dispatch,
    undo,
    flush,
    load,
    exportJson,
    importJson,
  };
}
