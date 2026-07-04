import { describe, it, expect } from 'vitest';
import {
  applyAction,
  createEmptyState,
  isViewStateAction,
  elapsedMs,
  childrenOf,
  activeColumns,
  holdGrid,
} from '../../src/lib/domain';
import { Builder } from './_helpers';

describe('createBlock / createChildBlock / createWorkUnit', () => {
  it('createBlock always spawns a fresh right-end column (AC2)', () => {
    const b = new Builder().createBlock('r1', 'w1', 'first', 100).createBlock('r2', 'w2', 'second', 200);
    expect(b.workUnit('w1')!.order).toBe(0);
    expect(b.workUnit('w2')!.order).toBe(1);
    const r1 = b.block('r1')!;
    expect(r1).toMatchObject({
      parentId: null,
      workUnitId: 'w1',
      order: 0,
      status: 'active',
      createdAt: 100,
      accumulatedHeldMs: 0,
    });
  });

  it('createChildBlock nests under an active parent and appends in order', () => {
    const b = new Builder().createBlock('r', 'w').createChild('c1', 'r').createChild('c2', 'r');
    expect(childrenOf(b.state.blocks, 'r').map((x) => x.id)).toEqual(['c1', 'c2']);
    expect(b.block('c2')!.workUnitId).toBe('w');
  });

  it('createChildBlock is a no-op under a non-active parent', () => {
    const b = new Builder().createBlock('r', 'w').complete('r');
    const before = b.state;
    const after = applyAction(before, {
      type: 'createChildBlock',
      blockId: 'c',
      parentId: 'r',
      text: 'c',
      now: 0,
    });
    expect(after).toBe(before);
  });
});

