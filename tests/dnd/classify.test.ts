import { describe, it, expect } from 'vitest';
import type { Block } from '../../src/lib/domain';
import {
  classify,
  SIBLING_BAND,
  type DragSource,
  type DropTarget,
} from '../../src/lib/dnd/classify';

/** Minimal block factory (mirrors tests/domain/tree.test.ts). */
function b(id: string, parentId: string | null, order = 0, workUnitId = 'w'): Block {
  return {
    id,
    text: id,
    createdAt: 0,
    parentId,
    workUnitId,
    order,
    status: 'active',
    accumulatedHeldMs: 0,
    collapsed: false,
  };
}

// Tree used for cycle-guard tests:  R -> C -> G, plus an unrelated sibling S.
const tree: Block[] = [
  b('R', null, 0),
  b('C', 'R', 0),
  b('G', 'C', 0),
  b('S', null, 1),
];

const blockSource = (id: string): DragSource => ({ kind: 'block', sourceBlockId: id });
const handleSource = (id: string): DragSource => ({ kind: 'handle', sourceWorkUnitId: id });

function blockTarget(blockId: string, relativeY?: number): DropTarget {
  return { blockId, workUnitId: 'w', relativeY };
}

describe('classify — block onto block (vertical bands)', () => {
  it('center 50% band -> child', () => {
    for (const ry of [0.25, 0.4, 0.5, 0.6, 0.74]) {
      expect(classify(blockSource('C'), blockTarget('S', ry), tree).type).toBe('child');
    }
  });

  it('top 25% band -> siblingBefore', () => {
    for (const ry of [0, 0.1, 0.2, 0.2499]) {
      expect(classify(blockSource('C'), blockTarget('S', ry), tree).type).toBe('siblingBefore');
    }
  });

  it('bottom 25% band -> siblingAfter', () => {
    for (const ry of [0.75, 0.8, 0.9, 1]) {
      expect(classify(blockSource('C'), blockTarget('S', ry), tree).type).toBe('siblingAfter');
    }
  });

  it('exact 0.25 boundary belongs to the child band', () => {
    expect(classify(blockSource('C'), blockTarget('S', SIBLING_BAND), tree).type).toBe('child');
  });

  it('exact 0.75 boundary belongs to the siblingAfter band', () => {
    expect(classify(blockSource('C'), blockTarget('S', 1 - SIBLING_BAND), tree).type).toBe(
      'siblingAfter',
    );
  });

  it('missing relativeY defaults to the child band (0.5)', () => {
    expect(classify(blockSource('C'), blockTarget('S'), tree).type).toBe('child');
  });

  it('out-of-range relativeY is clamped to [0,1]', () => {
    expect(classify(blockSource('C'), blockTarget('S', -0.3), tree).type).toBe('siblingBefore');
    expect(classify(blockSource('C'), blockTarget('S', 1.7), tree).type).toBe('siblingAfter');
  });
});

describe('classify — cycle guard', () => {
  it('dropping onto self -> none (every band)', () => {
    for (const ry of [0, 0.5, 1]) {
      expect(classify(blockSource('R'), blockTarget('R', ry), tree).type).toBe('none');
    }
  });

  it('dropping onto a direct child -> none', () => {
    expect(classify(blockSource('R'), blockTarget('C', 0.5), tree).type).toBe('none');
  });

  it('dropping onto a deeper descendant -> none', () => {
    expect(classify(blockSource('R'), blockTarget('G', 0.5), tree).type).toBe('none');
  });

  it('dropping onto an ancestor is allowed (not a cycle)', () => {
    // Dragging C onto its parent R is a legal move, classified by band.
    expect(classify(blockSource('C'), blockTarget('R', 0.5), tree).type).toBe('child');
    expect(classify(blockSource('G'), blockTarget('R', 0.1), tree).type).toBe('siblingBefore');
  });

  it('dropping onto an unrelated block is allowed', () => {
    expect(classify(blockSource('C'), blockTarget('S', 0.5), tree).type).toBe('child');
  });
});

describe('classify — column targets (block source)', () => {
  it('empty column area (no block) -> toColumnTopLevel', () => {
    expect(classify(blockSource('C'), { workUnitId: 'w2' }, tree).type).toBe('toColumnTopLevel');
  });

  it('nothing under the pointer -> none', () => {
    expect(classify(blockSource('C'), {}, tree).type).toBe('none');
  });

  it('block source with no id -> none (defensive)', () => {
    expect(classify({ kind: 'block' }, blockTarget('S', 0.5), tree).type).toBe('none');
  });
});

describe('classify — column handle (reorder)', () => {
  it('over a different column -> reorderColumn with side by relativeX', () => {
    const left = classify(handleSource('w1'), { workUnitId: 'w2', relativeX: 0.2 });
    expect(left).toEqual({ type: 'reorderColumn', before: true });

    const right = classify(handleSource('w1'), { workUnitId: 'w2', relativeX: 0.8 });
    expect(right).toEqual({ type: 'reorderColumn', before: false });
  });

  it('exact midline (relativeX 0.5) resolves to after', () => {
    expect(classify(handleSource('w1'), { workUnitId: 'w2', relativeX: 0.5 })).toEqual({
      type: 'reorderColumn',
      before: false,
    });
  });

  it('missing relativeX defaults to after', () => {
    expect(classify(handleSource('w1'), { workUnitId: 'w2' })).toEqual({
      type: 'reorderColumn',
      before: false,
    });
  });

  it('over its own column -> none', () => {
    expect(classify(handleSource('w1'), { workUnitId: 'w1', relativeX: 0.2 }).type).toBe('none');
  });

  it('not over any column -> none', () => {
    expect(classify(handleSource('w1'), { blockId: 'C', relativeY: 0.5 }, tree).type).toBe('none');
    expect(classify(handleSource('w1'), {}).type).toBe('none');
  });
});
