// AC35: unlimited (session-scoped) undo, exercised via Ctrl+Z. The undo-stack
// cap (500, a documented deviation — see docs/AC-CHECKLIST.md) and the
// exhaustive action-type coverage (AC36) are unit-tested in
// tests/domain/undo.test.ts; this suite only proves the end-to-end wiring:
// dispatch -> snapshot -> Ctrl+Z -> restore.
import { test, expect } from '@playwright/test';
import { gotoFresh, createBlock, completeBlock, blockByText, blurFocus } from './fixtures';

test('the undo button is disabled until there is a domain action to undo', async ({ page }) => {
  await gotoFresh(page);
  const undoButton = page.getByTitle('실행 취소 (Ctrl+Z)');
  await expect(undoButton).toBeDisabled();
  await createBlock(page, 'Undo Enabler');
  await expect(undoButton).toBeEnabled();
});

test('Ctrl+Z undoes a completion, restoring the block to Active (AC35)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Undo Me');
  await completeBlock(page, 'Undo Me');
  await expect(blockByText(page, 'Undo Me')).toHaveCount(0);

  await page.keyboard.press('Control+z');
  await expect(blockByText(page, 'Undo Me')).toBeVisible();
});

test('the toolbar undo icon performs the same undo as Ctrl+Z (AC35)', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Toolbar Undo');
  await completeBlock(page, 'Toolbar Undo');
  await expect(blockByText(page, 'Toolbar Undo')).toHaveCount(0);

  await page.getByTitle('실행 취소 (Ctrl+Z)').click();
  await expect(blockByText(page, 'Toolbar Undo')).toBeVisible();
});

test('undo walks back multiple domain actions in reverse order', async ({ page }) => {
  await gotoFresh(page);
  await createBlock(page, 'Step One');
  await createBlock(page, 'Step Two');
  await expect(blockByText(page, 'Step One')).toBeVisible();
  await expect(blockByText(page, 'Step Two')).toBeVisible();

  // The quick-create input still has focus after the last Enter (by design,
  // for fast successive entry) — Ctrl+Z is deliberately swallowed there (D6)
  // in favor of native text-field undo, so blur first, as a real user
  // clicking elsewhere before pressing Ctrl+Z would.
  await blurFocus(page);
  await page.keyboard.press('Control+z'); // undoes "Step Two" creation
  await expect(blockByText(page, 'Step Two')).toHaveCount(0);
  await expect(blockByText(page, 'Step One')).toBeVisible();

  await page.keyboard.press('Control+z'); // undoes "Step One" creation
  await expect(blockByText(page, 'Step One')).toHaveCount(0);
});
