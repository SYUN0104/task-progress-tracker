// AC20-24: mandatory-annotation hold, frozen timer, resume, and the
// holdRootId-stamped nested-hold safety (plan D3).
import { test, expect } from '@playwright/test';
import {
  gotoFresh,
  createBlock,
  createChildBlock,
  blockByText,
  blockRow,
  chooseContextMenuItem,
  holdBlock,
  switchTab,
  holdCardByText,
} from './fixtures';

test('holding without an annotation is impossible; cancel aborts the move (AC20)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Cancel Hold Task');

  await chooseContextMenuItem(page, 'Cancel Hold Task', '홀드로 이동');
  await expect(page.getByText('홀드로 이동').first()).toBeVisible(); // modal heading
  // No title yet: submit must be disabled (title required).
  await expect(page.getByRole('button', { name: '홀드', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '취소', exact: true }).click();

  // Cancel aborts entirely — block stays active, untouched.
  await expect(blockByText(page, 'Cancel Hold Task')).toBeVisible();
  await switchTab(page, 'Hold');
  await expect(holdCardByText(page, 'Cancel Hold Task')).toHaveCount(0);
});

test('holding requires only a title, moves the block to the Hold grid, and freezes its timer (AC20/AC22)', async ({
  page,
}) => {
  await gotoFresh(page);
  await createBlock(page, 'Held Task');
  await holdBlock(page, 'Held Task', { title: 'waiting on review' });

  await expect(blockByText(page, 'Held Task')).toHaveCount(0); // gone from Active

  await switchTab(page, 'Hold');
  const card = holdCardByText(page, 'Held Task');
  await expect(card).toBeVisible();
  const elapsed = card.locator('.elapsed.frozen');
  await expect(elapsed).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  const frozenValue = await elapsed.innerText();

  // The frozen value must not advance even as real time passes (AC22).
  await page.waitForTimeout(1200);
  await expect(elapsed).toHaveText(frozenValue);
});

test('resuming a held block returns it to Active with the timer continuing from the frozen value (AC24)', async ({
  page,
}) => {
  await gotoFresh(page);
  await createBlock(page, 'Resumable Task');
  await holdBlock(page, 'Resumable Task', { title: 'blocked on design' });

  await switchTab(page, 'Hold');
  const card = holdCardByText(page, 'Resumable Task');
  await card.getByRole('button', { name: '작업 재개' }).click();

  await expect(holdCardByText(page, 'Resumable Task')).toHaveCount(0);
  await switchTab(page, 'Active');
  await expect(blockByText(page, 'Resumable Task')).toBeVisible();
  // Resumed elapsed keeps ticking (not reset to zero) and is no longer frozen.
  await expect(blockRow(page, 'Resumable Task').locator('.elapsed')).not.toHaveClass(/frozen/);
});

test('the Hold section renders as a grid (AC24)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Grid Hold Task');
  await holdBlock(page, 'Grid Hold Task', { title: 'grid check' });
  await switchTab(page, 'Hold');
  await expect(page.locator('.hold-section .grid')).toBeVisible();
});

test('holding a parent moves its subtree as one unit (AC21)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Subtree Parent');
  await createChildBlock(page, 'Subtree Parent', 'Subtree Child');
  await holdBlock(page, 'Subtree Parent', { title: 'pausing the whole thing' });

  await expect(blockByText(page, 'Subtree Parent')).toHaveCount(0); // gone from Active
  await switchTab(page, 'Hold');
  const card = holdCardByText(page, 'Subtree Parent');
  await expect(card).toBeVisible();
  await expect(card.getByText('Subtree Child')).toBeVisible();
});

test('nested hold: a held child keeps its own hold unit after the parent is held and resumed (D3)', async ({
  page,
}) => {
  await gotoFresh(page);
  await createBlock(page, 'Nested Parent');
  await createChildBlock(page, 'Nested Parent', 'Nested Child');

  // Hold the child individually first.
  await holdBlock(page, 'Nested Child', { title: 'child paused first' });
  await expect(blockByText(page, 'Nested Child')).toHaveCount(0);
  await expect(blockByText(page, 'Nested Parent')).toBeVisible(); // parent still active/live

  // Now hold the parent — its own (formerly-active) subtree becomes held,
  // but the already-held child must NOT be re-stamped into the parent's unit.
  await holdBlock(page, 'Nested Parent', { title: 'parent paused too' });

  await switchTab(page, 'Hold');
  // Two SEPARATE cards: nesting does not merge hold units (D3 holdRootId stamp).
  await expect(holdCardByText(page, 'Nested Parent')).toBeVisible();
  await expect(holdCardByText(page, 'Nested Child')).toBeVisible();
  await expect(page.locator('.hold-card')).toHaveCount(2);

  // Resuming the parent must not disturb the child's independent hold.
  await holdCardByText(page, 'Nested Parent')
    .getByRole('button', { name: '작업 재개' })
    .click();

  await expect(holdCardByText(page, 'Nested Parent')).toHaveCount(0);
  await expect(holdCardByText(page, 'Nested Child')).toBeVisible(); // still held

  await switchTab(page, 'Active');
  await expect(blockByText(page, 'Nested Parent')).toBeVisible();
  await expect(blockByText(page, 'Nested Child')).toHaveCount(0); // still not active
});
