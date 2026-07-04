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
  validateAppState,
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

/** Outcome of loading persisted state at startup. */
export type LoadStatus = 'loaded' | 'empty' | 'invalid';

/** Outcome of importing a user-chosen JSON file. */
export type ImportStatus = 'imported' | 'cancelled' | 'invalid';

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
  /**
   * Load persisted state at startup (does not affect the undo stack). Returns a
   * status the UI can surface: 'loaded', 'empty' (nothing saved yet), or
   * 'invalid' (unparseable/failed schema — empty state kept, nothing persisted).
   */
  load(): Promise<LoadStatus>;
  /** Export the current state as JSON via the platform. */
  exportJson(): Promise<void>;
  /**
   * Import state from a user-chosen JSON file (undoable). Returns 'imported',
   * 'cancelled' (no file chosen), or 'invalid' (unparseable/failed schema —
   * current state left untouched).
   */
  importJson(): Promise<ImportStatus>;
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

  // Serialize ALL persistence through one promise chain so a debounced save and
  // a close-path flush can never run concurrently and clobber each other's
  // temp file on the Rust side (review finding #5).
  let persistChain: Promise<void> = Promise.resolve();

  // Log a persistent-save failure once per failure streak, resetting on the
  // next success — instead of silently swallowing it (review nit).
  let saveFailing = false;

  const clearSaveTimer = () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  };

  // Write the current state to the platform. Normal (debounced) writes use
  // saveState; the close-path flush uses flushState (D10) — functionally
  // identical on the Rust side, but a distinct command so the close-flush call
  // site is explicit. The write is appended to `persistChain` and the snapshot
  // JSON is captured now, so queued writes persist in dispatch order.
  const writeState = (useFlushCommand: boolean): Promise<void> => {
    clearSaveTimer();
    saveDirty = false;
    const json = JSON.stringify(get(appState));
    persistChain = persistChain.then(async () => {
      try {
        if (useFlushCommand) await platform.flushState(json);
        else await platform.saveState(json);
        saveFailing = false;
      } catch (err) {
        if (!saveFailing) {
          saveFailing = true;
          // eslint-disable-next-line no-console
          console.error('[taskStore] failed to persist state:', err);
        }
      }
    });
    return persistChain;
  };

  const schedulePersist = () => {
    saveDirty = true;
    clearSaveTimer();
    saveTimer = setTimeout(() => {
      if (saveDirty) void writeState(false);
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

    // View-state (theme, per-block collapsed) bypasses undo, but snapshots
    // captured it at push time. Re-apply the CURRENT view-state onto the
    // restored snapshot so undoing a domain action does not revert a theme or
    // collapse change made afterwards (review finding #4).
    const current = get(appState);
    state.theme = current.theme;
    const collapsedById = new Map(current.blocks.map((b) => [b.id, b.collapsed]));
    for (const b of state.blocks) {
      const collapsed = collapsedById.get(b.id);
      if (collapsed !== undefined) b.collapsed = collapsed;
    }

    appState.set(state);
    schedulePersist();
  };

  // Force a flush of the latest state on the close path (D10). Writes
  // unconditionally via flushState so nothing from the last debounce window is
  // lost, and cancels any pending debounced save.
  const flush = (): Promise<void> => writeState(true);

  const load = async (): Promise<LoadStatus> => {
    const json = await platform.loadState();
    if (!json) return 'empty';

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[taskStore] persisted state is not valid JSON; keeping empty state:', err);
      return 'invalid';
    }

    const validated = validateAppState(parsed);
    if (!validated) {
      // eslint-disable-next-line no-console
      console.error('[taskStore] persisted state failed schema validation; keeping empty state');
      return 'invalid';
    }

    // Only set on success — never overwrite with, or persist, garbage.
    appState.set(validated);
    return 'loaded';
  };

  const exportJson = async (): Promise<void> => {
    await platform.exportJson(JSON.stringify(get(appState)));
  };

  const importJson = async (): Promise<ImportStatus> => {
    const json = await platform.importJson();
    if (!json) return 'cancelled';

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[taskStore] import is not valid JSON; state unchanged:', err);
      return 'invalid';
    }

    const validated = validateAppState(parsed);
    if (!validated) {
      // eslint-disable-next-line no-console
      console.error('[taskStore] import failed schema validation; state unchanged');
      return 'invalid';
    }

    // Route through dispatch so the import is a single undoable action; the
    // reducer re-validates as a second guard.
    dispatch({ type: 'importState', state: validated });
    return 'imported';
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
