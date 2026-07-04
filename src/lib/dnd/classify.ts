// Pure drop classification for the pointer DnD engine (plan D5).
//
// Given a drag SOURCE (a block being moved, or a column handle being
// reordered) and a TARGET descriptor derived from `document.elementFromPoint`
// (which block/column the pointer is over, plus the pointer's fractional
// position inside that element), decide what a drop would do. This function is
// free of any DOM or store access so it can be unit-tested in isolation; its
// only domain dependency is the pure `isDescendant` cycle guard.

import type { Block } from '../domain';
import { isDescendant } from '../domain';

export type DropType =
  | 'child' // nest the dragged block under the target block
  | 'siblingBefore' // insert immediately before the target block (AC10)
  | 'siblingAfter' // insert immediately after the target block (AC10)
  | 'toColumnTopLevel' // append as a top-level block of the target column
  | 'reorderColumn' // move the dragged column before/after the target column
  | 'none'; // no valid drop here

export interface DragSource {
  kind: 'block' | 'handle';
  /** Present when kind === 'block': the block being dragged. */
  sourceBlockId?: string;
  /** Present when kind === 'handle': the column being reordered. */
  sourceWorkUnitId?: string;
}

export interface DropTarget {
  /** Innermost block under the pointer, if any. */
  blockId?: string;
  /** Column (work unit) under the pointer, if any. */
  workUnitId?: string;
  /** True when the pointer is over a column drag handle (informational). */
  isHandle?: boolean;
  /** Pointer's vertical position within the target block row: 0 (top)..1 (bottom). */
  relativeY?: number;
  /** Pointer's horizontal position within the target column: 0 (left)..1 (right). */
  relativeX?: number;
}

export interface Classification {
  type: DropType;
  /** reorderColumn only: insert before (true) or after (false) the target column. */
  before?: boolean;
}

/**
 * Vertical banding within a block row:
 *   [0, SIBLING_BAND)       -> siblingBefore
 *   [SIBLING_BAND, 1 - SIBLING_BAND) -> child (the middle 50%)
 *   [1 - SIBLING_BAND, 1]   -> siblingAfter
 * So exactly 0.25 falls in the child band and exactly 0.75 falls in the
 * siblingAfter band.
 */
export const SIBLING_BAND = 0.25;

export function classify(
  source: DragSource,
  target: DropTarget,
  blocks: Block[] = [],
): Classification {
  // --- dragging a column handle: reorder columns ---------------------------
  if (source.kind === 'handle') {
    if (target.workUnitId == null) return { type: 'none' };
    // Reordering a column relative to itself is a no-op; suppress it entirely.
    if (target.workUnitId === source.sourceWorkUnitId) return { type: 'none' };
    const before = (target.relativeX ?? 0.5) < 0.5;
    return { type: 'reorderColumn', before };
  }

  // --- dragging a block ----------------------------------------------------
  const sourceId = source.sourceBlockId;
  if (sourceId == null) return { type: 'none' };

  // A block under the pointer wins over its surrounding column: nesting or a
  // sibling insertion depending on where in the row the pointer sits.
  if (target.blockId != null) {
    // Cycle guard: never drop onto self or into the dragged block's own subtree.
    if (target.blockId === sourceId) return { type: 'none' };
    if (isDescendant(blocks, target.blockId, sourceId)) return { type: 'none' };

    const ry = clamp01(target.relativeY ?? 0.5);
    if (ry < SIBLING_BAND) return { type: 'siblingBefore' };
    if (ry >= 1 - SIBLING_BAND) return { type: 'siblingAfter' };
    return { type: 'child' };
  }

  // Empty column area (no block under the pointer): append at the top level.
  if (target.workUnitId != null) return { type: 'toColumnTopLevel' };

  return { type: 'none' };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
