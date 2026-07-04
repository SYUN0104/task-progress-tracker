// AC1-4, AC13, AC43-45: block/column creation, renaming, quick-add child,
// collapse, column color/label, and horizontal wheel scroll.
import { test, expect } from '@playwright/test';
import {
  gotoFresh,
  createBlock,
  createBlockViaButton,
  createChildBlock,
  blockByText,
  columnContaining,
  activeColumnOrder,
} from './fixtures';

test('Enter creates a block, each new block opens a new column (AC1/AC2)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'First Task');
  await expect(page.locator('.columns-scroll > .column')).toHaveCount(1);

  await createBlock(page, 'Second Task');
  // AC2: a brand-new block always opens a brand-new column, never merges
  // into an existing one.
  await expect(page.locator('.columns-scroll > .column')).toHaveCount(2);
  expect(await activeColumnOrder(page)).toEqual(['First Task', 'Second Task']);
});

test('the "추가" button creates a block identically to Enter (AC1)', async ({ page }) => {
  await gotoFresh(page);
  await createBlockViaButton(page, 'Via Button');
  await expect(blockByText(page, 'Via Button')).toBeVisible();
});

test('(+) adds an empty column that can later be filled by drag (AC3)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Anchor Task');
  await expect(page.locator('.columns-scroll > .column')).toHaveCount(1);

  await page.getByRole('button', { name: '새 작업단위 추가' }).click();
  await expect(page.locator('.columns-scroll > .column')).toHaveCount(2);
  const newColumn = page.locator('.columns-scroll > .column').nth(1);
  await expect(newColumn.locator('.empty-hint')).toBeVisible();
  await expect(newColumn.locator('.block-node')).toHaveCount(0);
});

test('a column can be named and renamed (AC4)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Naming Task');
  const column = columnContaining(page, 'Naming Task');

  await column.getByRole('button', { name: '이름 없는 작업단위' }).click();
  const nameInput = column.locator('.name-edit');
  await nameInput.fill('Sprint Board');
  await nameInput.press('Enter');
  await expect(column.getByRole('button', { name: 'Sprint Board' })).toBeVisible();

  // Rename again to confirm it is editable more than once.
  await column.getByRole('button', { name: 'Sprint Board' }).click();
  await column.locator('.name-edit').fill('Renamed Board');
  await column.locator('.name-edit').press('Enter');
  await expect(column.getByRole('button', { name: 'Renamed Board' })).toBeVisible();
});

test('hover "+" quick-adds a child block without dragging (AC43)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Quick Parent');
  await createChildBlock(page, 'Quick Parent', 'Quick Child');
  const parent = blockByText(page, 'Quick Parent');
  await expect(parent.locator(':scope > .children > .block-node')).toHaveCount(1);
});

test('subtree collapse/expand hides and reveals children (AC44)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Collapsible Parent');
  await createChildBlock(page, 'Collapsible Parent', 'Hideable Child');
  const parent = blockByText(page, 'Collapsible Parent');

  await expect(parent.locator(':scope > .children')).toBeVisible();
  await parent.locator(':scope > .block-row > .chevron').click();
  await expect(parent.locator(':scope > .children')).toHaveCount(0);

  await parent.locator(':scope > .block-row > .chevron').click();
  await expect(parent.locator(':scope > .children')).toBeVisible();
});

test('column color and label are customizable (AC45)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Styled Task');
  const column = columnContaining(page, 'Styled Task');

  await column.getByTitle('라벨 편집').click();
  const labelInput = column.locator('.label-edit-row input');
  await labelInput.fill('Design');
  await labelInput.press('Enter');
  await expect(column.locator('.label-chip')).toHaveText('Design');

  await column.getByTitle('색상').click();
  await column.locator('.color-picker .swatch').first().click();
  await expect(column.locator('.column-header')).toHaveAttribute('style', /border-top-color/);
});

test('mouse wheel scrolls the Active section horizontally, never vertically (AC13)', async ({ page }) => {
  await gotoFresh(page);
  // Enough columns (each ~280px + padding) to overflow a normal viewport width.
  for (let i = 0; i < 8; i++) await createBlock(page, `Wheel Task ${i}`);

  const scrollEl = page.locator('.columns-scroll');
  const before = await scrollEl.evaluate((el) => el.scrollLeft);
  await scrollEl.hover();
  await page.mouse.wheel(0, 600); // vertical wheel delta only
  await expect
    .poll(() => scrollEl.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(before);
  // No vertical scrollbar/scroll should ever occur (AC13: columns wrap sideways only).
  expect(await scrollEl.evaluate((el) => el.scrollTop)).toBe(0);
});
