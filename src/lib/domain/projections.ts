// Read-only projections of the single AppState into the three sections.
// No data is duplicated: Active/Hold/Archive are pure views over block.status
// (and holdRootId / parent links).

import type { AppState, Block, WorkUnit } from './types';
import { topLevelAncestorId } from './tree';

/** A node in a projected block tree. */
export interface BlockTreeNode {
  block: Block;
  children: BlockTreeNode[];
  /** Archive-only: incomplete ancestor shown as dimmed/dashed context (AC26). */
  dimmed?: boolean;
}

export interface ActiveColumn {
  workUnit: WorkUnit;
  roots: BlockTreeNode[];
}

/** Active section: columns left→right, each with its forest of `active` blocks. */
export function activeColumns(state: AppState): ActiveColumn[] {
  return [...state.workUnits]
    .sort((a, b) => a.order - b.order)
    .map((workUnit) => ({
      workUnit,
      roots: buildActiveForest(state.blocks, null, workUnit.id),
    }));
}

function buildActiveForest(
  blocks: Block[],
  parentId: string | null,
  workUnitId: string,
): BlockTreeNode[] {
  return blocks
    .filter(
      (b) =>
        b.parentId === parentId &&
        b.workUnitId === workUnitId &&
        b.status === 'active',
    )
    .sort((a, b) => a.order - b.order)
    .map((block) => ({
      block,
      children: buildActiveForest(blocks, block.id, workUnitId),
    }));
}

export interface HoldCard {
  root: Block;
  tree: BlockTreeNode;
}

/**
 * Hold section: one card per hold-unit root (a held block whose holdRootId
 * points at itself). A card contains only the blocks sharing that holdRootId,
 * so a nested-held descendant forms its own separate card.
 */
export function holdGrid(state: AppState): HoldCard[] {
  return state.blocks
    .filter((b) => b.status === 'held' && b.holdRootId === b.id)
    .sort((a, b) => (a.heldAt ?? 0) - (b.heldAt ?? 0))
    .map((root) => ({ root, tree: buildHeldTree(state.blocks, root, root.id) }));
}

function buildHeldTree(
  blocks: Block[],
  node: Block,
  holdRootId: string,
): BlockTreeNode {
  const children = blocks
    .filter(
      (b) =>
        b.parentId === node.id &&
        b.status === 'held' &&
        b.holdRootId === holdRootId,
    )
    .sort((a, b) => a.order - b.order)
    .map((child) => buildHeldTree(blocks, child, holdRootId));
  return { block: node, children };
}

export interface ArchiveCard {
  /** Top-level ancestor id that keys this card. */
  rootId: string;
  tree: BlockTreeNode;
  /** Most recent completion time within the card (for sort/labeling). */
  latestCompletedAt: number;
}

/**
 * Archive section: one card per top-level ancestor that has at least one
 * completed block (AC25/26, D4). A card contains exactly the completed nodes
 * plus the ancestor path connecting them to the root; branches with no
 * completed node are pruned. Incomplete context ancestors are flagged `dimmed`.
 * Exactly one card per root (no duplicate cards when several leaves complete).
 */
export function archiveTrees(state: AppState): ArchiveCard[] {
  const completed = state.blocks.filter((b) => b.status === 'completed');
  if (completed.length === 0) return [];

  const byId = new Map(state.blocks.map((b) => [b.id, b]));
  const includeByRoot = new Map<string, Set<string>>();
  const latestByRoot = new Map<string, number>();

  for (const node of completed) {
    const rootId = topLevelAncestorId(state.blocks, node.id);
    let include = includeByRoot.get(rootId);
    if (!include) {
      include = new Set<string>();
      includeByRoot.set(rootId, include);
    }
    // Add the path from the completed node up to (and including) the root.
    let cur: Block | undefined = byId.get(node.id);
    while (cur) {
      include.add(cur.id);
      if (cur.parentId === null) break;
      cur = byId.get(cur.parentId);
    }
    const prev = latestByRoot.get(rootId) ?? -Infinity;
    latestByRoot.set(rootId, Math.max(prev, node.completedAt ?? 0));
  }

  const cards: ArchiveCard[] = [];
  for (const [rootId, include] of includeByRoot) {
    const root = byId.get(rootId);
    if (!root) continue;
    cards.push({
      rootId,
      tree: buildArchiveTree(state.blocks, root, include),
      latestCompletedAt: latestByRoot.get(rootId) ?? 0,
    });
  }

  // Newest archive first; stable tie-break by id for deterministic output.
  cards.sort(
    (a, b) =>
      b.latestCompletedAt - a.latestCompletedAt ||
      (a.rootId < b.rootId ? -1 : a.rootId > b.rootId ? 1 : 0),
  );
  return cards;
}

function buildArchiveTree(
  blocks: Block[],
  node: Block,
  include: Set<string>,
): BlockTreeNode {
  const children = blocks
    .filter((b) => b.parentId === node.id && include.has(b.id))
    .sort((a, b) => a.order - b.order)
    .map((child) => buildArchiveTree(blocks, child, include));
  return { block: node, children, dimmed: node.status !== 'completed' };
}
