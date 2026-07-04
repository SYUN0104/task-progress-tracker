// Pure tree helpers over a flat block array. Parent/child links are by
// `parentId`; sibling order is by `order`. None of these mutate their input.

import type { Block } from './types';

/** Index blocks by id for O(1) lookups. */
function indexById(blocks: Block[]): Map<string, Block> {
  return new Map(blocks.map((b) => [b.id, b]));
}

/** Direct children of `parentId` (null for top-level), sorted by `order`. */
export function childrenOf(blocks: Block[], parentId: string | null): Block[] {
  return blocks
    .filter((b) => b.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

/** Ids of `rootId` and all of its descendants (inclusive). */
export function subtreeIds(blocks: Block[], rootId: string): Set<string> {
  // Bucket children by parent once so the walk is linear.
  const byParent = new Map<string | null, Block[]>();
  for (const b of blocks) {
    const bucket = byParent.get(b.parentId);
    if (bucket) bucket.push(b);
    else byParent.set(b.parentId, [b]);
  }
  const ids = new Set<string>();
  const stack: string[] = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    for (const child of byParent.get(id) ?? []) stack.push(child.id);
  }
  return ids;
}

/** `rootId` plus every descendant, as blocks. */
export function subtree(blocks: Block[], rootId: string): Block[] {
  const ids = subtreeIds(blocks, rootId);
  return blocks.filter((b) => ids.has(b.id));
}

/** Descendants of `rootId`, excluding the root itself. */
export function descendantsOf(blocks: Block[], rootId: string): Block[] {
  const ids = subtreeIds(blocks, rootId);
  return blocks.filter((b) => b.id !== rootId && ids.has(b.id));
}

/** Walk up `parentId` to the top-level ancestor (parentId === null). */
export function topLevelAncestorId(blocks: Block[], blockId: string): string {
  const byId = indexById(blocks);
  let cur = byId.get(blockId);
  if (!cur) return blockId;
  while (cur.parentId !== null) {
    const parent = byId.get(cur.parentId);
    if (!parent) break; // defensive: broken link stops the walk
    cur = parent;
  }
  return cur.id;
}

/**
 * True when `nodeId` sits strictly inside `ancestorId`'s subtree.
 * Used as the cycle guard for moves (a block may not be dropped onto itself
 * or any of its own descendants).
 */
export function isDescendant(
  blocks: Block[],
  nodeId: string,
  ancestorId: string,
): boolean {
  if (nodeId === ancestorId) return false;
  const byId = indexById(blocks);
  let cur = byId.get(nodeId);
  while (cur && cur.parentId !== null) {
    if (cur.parentId === ancestorId) return true;
    cur = byId.get(cur.parentId);
  }
  return false;
}
