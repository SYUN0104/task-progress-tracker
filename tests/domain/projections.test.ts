import { describe, it, expect } from 'vitest';
import { activeColumns, holdGrid, archiveTrees } from '../../src/lib/domain';
import { Builder } from './_helpers';

describe('projections.activeColumns', () => {
  it('lists columns in order with their active forests', () => {
    const b = new Builder()
      .createBlock('r', 'w') // column w, order 0
      .createChild('c', 'r')
      .createBlock('r2', 'w2'); // column w2, order 1

    const cols = activeColumns(b.state);
    expect(cols.map((c) => c.workUnit.id)).toEqual(['w', 'w2']);
    expect(cols[0].roots.map((n) => n.block.id)).toEqual(['r']);
    expect(cols[0].roots[0].children.map((n) => n.block.id)).toEqual(['c']);
  });

  it('omits held children from the active forest', () => {
    const b = new Builder()
      .createBlock('r', 'w')
      .createChild('c', 'r')
      .hold('c', { title: 'n' });
    const cols = activeColumns(b.state);
    expect(cols[0].roots[0].children).toEqual([]);
  });
});

describe('projections.holdGrid', () => {
  it('emits one card per hold-unit root; nested holds are separate cards', () => {
    const b = new Builder()
      .createBlock('r', 'w')
      .createChild('c', 'r')
      .hold('c', { title: 'child note' }, 100) // individual hold on the child
      .hold('r', { title: 'ancestor note' }, 200); // ancestor hold over it

    const cards = holdGrid(b.state);
    expect(cards.map((card) => card.root.id).sort()).toEqual(['c', 'r']);

    const rCard = cards.find((card) => card.root.id === 'r')!;
    // The nested-held child belongs to its own card, not the ancestor's.
    expect(rCard.tree.children).toEqual([]);

    const cCard = cards.find((card) => card.root.id === 'c')!;
    expect(cCard.tree.block.id).toBe('c');
  });
});

describe('projections.archiveTrees', () => {
  it('produces one card per top-level ancestor, prunes non-completed branches, dims context', () => {
    const b = new Builder()
      .createBlock('r', 'w')
      .createChild('c', 'r')
      .createChild('g', 'c')
      .createChild('c2', 'r') // unrelated, stays active
      .complete('g', 10)
      .complete('c', 20); // r stays active (incomplete ancestor)

    const cards = archiveTrees(b.state);
    expect(cards.length).toBe(1);

    const card = cards[0];
    expect(card.rootId).toBe('r');
    expect(card.tree.block.id).toBe('r');
    expect(card.tree.dimmed).toBe(true); // incomplete ancestor shown for context

    // c2 (active, no completed descendant) is pruned from the card.
    expect(card.tree.children.map((n) => n.block.id)).toEqual(['c']);

    const cNode = card.tree.children[0];
    expect(cNode.dimmed).toBe(false);
    expect(cNode.children.map((n) => n.block.id)).toEqual(['g']);
    expect(cNode.children[0].dimmed).toBe(false);

    expect(card.latestCompletedAt).toBe(20);
  });

  it('does not duplicate cards when multiple leaves under one root complete', () => {
    const b = new Builder()
      .createBlock('r', 'w')
      .createChild('c1', 'r')
      .createChild('c2', 'r')
      .complete('c1', 10)
      .complete('c2', 20);

    const cards = archiveTrees(b.state);
    expect(cards.length).toBe(1);
    expect(cards[0].tree.children.map((n) => n.block.id).sort()).toEqual([
      'c1',
      'c2',
    ]);
  });

  it('returns no cards when nothing is completed', () => {
    const b = new Builder().createBlock('r', 'w');
    expect(archiveTrees(b.state)).toEqual([]);
  });
});