describe('moveBlock', () => {
  it('asChild nests the block and cascades workUnitId to the whole subtree', () => {
    const b = new Builder()
      .createBlock('r', 'wr')
      .createBlock('s', 'ws')
      .createChild('sc', 's');
    b.move('s', 'asChild', 'r');

    expect(b.block('s')!.parentId).toBe('r');
    expect(b.block('s')!.workUnitId).toBe('wr');
    expect(b.block('sc')!.workUnitId).toBe('wr'); // cascaded
    expect(childrenOf(b.state.blocks, 'r').map((x) => x.id)).toEqual(['s']);
  });

  it('siblingBefore / siblingAfter reorder within the sibling group', () => {
    const b = new Builder()
      .createBlock('r', 'w')
      .createChild('c1', 'r')
      .createChild('c2', 'r')
      .createChild('c3', 'r');

    b.move('c3', 'siblingBefore', 'c1');
    expect(childrenOf(b.state.blocks, 'r').map((x) => x.id)).toEqual(['c3', 'c1', 'c2']);

    b.move('c3', 'siblingAfter', 'c2');
    expect(childrenOf(b.state.blocks, 'r').map((x) => x.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('toColumnTopLevel moves the block to a column as a top-level sibling', () => {
    const b = new Builder().createBlock('r', 'wr').createBlock('s', 'ws');
    b.move('s', 'toColumnTopLevel', 'wr');

    expect(b.block('s')!.parentId).toBeNull();
    expect(b.block('s')!.workUnitId).toBe('wr');
    const topLevel = b.state.blocks
      .filter((x) => x.parentId === null && x.workUnitId === 'wr')
      .sort((a, c) => a.order - c.order)
      .map((x) => x.id);
    expect(topLevel).toEqual(['r', 's']);
  });

  it('prevents cycles: dropping onto self or a descendant is a no-op', () => {
    const b = new Builder().createBlock('r', 'w').createChild('c', 'r').createChild('g', 'c');
    const before = b.state;

    expect(applyAction(before, { type: 'moveBlock', blockId: 'c', mode: 'asChild', targetId: 'c' })).toBe(before);
    expect(applyAction(before, { type: 'moveBlock', blockId: 'r', mode: 'asChild', targetId: 'g' })).toBe(before);
  });
});

describe('complete (leaf-first rule)', () => {
  it('completes a leaf and stamps completedAt', () => {
    const b = new Builder().createBlock('r', 'w');
    b.complete('r', 999);
    expect(b.block('r')).toMatchObject({ status: 'completed', completedAt: 999 });
  });

  it('refuses a parent with an incomplete child, then allows it once the child is done', () => {
    const b = new Builder().createBlock('r', 'w').createChild('c', 'r');
    const blocked = applyAction(b.state, { type: 'complete', blockId: 'r', now: 1 });
    expect(blocked).toBe(b.state); // no-op

    b.complete('c').complete('r');
    expect(b.block('r')!.status).toBe('completed');
  });
});

describe('hold / resume (D3 nested-hold safety)', () => {
  it('requires an annotation title', () => {
    const b = new Builder().createBlock('r', 'w');
    const noTitle = applyAction(b.state, {
      type: 'hold',
      blockId: 'r',
      annotation: { title: '' },
      now: 0,
    });
    expect(noTitle).toBe(b.state);
  });

  it('double-hold is a no-op', () => {
    const b = new Builder().createBlock('r', 'w').hold('r', { title: 'note' }, 5000);
    const held = b.state;
    const again = applyAction(held, {
      type: 'hold',
      blockId: 'r',
      annotation: { title: 'note again' },
      now: 6000,
    });
    expect(again).toBe(held); // status is no longer active → no-op
  });

  it('ancestor hold over an individually-held child preserves the child accounting', () => {
    const b = new Builder()
      .createBlock('r', 'w')
      .createChild('c', 'r')
      .hold('c', { title: 'child note' }, 2000)
      .hold('r', { title: 'ancestor note' }, 5000);

    // Child keeps its own hold unit untouched.
    expect(b.block('c')).toMatchObject({
      status: 'held',
      heldAt: 2000,
      holdRootId: 'c',
      accumulatedHeldMs: 0,
    });
    // Root became its own hold unit.
    expect(b.block('r')).toMatchObject({ status: 'held', heldAt: 5000, holdRootId: 'r' });
  });

  it('resume only revives blocks stamped with that hold root; nested child stays held', () => {
    const b = new Builder()
      .createBlock('r', 'w')
      .createChild('c', 'r')
      .hold('c', { title: 'child note' }, 2000)
      .hold('r', { title: 'ancestor note' }, 5000)
      .resume('r', 8000);

    expect(b.block('r')).toMatchObject({ status: 'active', accumulatedHeldMs: 3000 });
    expect(b.block('c')).toMatchObject({
      status: 'held',
      heldAt: 2000,
      holdRootId: 'c',
      accumulatedHeldMs: 0,
    });
  });

  it('resuming an inner hold promotes the orphaned block to top-level (finding #2)', () => {
    // Child held individually, then the parent held over it; resuming the
    // CHILD's hold card must not leave the child reachable from no section.
    const b = new Builder()
      .createBlock('r', 'w')
      .createChild('c', 'r')
      .hold('c', { title: 'child note' }, 2000)
      .hold('r', { title: 'ancestor note' }, 5000)
      .resume('c', 8000);

    // Child is active again and promoted to top-level (its parent is still held).
    expect(b.block('c')).toMatchObject({ status: 'active', parentId: null, workUnitId: 'w' });

    // It is now visible in the Active projection as a top-level block of column w.
    const col = activeColumns(b.state).find((c) => c.workUnit.id === 'w')!;
    expect(col.roots.map((n) => n.block.id)).toContain('c');

    // The parent's hold card is intact (still held as its own unit).
    const cards = holdGrid(b.state);
    expect(cards.map((card) => card.root.id)).toEqual(['r']);
  });

  it('elapsed is continuous across hold and resume', () => {
    const b = new Builder().createBlock('r', 'w', 'r', 1000).hold('r', { title: 'n' }, 5000);
    // Frozen while held.
    expect(elapsedMs(b.block('r')!, 999999)).toBe(4000);

    b.resume('r', 9000);
    // At the resume instant the value is unchanged; it then keeps growing.
    expect(elapsedMs(b.block('r')!, 9000)).toBe(4000);
    expect(elapsedMs(b.block('r')!, 10000)).toBe(5000);
  });

  it('resume into a recreated column when the original was deleted', () => {
    const b = new Builder().createBlock('r', 'w').hold('r', { title: 'n' }, 1000);
    // The now-empty (in Active) column can be deleted while the block is held.
    b.state = applyAction(b.state, { type: 'deleteEmptyWorkUnit', workUnitId: 'w' });
    expect(b.workUnit('w')).toBeUndefined();

    b.resume('r', 2000, 'w2');
    expect(b.workUnit('w2')).toBeDefined();
    expect(b.block('r')).toMatchObject({
      status: 'active',
      workUnitId: 'w2',
      accumulatedHeldMs: 1000,
    });
  });
});

describe('deleteEmptyWorkUnit', () => {
  it('refuses a column that still has an active block', () => {
    const b = new Builder().createBlock('r', 'w');
    const after = applyAction(b.state, { type: 'deleteEmptyWorkUnit', workUnitId: 'w' });
    expect(after).toBe(b.state);
  });

  it('deletes an empty column and reindexes the rest', () => {
    const b = new Builder().createBlock('a', 'wa').createBlock('bb', 'wb').createWorkUnit('wc');
    b.state = applyAction(b.state, { type: 'deleteEmptyWorkUnit', workUnitId: 'wc' });
    expect(b.workUnit('wc')).toBeUndefined();
    expect(b.state.workUnits.map((w) => w.order).sort()).toEqual([0, 1]);
  });
});

describe('deleteArchivedSubtree', () => {
  it('cascades a completed subtree and refuses non-completed blocks', () => {
    const b = new Builder()
      .createBlock('r', 'w')
      .createChild('c', 'r')
      .createChild('g', 'c')
      .complete('g')
      .complete('c');

    // r is still active → not archivable.
    const noop = applyAction(b.state, { type: 'deleteArchivedSubtree', blockId: 'r' });
    expect(noop).toBe(b.state);

    // Deleting completed c removes c and its completed descendant g.
    b.state = applyAction(b.state, { type: 'deleteArchivedSubtree', blockId: 'c' });
    expect(b.block('c')).toBeUndefined();
    expect(b.block('g')).toBeUndefined();
    expect(b.block('r')).toBeDefined();
  });
});

describe('editText / editAnnotation / reorderWorkUnit', () => {
  it('editText updates the block text', () => {
    const b = new Builder().createBlock('r', 'w', 'old');
    b.state = applyAction(b.state, { type: 'editText', blockId: 'r', text: 'new' });
    expect(b.block('r')!.text).toBe('new');
  });

  it('editAnnotation sets title and body', () => {
    const b = new Builder().createBlock('r', 'w').complete('r');
    b.state = applyAction(b.state, {
      type: 'editAnnotation',
      blockId: 'r',
      annotation: { title: 'done', body: 'shipped' },
    });
    expect(b.block('r')!.annotation).toEqual({ title: 'done', body: 'shipped' });
  });

  it('reorderWorkUnit moves a column to a new index', () => {
    const b = new Builder().createBlock('a', 'wa').createBlock('bb', 'wb').createBlock('cc', 'wc');
    b.state = applyAction(b.state, { type: 'reorderWorkUnit', workUnitId: 'wc', toIndex: 0 });
    const ordered = [...b.state.workUnits].sort((x, y) => x.order - y.order).map((w) => w.id);
    expect(ordered).toEqual(['wc', 'wa', 'wb']);
  });
});

describe('view-state actions', () => {
  it('toggleCollapse flips the flag', () => {
    const b = new Builder().createBlock('r', 'w');
    b.state = applyAction(b.state, { type: 'toggleCollapse', blockId: 'r' });
    expect(b.block('r')!.collapsed).toBe(true);
    b.state = applyAction(b.state, { type: 'toggleCollapse', blockId: 'r' });
    expect(b.block('r')!.collapsed).toBe(false);
  });

  it('setTheme changes the theme', () => {
    let s = createEmptyState('dark');
    s = applyAction(s, { type: 'setTheme', theme: 'light' });
    expect(s.theme).toBe('light');
  });

  it('isViewStateAction flags only view-state actions', () => {
    expect(isViewStateAction({ type: 'toggleCollapse', blockId: 'r' })).toBe(true);
    expect(isViewStateAction({ type: 'setTheme', theme: 'dark' })).toBe(true);
    expect(
      isViewStateAction({ type: 'createBlock', blockId: 'r', workUnitId: 'w', text: 't', now: 0 }),
    ).toBe(false);
  });
});

describe('importState', () => {
  it('replaces state with a deep clone of the imported snapshot', () => {
    const source = new Builder().createBlock('r', 'w').createChild('c', 'r').state;
    let target = createEmptyState('light');
    target = applyAction(target, { type: 'importState', state: source });

    expect(target).toEqual(source);
    expect(target).not.toBe(source); // deep clone, not the same reference
  });

  it('is a no-op on an invalid payload (finding #1)', () => {
    const before = new Builder().createBlock('r', 'w').state;
    const after = applyAction(before, {
      type: 'importState',
      state: { blocks: null, workUnits: null, theme: 'dark' } as never,
    });
    expect(after).toBe(before); // rejected → same reference
  });
});

describe('reducer purity', () => {
  it('never mutates the input state', () => {
    const b = new Builder().createBlock('r', 'w');
    const snapshot = structuredClone(b.state);
    applyAction(b.state, { type: 'editText', blockId: 'r', text: 'changed' });
    expect(b.state).toEqual(snapshot);
  });
});
