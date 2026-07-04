import { describe, it, expect } from 'vitest';
import type { Block } from '../../src/lib/domain';
import {
  childrenOf,
  subtreeIds,
  descendantsOf,
  topLevelAncestorId,
  isDescendant,
} from '../../src/lib/domain';

/** Minimal block factory for structural tests. */
function b(
  id: string,
  parentId: string | null,
  order: number,
  workUnitId = 'w',
): Block {
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

// Tree:  r
//        ├── a (order 1)
//        │   └── a1
//        └── c (order 0)
const blocks: Block[] = [
  b('r', null, 0),
  b('a', 'r', 1),
  b('c', 'r', 0),
  b('a1', 'a', 0),
];

describe('tree', () => {
  it('childrenOf returns direct children sorted by order', () => {
    expect(childrenOf(blocks, 'r').map((x) => x.id)).toEqual(['c', 'a']);
    expect(childrenOf(blocks, 'a').map((x) => x.id)).toEqual(['a1']);
    expect(childrenOf(blocks, 'a1')).toEqual([]);
  });

  it('subtreeIds includes the root and every descendant', () => {
    expect([...subtreeIds(blocks, 'r')].sort()).toEqual(['a', 'a1', 'c', 'r']);
    expect([...subtreeIds(blocks, 'a')].sort()).toEqual(['a', 'a1']);
    expect([...subtreeIds(blocks, 'a1')]).toEqual(['a1']);
  });

  it('descendantsOf excludes the root', () => {
    expect(descendantsOf(blocks, 'r').map((x) => x.id).sort()).toEqual([
      'a',
      'a1',
      'c',
    ]);
    expect(descendantsOf(blocks, 'a1')).toEqual([]);
  });

  it('topLevelAncestorId walks up to the root', () => {
    expect(topLevelAncestorId(blocks, 'a1')).toBe('r');
    expect(topLevelAncestorId(blocks, 'a')).toBe('r');
    expect(topLevelAncestorId(blocks, 'r')).toBe('r');
  });

  it('isDescendant is strict (self is not its own descendant)', () => {
    expect(isDescendant(blocks, 'a1', 'r')).toBe(true);
    expect(isDescendant(blocks, 'a1', 'a')).toBe(true);
    expect(isDescendant(blocks, 'a', 'a1')).toBe(false);
    expect(isDescendant(blocks, 'r', 'r')).toBe(false);
    expect(isDescendant(blocks, 'c', 'a')).toBe(false);
  });
});
