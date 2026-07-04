// The single domain reducer. `applyAction` is PURE: it never mutates its input,
// never reads wall-clock time, and never generates ids — callers pass `now` and
// any new ids in the action payload. A failed guard degrades to a no-op
// (returns the original state unchanged).

import type { Action, AppState, Block, WorkUnit } from './types';
import { isDescendant, subtreeIds } from './tree';
import { canComplete, canDeleteWorkUnit, canDeleteArchived } from './rules';
import { validateAppState } from './validate';

/** Action types that are view-state only — the store must NOT push undo for these. */
export const VIEW_STATE_ACTIONS: ReadonlySet<Action['type']> = new Set([
  'toggleCollapse',
  'setTheme',
]);

/** Whether an action is view-state (bypasses the undo stack). */
export function isViewStateAction(action: Action): boolean {
  return VIEW_STATE_ACTIONS.has(action.type);
}

/** Deep clone so the reducer can mutate freely without touching the input. */
function clone(state: AppState): AppState {
  return structuredClone(state);
}

/** Reassign contiguous 0..n `order` to a sibling group, preserving current order. */
function reindexSiblings(
  blocks: Block[],
  parentId: string | null,
  workUnitId: string,
): void {
  blocks
    .filter((b) => b.parentId === parentId && b.workUnitId === workUnitId)
    .sort((a, b) => a.order - b.order)
    .forEach((b, i) => {
      b.order = i;
    });
}

/** Set `workUnitId` on a block and every descendant (a subtree lives in one column). */
function cascadeWorkUnit(blocks: Block[], rootId: string, workUnitId: string): void {
  const ids = subtreeIds(blocks, rootId);
  for (const b of blocks) {
    if (ids.has(b.id)) b.workUnitId = workUnitId;
  }
}

/** Largest existing `order` among items, or -1 when empty. */
function maxOrder<T extends { order: number }>(items: T[]): number {
  return items.reduce((m, it) => Math.max(m, it.order), -1);
}

