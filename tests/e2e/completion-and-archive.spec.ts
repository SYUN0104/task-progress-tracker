// AC5-7, AC14-16 (completion rules), AC25-30 (Archive section).
import { test, expect } from '@playwright/test';
import {
  gotoFresh,
  createBlock,
  createChildBlock,
  blockByText,
  blockRow,
  completeBlock,
  chooseContextMenuItem,
  holdBlock,
  switchTab,
  archiveCardByText,
} from './fixtures';

test('left-click completes a block, moving it out of Active (AC5)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Simple Task');
  await completeBlock(page, 'Simple Task');
  await expect(blockByText(page, 'Simple Task')).toHaveCount(0);

  await switchTab(page, 'Archive');
  await expect(archiveCardByText(page, 'Simple Task')).toBeVisible();
});

test('right-click menu on an active block offers only edit-text and hold (AC6/AC14)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Menu Task');
  await blockRow(page, 'Menu Task').click({ button: 'right' });
  const menuItems = page.locator('.context-menu .menu-item');
  await expect(menuItems).toHaveCount(2);
  await expect(menuItems).toHaveText(['텍스트 수정', '홀드로 이동']);
  // No delete option anywhere on an active/in-progress block (AC14).
  await expect(page.getByRole('button', { name: '삭제', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('"텍스트 수정" edits the block text in place (AC6)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Original Text');
  await chooseContextMenuItem(page, 'Original Text', '텍스트 수정');
  // Not `blockByText(...).locator('.text-edit')`: entering edit mode replaces
  // the `.text` span the filter matches on with the input itself, so
  // re-resolving the filtered locator here would find nothing. Only one block
  // exists in this test, so the page-scoped selector is unambiguous.
  const editInput = page.locator('.text-edit');
  await editInput.fill('Edited Text');
  await editInput.press('Enter');
  await expect(blockByText(page, 'Edited Text')).toBeVisible();
  await expect(blockByText(page, 'Original Text')).toHaveCount(0);
});

test('a block shows an HH:MM:SS elapsed counter (AC7)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Timed Task');
  const elapsed = blockRow(page, 'Timed Task').locator('.elapsed');
  await expect(elapsed).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
});

test('completing a parent with an incomplete child is blocked by a warning (AC15/AC16)', async ({
  page,
}) => {
  await gotoFresh(page);
  await createBlock(page, 'Blocked Parent');
  await createChildBlock(page, 'Blocked Parent', 'Incomplete Child');

  await completeBlock(page, 'Blocked Parent');
  await expect(page.getByText('완료할 수 없습니다')).toBeVisible();
  await page.getByRole('button', { name: '확인' }).click();
  // Still active — the blocked attempt must be a true no-op.
  await expect(blockByText(page, 'Blocked Parent')).toBeVisible();

  // Complete the leaf first (AC16: completion starts from the leaves)...
  await completeBlock(page, 'Incomplete Child');
  await expect(blockByText(page, 'Incomplete Child')).toHaveCount(0);
  // ...then the parent becomes completable.
  await completeBlock(page, 'Blocked Parent');
  await expect(blockByText(page, 'Blocked Parent')).toHaveCount(0);
});

test('a held child also blocks parent completion (AC15 held-descendant case)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Parent With Held Child');
  await createChildBlock(page, 'Parent With Held Child', 'Held Child');
  await holdBlock(page, 'Held Child', { title: 'paused for now' });

  await completeBlock(page, 'Parent With Held Child');
  await expect(page.getByText('완료할 수 없습니다')).toBeVisible();
  await page.getByRole('button', { name: '확인' }).click();
  await expect(blockByText(page, 'Parent With Held Child')).toBeVisible();
});

test('archive keeps the full tree, dimming an incomplete ancestor for context (AC25/AC26)', async ({
  page,
}) => {
  await gotoFresh(page);
  await createBlock(page, 'Live Parent');
  await createChildBlock(page, 'Live Parent', 'Done Leaf');
  await completeBlock(page, 'Done Leaf');

  // The parent stays live in Active (AC26, second half).
  await expect(blockByText(page, 'Live Parent')).toBeVisible();

  await switchTab(page, 'Archive');
  const card = archiveCardByText(page, 'Done Leaf');
  await expect(card).toBeVisible();
  await expect(card.getByText('Live Parent')).toBeVisible();
  const dimmedAncestor = card.locator('.block-node.dimmed');
  await expect(dimmedAncestor).toHaveCount(1);
  await expect(dimmedAncestor.locator(':scope > .block-row .text')).toHaveText('Live Parent');
});

test('archive annotation can be added, then edited with the previous value pre-filled (AC27/AC28)', async ({
  page,
}) => {
  await gotoFresh(page);
  await createBlock(page, 'Annotate Me');
  await completeBlock(page, 'Annotate Me');
  await switchTab(page, 'Archive');

  await chooseContextMenuItem(page, 'Annotate Me', '주석 추가');
  await page.getByLabel('제목 *').fill('First note');
  await page.getByLabel('내용').fill('some detail');
  await page.getByRole('button', { name: '저장', exact: true }).click();

  const card = archiveCardByText(page, 'Annotate Me');
  await expect(card.locator('.annotation-title')).toHaveText('First note');
  await expect(card.locator('.annotation-body')).toHaveText('some detail');

  // Edit: the modal must reopen pre-filled with the existing title/body.
  await chooseContextMenuItem(page, 'Annotate Me', '주석 수정');
  await expect(page.getByLabel('제목 *')).toHaveValue('First note');
  await expect(page.getByLabel('내용')).toHaveValue('some detail');
  await page.getByLabel('제목 *').fill('Updated note');
  await page.getByRole('button', { name: '저장', exact: true }).click();

  await expect(card.locator('.annotation-title')).toHaveText('Updated note');
});

test('archive block delete requires confirmation and then removes the subtree (AC27/AC29)', async ({
  page,
}) => {
  await gotoFresh(page);
  await createBlock(page, 'Deletable Task');
  await completeBlock(page, 'Deletable Task');
  await switchTab(page, 'Archive');

  await chooseContextMenuItem(page, 'Deletable Task', '블럭 삭제');
  await expect(page.getByText('확인 필요')).toBeVisible();
  // Cancel first: the block must survive an aborted delete.
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(archiveCardByText(page, 'Deletable Task')).toBeVisible();

  await chooseContextMenuItem(page, 'Deletable Task', '블럭 삭제');
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(archiveCardByText(page, 'Deletable Task')).toHaveCount(0);
});

test('the Archive section renders as a grid (AC30)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Grid Task');
  await completeBlock(page, 'Grid Task');
  await switchTab(page, 'Archive');
  await expect(page.locator('.archive-section .grid')).toBeVisible();
});
