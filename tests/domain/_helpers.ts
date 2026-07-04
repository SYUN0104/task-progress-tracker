// Shared builders for domain tests. Not a test file (no `.test` suffix), so
// Vitest does not collect it as a suite.

import {
  applyAction,
  createEmptyState,
  type Annotation,
  type AppState,
  type MoveMode,
} from '../../src/lib/domain';

/**
 * Thin fluent wrapper around `applyAction` that supplies explicit ids/timestamps
 * so tests stay deterministic. Each `create*` uses the provided ids.
 */
export class Builder {
  state: AppState;

  constructor(state: AppState = createEmptyState()) {
    this.state = state;
  }

  private apply(action: Parameters<typeof applyAction>[1]): this {
    this.state = applyAction(this.state, action);
    return this;
  }

  /** Create a top-level block in a brand-new right-end column. */
  createBlock(blockId: string, workUnitId: string, text = blockId, now = 0): this {
    return this.apply({ type: 'createBlock', blockId, workUnitId, text, now });
  }

  createChild(blockId: string, parentId: string, text = blockId, now = 0): this {
    return this.apply({ type: 'createChildBlock', blockId, parentId, text, now });
  }

  createWorkUnit(workUnitId: string): this {
    return this.apply({ type: 'createWorkUnit', workUnitId });
  }

  move(blockId: string, mode: MoveMode, targetId: string): this {
    return this.apply({ type: 'moveBlock', blockId, mode, targetId });
  }

  complete(blockId: string, now = 0): this {
    return this.apply({ type: 'complete', blockId, now });
  }

  hold(blockId: string, annotation: Annotation, now = 0): this {
    return this.apply({ type: 'hold', blockId, annotation, now });
  }

  resume(blockId: string, now = 0, newWorkUnitId?: string): this {
    return this.apply({ type: 'resume', blockId, now, newWorkUnitId });
  }

  block(id: string) {
    return this.state.blocks.find((b) => b.id === id);
  }

  workUnit(id: string) {
    return this.state.workUnits.find((w) => w.id === id);
  }
}
