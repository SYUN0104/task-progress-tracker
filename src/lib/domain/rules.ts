// Pure predicates that gate destructive / irreversible transitions.
// The UI calls these to decide whether to warn; the reducer also re-checks
// them so a bad action degrades to a no-op (defence in depth).

import type { AppState } from './types';
import { descendantsOf } from './tree';

/**
 * A block can be completed only when it is active and every descendant is
 * already `completed`. A `held` (or still `active`) descendant blocks the
 * parent — this is intentional (D2): the last remaining held child must be
 * resumed and completed first.
 */
export function canComplete(state: AppState, blockId: string): boolean {
  const block = state.blocks.find((b) => b.id === blockId);
  if (!block || block.status !== 'active') return false;
  return descendantsOf(state.blocks, blockId).every(
    (d) => d.status === 'completed',
  );
}

/**
 * A column may be deleted only when nothing occupies it in the Active view.
 * Held blocks live in the Hold section and completed blocks in the Archive, so
 * only `active` blocks count as occupying the column. This matches D3: a column
 * whose blocks are all held can be removed, and a resumed unit whose original
 * column is gone is restored into a freshly created right-end column.
 */
export function canDeleteWorkUnit(state: AppState, workUnitId: string): boolean {
  const exists = state.workUnits.some((w) => w.id === workUnitId);
  if (!exists) return false;
  return !state.blocks.some(
    (b) => b.workUnitId === workUnitId && b.status === 'active',
  );
}

/**
 * Only a completed block may be deleted from the Archive. Dimmed context nodes
 * (incomplete ancestors shown for context) are not deletable (AC29).
 */
export function canDeleteArchived(state: AppState, blockId: string): boolean {
  const block = state.blocks.find((b) => b.id === blockId);
  return !!block && block.status === 'completed';
}
