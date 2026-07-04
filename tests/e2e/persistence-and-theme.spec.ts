// AC34 (JSON export/import round-trip) and AC47 (theme toggle persists).
//
// The theme test reloads the page mid-test, relying on localStorage
// surviving navigation within the SAME browser context (see fixtures.ts's
// note on why we don't clear storage via addInitScript).
//
// The export/import test deliberately does NOT reload the same page to
// simulate "starting from empty": src/lib/platform/browser.ts wires
// `onCloseRequested` to `beforeunload`, and App.svelte flushes the
// in-memory state on that hook (D10, crash/close safety). A `page.reload()`
// fires `beforeunload` on the OLD document first, so `localStorage.clear()`
// followed by `page.reload()` would get its clear silently undone by that
// close-flush (the in-memory store still holds the data). Using a second,
// separate browser context for the "empty app" side sidesteps that
// entirely — and is arguably closer to the real scenario (import on a
// fresh install) anyway.
import { test, expect } from '@playwright/test';
import { gotoFresh, createBlock, blockByText } from './fixtures';

test('theme toggle persists across a reload (AC47)', async ({ page }) => {
  await gotoFresh(page);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  await expect.poll(theme).toBe('dark'); // dark-by-default (D9)

  await page.getByTitle('테마 전환').click();
  await expect.poll(theme).toBe('light');

  await page.reload();
  await expect(page.getByPlaceholder('새 작업 입력 후 Enter')).toBeVisible();
  await expect.poll(theme).toBe('light');
});

test('export then import round-trips the full app state (AC34)', async ({ browser }, testInfo) => {
  const sourceContext = await browser.newContext();
  const sourcePage = await sourceContext.newPage();
  await gotoFresh(sourcePage);
  await createBlock(sourcePage, 'Exported Task');

  const downloadPromise = sourcePage.waitForEvent('download');
  await sourcePage.getByTitle('내보내기').click();
  const download = await downloadPromise;
  const exportPath = testInfo.outputPath('export.json');
  await download.saveAs(exportPath);
  await sourceContext.close();

  // A fresh context/origin storage partition — genuinely empty, no shared
  // state with sourceContext.
  const targetContext = await browser.newContext();
  const targetPage = await targetContext.newPage();
  await gotoFresh(targetPage);
  await expect(blockByText(targetPage, 'Exported Task')).toHaveCount(0);

  const fileChooserPromise = targetPage.waitForEvent('filechooser');
  await targetPage.getByTitle('가져오기').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(exportPath);

  await expect(blockByText(targetPage, 'Exported Task')).toBeVisible();
  await targetContext.close();
});
