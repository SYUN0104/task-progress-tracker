// Pure domain types for the Task Progress Tracker.
//
// This module is DOM- and Tauri-free. Every timestamp (`now`) and every new
// entity id is supplied by the caller so the reducer stays fully deterministic
// and unit-testable (see actions.ts). No `Date.now()` lives inside the core.

/** Visual theme. Persisted, but treated as view-state (bypasses the undo stack). */
export type Theme = 'dark' | 'light';

/**
 * Lifecycle status of a block.
 * - `active`    — lives in the Active section, elapsed time keeps growing.
 * - `held`      — parked in the Hold section, elapsed frozen at `heldAt`.
 * - `completed` — archived; the whole completed subtree is preserved.
 */
export type BlockStatus = 'active' | 'held' | 'completed';

/** A note attached to a block (required title, optional body). */
export interface Annotation {
  title: string;
  body?: string;
}

/**
 * A single task block. Blocks form a forest via `parentId` (null = top-level
 * inside a WorkUnit column). Siblings are ordered by `order`.
 */
export interface Block {
  id: string;
  text: string;
  /** Wall-clock creation time (epoch ms). Elapsed is derived from this. */
  createdAt: number;
  /** Parent block id, or null for a column's top-level block. */
  parentId: string | null;
  /** The WorkUnit (column) this block currently lives in. */
  workUnitId: string;
  /** Sort key within the sibling group (same parentId + workUnitId). */
  order: number;
  status: BlockStatus;
  /** Set when status becomes `completed`. */
  completedAt?: number;
  /** Hold note (Hold section) or archive note (Archive section). */
  annotation?: Annotation;
  /** Timestamp the block was held; freezes elapsed. null/undefined when active. */
  heldAt?: number | null;
  /** Total time (ms) spent held across every resume cycle. */
  accumulatedHeldMs: number;
  /**
   * Id of the block that initiated the hold unit this block belongs to.
   * Enables nested-hold safety: an ancestor hold only stamps currently-active
   * descendants and never disturbs a descendant that was held on its own.
   */
  holdRootId?: string | null;
  /** View-state: whether the subtree is collapsed. Non-undoable. */
  collapsed: boolean;
}

/** A vertical column ("작업단위") that holds top-level blocks. */
export interface WorkUnit {
  id: string;
  name?: string;
  /** Horizontal display order (left → right). */
  order: number;
  color?: string;
  label?: string;
}

/** The single source of truth. Active/Hold/Archive are projections over this. */
export interface AppState {
  blocks: Block[];
  workUnits: WorkUnit[];
  theme: Theme;
}

/** How a dragged block is dropped relative to its target (see dnd/classify). */
export type MoveMode =
  | 'asChild' // nest under the target block
  | 'siblingBefore' // insert immediately before the target block
  | 'siblingAfter' // insert immediately after the target block
  | 'toColumnTopLevel'; // append as a top-level block of the target column

/**
 * The exhaustive set of state transitions. Domain actions push an undo
 * snapshot in the store; view-state actions (see VIEW_STATE_ACTIONS) do not.
 */
export type Action =
  // --- creation ---
  | { type: 'createBlock'; blockId: string; workUnitId: string; text: string; now: number }
  | { type: 'createChildBlock'; blockId: string; parentId: string; text: string; now: number }
  | { type: 'createWorkUnit'; workUnitId: string }
  // --- work unit (column) edits ---
  | { type: 'renameWorkUnit'; workUnitId: string; name: string }
  | { type: 'setWorkUnitStyle'; workUnitId: string; color?: string; label?: string }
  | { type: 'reorderWorkUnit'; workUnitId: string; toIndex: number }
  | { type: 'deleteEmptyWorkUnit'; workUnitId: string }
  // --- block structure ---
  | { type: 'moveBlock'; blockId: string; mode: MoveMode; targetId: string }
  | { type: 'editText'; blockId: string; text: string }
  // --- lifecycle ---
  | { type: 'complete'; blockId: string; now: number }
  | { type: 'hold'; blockId: string; annotation: Annotation; now: number }
  | { type: 'resume'; blockId: string; now: number; newWorkUnitId?: string }
  | { type: 'editAnnotation'; blockId: string; annotation: Annotation }
  | { type: 'deleteArchivedSubtree'; blockId: string }
  // --- view state (non-undoable) ---
  | { type: 'toggleCollapse'; blockId: string }
  | { type: 'setTheme'; theme: Theme }
  // --- import ---
  | { type: 'importState'; state: AppState };

/** Create a fresh, empty state. */
export function createEmptyState(theme: Theme = 'dark'): AppState {
  return { blocks: [], workUnits: [], theme };
}