export function applyAction(state: AppState, action: Action): AppState {
  switch (action.type) {
    // ---------------------------------------------------------------- creation
    case 'createBlock': {
      // AC2: a new block always spawns a fresh column at the right end.
      const s = clone(state);
      const workUnit: WorkUnit = {
        id: action.workUnitId,
        order: maxOrder(s.workUnits) + 1,
      };
      s.workUnits.push(workUnit);
      s.blocks.push({
        id: action.blockId,
        text: action.text,
        createdAt: action.now,
        parentId: null,
        workUnitId: workUnit.id,
        order: 0,
        status: 'active',
        accumulatedHeldMs: 0,
        collapsed: false,
      });
      return s;
    }

    case 'createChildBlock': {
      // AC43: quick-add a child under an active block.
      const parent = state.blocks.find((b) => b.id === action.parentId);
      if (!parent || parent.status !== 'active') return state;
      const s = clone(state);
      const siblings = s.blocks.filter(
        (b) => b.parentId === parent.id && b.workUnitId === parent.workUnitId,
      );
      s.blocks.push({
        id: action.blockId,
        text: action.text,
        createdAt: action.now,
        parentId: parent.id,
        workUnitId: parent.workUnitId,
        order: maxOrder(siblings) + 1,
        status: 'active',
        accumulatedHeldMs: 0,
        collapsed: false,
      });
      return s;
    }

    case 'createWorkUnit': {
      // AC3: add an empty column to be filled by dragging.
      const s = clone(state);
      s.workUnits.push({
        id: action.workUnitId,
        order: maxOrder(s.workUnits) + 1,
      });
      return s;
    }

    // --------------------------------------------------------- work unit edits
    case 'renameWorkUnit': {
      if (!state.workUnits.some((w) => w.id === action.workUnitId)) return state;
      const s = clone(state);
      s.workUnits.find((w) => w.id === action.workUnitId)!.name = action.name;
      return s;
    }

    case 'setWorkUnitStyle': {
      if (!state.workUnits.some((w) => w.id === action.workUnitId)) return state;
      const s = clone(state);
      const w = s.workUnits.find((x) => x.id === action.workUnitId)!;
      if ('color' in action) w.color = action.color;
      if ('label' in action) w.label = action.label;
      return s;
    }

    case 'reorderWorkUnit': {
      if (!state.workUnits.some((w) => w.id === action.workUnitId)) return state;
      const s = clone(state);
      const ordered = [...s.workUnits].sort((a, b) => a.order - b.order);
      const from = ordered.findIndex((w) => w.id === action.workUnitId);
      const [moved] = ordered.splice(from, 1);
      const to = Math.max(0, Math.min(action.toIndex, ordered.length));
      ordered.splice(to, 0, moved);
      ordered.forEach((w, i) => {
        w.order = i;
      });
      return s;
    }

    case 'deleteEmptyWorkUnit': {
      if (!canDeleteWorkUnit(state, action.workUnitId)) return state;
      const s = clone(state);
      s.workUnits = s.workUnits.filter((w) => w.id !== action.workUnitId);
      s.workUnits
        .sort((a, b) => a.order - b.order)
        .forEach((w, i) => {
          w.order = i;
        });
      return s;
    }

    // -------------------------------------------------------- block structure
    case 'moveBlock': {
      const block = state.blocks.find((b) => b.id === action.blockId);
      if (!block) return state;
      const { mode, targetId, blockId } = action;

      if (mode === 'toColumnTopLevel') {
        const column = state.workUnits.find((w) => w.id === targetId);
        if (!column) return state;
        const s = clone(state);
        const moved = s.blocks.find((b) => b.id === blockId)!;
        const oldParentId = moved.parentId;
        const oldWorkUnitId = moved.workUnitId;
        const topLevel = s.blocks.filter(
          (b) => b.parentId === null && b.workUnitId === targetId && b.id !== blockId,
        );
        moved.parentId = null;
        moved.order = maxOrder(topLevel) + 1;
        cascadeWorkUnit(s.blocks, blockId, targetId);
        reindexSiblings(s.blocks, oldParentId, oldWorkUnitId);
        reindexSiblings(s.blocks, null, targetId);
        return s;
      }

      // asChild / siblingBefore / siblingAfter all target a block.
      const target = state.blocks.find((b) => b.id === targetId);
      if (!target) return state;
      // Cycle guard: never drop onto self or a descendant.
      if (targetId === blockId) return state;
      if (isDescendant(state.blocks, targetId, blockId)) return state;

      if (mode === 'asChild') {
        const s = clone(state);
        const moved = s.blocks.find((b) => b.id === blockId)!;
        const tgt = s.blocks.find((b) => b.id === targetId)!;
        const oldParentId = moved.parentId;
        const oldWorkUnitId = moved.workUnitId;
        const childSiblings = s.blocks.filter(
          (b) =>
            b.parentId === tgt.id &&
            b.workUnitId === tgt.workUnitId &&
            b.id !== blockId,
        );
        moved.parentId = tgt.id;
        moved.order = maxOrder(childSiblings) + 1;
        cascadeWorkUnit(s.blocks, blockId, tgt.workUnitId);
        reindexSiblings(s.blocks, oldParentId, oldWorkUnitId);
        reindexSiblings(s.blocks, tgt.id, tgt.workUnitId);
        return s;
      }

      // siblingBefore / siblingAfter: insert next to the target within its group.
      // The new parent is the target's parent; guard against making the moved
      // block its own ancestor's child.
      const newParentId = target.parentId;
      if (
        newParentId !== null &&
        (newParentId === blockId || isDescendant(state.blocks, newParentId, blockId))
      ) {
        return state;
      }
      const s = clone(state);
      const moved = s.blocks.find((b) => b.id === blockId)!;
      const tgt = s.blocks.find((b) => b.id === targetId)!;
      const oldParentId = moved.parentId;
      const oldWorkUnitId = moved.workUnitId;
      moved.parentId = tgt.parentId;
      cascadeWorkUnit(s.blocks, blockId, tgt.workUnitId);
      // Rebuild the destination sibling group in the desired order.
      const group = s.blocks
        .filter(
          (b) =>
            b.parentId === tgt.parentId &&
            b.workUnitId === tgt.workUnitId &&
            b.id !== blockId,
        )
        .sort((a, b) => a.order - b.order);
      const targetIndex = group.findIndex((b) => b.id === targetId);
      const insertAt = mode === 'siblingAfter' ? targetIndex + 1 : targetIndex;
      group.splice(insertAt, 0, moved);
      group.forEach((b, i) => {
        b.order = i;
      });
      reindexSiblings(s.blocks, oldParentId, oldWorkUnitId);
      return s;
    }

    case 'editText': {
      if (!state.blocks.some((b) => b.id === action.blockId)) return state;
      const s = clone(state);
      s.blocks.find((b) => b.id === action.blockId)!.text = action.text;
      return s;
    }

    // ------------------------------------------------------------- lifecycle
    case 'complete': {
      // AC15/16: leaf-first — refuse unless all descendants are completed.
      if (!canComplete(state, action.blockId)) return state;
      const s = clone(state);
      const b = s.blocks.find((x) => x.id === action.blockId)!;
      b.status = 'completed';
      b.completedAt = action.now;
      return s;
    }

    case 'hold': {
      // AC20: title-bearing annotation required. D3: nested-hold safety.
      const root = state.blocks.find((b) => b.id === action.blockId);
      if (!root || root.status !== 'active') return state; // double-hold / non-active → no-op
      if (!action.annotation || !action.annotation.title) return state;
      const s = clone(state);
      const ids = subtreeIds(s.blocks, action.blockId);
      for (const b of s.blocks) {
        // Only currently-active descendants transition; already-held descendants
        // keep their own heldAt / holdRootId / accumulatedHeldMs untouched.
        if (ids.has(b.id) && b.status === 'active') {
          b.status = 'held';
          b.heldAt = action.now;
          b.holdRootId = action.blockId;
        }
      }
      const r = s.blocks.find((b) => b.id === action.blockId)!;
      r.annotation = { title: action.annotation.title, body: action.annotation.body };
      return s;
    }

    case 'resume': {
      // D3: resume only the blocks stamped with this hold root.
      const root = state.blocks.find((b) => b.id === action.blockId);
      if (!root || root.holdRootId !== action.blockId) return state;
      const s = clone(state);
      const r = s.blocks.find((b) => b.id === action.blockId)!;

      // Restore into the original column, or a fresh right-end column if it is gone.
      let destWorkUnitId = r.workUnitId;
      if (!s.workUnits.some((w) => w.id === destWorkUnitId)) {
        if (!action.newWorkUnitId) return state; // store must supply an id
        s.workUnits.push({
          id: action.newWorkUnitId,
          order: maxOrder(s.workUnits) + 1,
        });
        destWorkUnitId = action.newWorkUnitId;
      }

      const resumed = s.blocks.filter((b) => b.holdRootId === action.blockId);
      for (const b of resumed) {
        b.accumulatedHeldMs += action.now - (b.heldAt ?? action.now);
        b.heldAt = null;
        b.holdRootId = null;
        b.status = 'active';
        b.workUnitId = destWorkUnitId;
      }

      // Reparent orphans (review finding #2): a resumed block whose parent will
      // NOT be active (held/completed/missing, and not itself resuming here)
      // would otherwise be reachable from no section while its timer accrues.
      // Promote such blocks to top-level in the destination column. Blocks whose
      // parent IS active keep their intra-unit structure.
      const byId = new Map(s.blocks.map((b) => [b.id, b]));
      for (const b of resumed) {
        if (b.parentId === null) continue;
        const parent = byId.get(b.parentId);
        if (!parent || parent.status !== 'active') {
          b.parentId = null;
          // Sort promoted blocks to the end of the destination top-level group.
          b.order = Number.MAX_SAFE_INTEGER;
        }
      }

      // The hold note belongs to the Hold section; drop it on return to Active
      // (a fresh note is required by AC20 for any subsequent hold).
      r.annotation = undefined;

      // Reindex every sibling group a resumed block now lives in.
      const touchedParents = new Set<string | null>();
      for (const b of resumed) touchedParents.add(b.parentId);
      for (const parentId of touchedParents) {
        reindexSiblings(s.blocks, parentId, destWorkUnitId);
      }
      return s;
    }

    case 'editAnnotation': {
      // AC28: add/edit an archive note (prefill handled by the UI).
      if (!state.blocks.some((b) => b.id === action.blockId)) return state;
      const s = clone(state);
      s.blocks.find((b) => b.id === action.blockId)!.annotation = {
        title: action.annotation.title,
        body: action.annotation.body,
      };
      return s;
    }

    case 'deleteArchivedSubtree': {
      // D4: deleting a completed node cascades its (all-completed) subtree.
      if (!canDeleteArchived(state, action.blockId)) return state;
      const s = clone(state);
      const ids = subtreeIds(s.blocks, action.blockId);
      s.blocks = s.blocks.filter((b) => !ids.has(b.id));
      return s;
    }

    // ------------------------------------------------------------ view state
    case 'toggleCollapse': {
      if (!state.blocks.some((b) => b.id === action.blockId)) return state;
      const s = clone(state);
      const b = s.blocks.find((x) => x.id === action.blockId)!;
      b.collapsed = !b.collapsed;
      return s;
    }

    case 'setTheme': {
      const s = clone(state);
      s.theme = action.theme;
      return s;
    }

    // ---------------------------------------------------------------- import
    case 'importState': {
      // Never trust an imported payload: validate the schema and no-op on any
      // violation (review finding #1). validateAppState returns a fresh,
      // normalized state, so no extra clone is needed.
      const validated = validateAppState(action.state);
      return validated ?? state;
    }

    default: {
      // Exhaustiveness: every Action variant is handled above.
      const _never: never = action;
      return _never;
    }
  }
}
