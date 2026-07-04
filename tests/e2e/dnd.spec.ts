// AC8-12: the pointer DnD engine's four drop types plus the click/drag
// threshold. See src/lib/dnd/engine.ts and src/lib/dnd/classify.ts (unit
// tested separately in tests/dnd/classify.test.ts) for the mechanics this
// suite drives end-to-end.
import { test, expect } from '@playwright/test';
import {
  gotoFresh,
  createBlock,
  blockByText,
  blockRow,
  columnContaining,
  columnTopLevelTexts,
  activeColumnOrder,
  dragBlockOntoBlock,
  dragBlockOntoColumnDropArea,
  dragColumnHandle,
} from './fixtures';

test('dragging a block onto another block nests it as a child (AC8)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Parent Task');
  await createBlock(page, 'Child Candidate');

  await dragBlockOntoBlock(page, 'Child Candidate', 'Parent Task', 'child');

  const parent = blockByText(page, 'Parent Task');
  await expect(parent.locator(':scope > .children > .block-node')).toHaveCount(1);
  await expect(parent.locator(':scope > .children .block-row .text')).toHaveText('Child Candidate');
  // The child's own column is now empty (block moved, not copied).
  await expect(page.locator('.columns-scroll > .column')).toHaveCount(2);
});

test('dragging a block onto a column\'s empty area merges it as a top-level sibling (AC9)', async ({
  page,
}) => {
  await gotoFresh(page);
  await createBlock(page, 'Sibling A');
  await createBlock(page, 'Sibling B');
  // Captured by id (not by the text filter) because after the drag, 'Sibling
  // B' the text no longer lives in this column — a locator re-filtered by
  // that text at assertion time would silently resolve to the OTHER column.
  const columnBId = await columnContaining(page, 'Sibling B').getAttribute('data-workunit-id');

  const dropArea = columnContaining(page, 'Sibling A').locator('.column-drop-area');
  await dragBlockOntoColumnDropArea(page, 'Sibling B', dropArea);

  expect(await columnTopLevelTexts(page, 'Sibling A')).toEqual(['Sibling A', 'Sibling B']);
  // The block MOVES (not copies) into Sibling A's column. Its original
  // column is left behind, now empty — empty columns are never
  // auto-deleted (only an explicit "빈 작업단위 삭제" click removes one), so
  // the total column count stays at 2.
  await expect(page.locator(`.column[data-workunit-id="${columnBId}"] .empty-hint`)).toBeVisible();
  await expect(page.locator('.columns-scroll > .column')).toHaveCount(2);
});

test('top/bottom band drop reorders siblings within a column (AC10)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Order A');
  await createBlock(page, 'Order B');
  const dropArea = columnContaining(page, 'Order A').locator('.column-drop-area');
  await dragBlockOntoColumnDropArea(page, 'Order B', dropArea);
  expect(await columnTopLevelTexts(page, 'Order A')).toEqual(['Order A', 'Order B']);

  // Drop B onto A's TOP band -> insert before.
  await dragBlockOntoBlock(page, 'Order B', 'Order A', 'before');
  expect(await columnTopLevelTexts(page, 'Order A')).toEqual(['Order B', 'Order A']);

  // Drop A onto B's BOTTOM band -> insert after, restoring original order.
  await dragBlockOntoBlock(page, 'Order A', 'Order B', 'after');
  expect(await columnTopLevelTexts(page, 'Order A')).toEqual(['Order B', 'Order A']);
});

test('the column drag handle reorders columns left/right (AC11)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Col A Task');
  await createBlock(page, 'Col B Task');
  expect(await activeColumnOrder(page)).toEqual(['Col A Task', 'Col B Task']);

  const handleB = columnContaining(page, 'Col B Task').locator('[data-column-handle]');
  const colA = columnContaining(page, 'Col A Task');
  await dragColumnHandle(page, handleB, colA, 'left');

  expect(await activeColumnOrder(page)).toEqual(['Col B Task', 'Col A Task']);
});

test('a small movement (<5px) is a click (complete), not a drag (AC12)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Threshold Task');
  const box = await blockRow(page, 'Threshold Task').boundingBox();
  if (!box) throw new Error('missing bounding box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Sub-threshold jitter (well under the engine's 5px DRAG_THRESHOLD) must
  // still resolve as a click: the block completes and moves to Archive.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 2, y + 1);
  await page.mouse.up();

  await expect(blockByText(page, 'Threshold Task')).toHaveCount(0);
});
