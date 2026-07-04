// Shared helpers for the Playwright smoke suite. Deliberately framework-thin:
// every helper drives the app the way a real user would (fill/click/mouse
// gestures) rather than reaching into the store, so the suite exercises the
// same DOM/DnD contract a human (or WebView2) would.
//
// Selector strategy: prefer existing data-* attributes (`data-block-id`,
// `data-workunit-id`, `data-column-handle`) and accessible roles/labels/titles
// already present in the markup (see src/lib/components/*.svelte) over CSS
// class names, falling back to structural class selectors only where no
// semantic hook exists (e.g. `.block-row`, `.column-drop-area`).
import { expect, type Locator, type Page } from '@playwright/test';

/** Escape a string for embedding in a RegExp literal. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-string exact match, so "Task" never matches "Task 2". */
export function exact(text: string): RegExp {
  return new RegExp(`^${escapeRegExp(text)}$`);
}

/**
 * Navigate to the app. Playwright Test gives every test its own browser
 * context, so localStorage (the browser adapter's `tpt-state` key) already
 * starts empty — no manual clearing required.
 */
export async function gotoFresh(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByPlaceholder('새 작업 입력 후 Enter')).toBeVisible();
}

/** Create a block via the top-bar input + Enter (AC1), which always opens a new column (AC2). */
export async function createBlock(page: Page, text: string): Promise<void> {
  const input = page.getByPlaceholder('새 작업 입력 후 Enter');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(blockByText(page, text)).toBeVisible();
}

/** Create a block via the top-bar "추가" button instead of Enter (still AC1). */
export async function createBlockViaButton(page: Page, text: string): Promise<void> {
  const input = page.getByPlaceholder('새 작업 입력 후 Enter');
  await input.fill(text);
  await page.getByRole('button', { name: '추가', exact: true }).click();
  await expect(blockByText(page, text)).toBeVisible();
}

/** The block-node div (`[data-block-id]`) whose OWN row displays `text` exactly. */
export function blockByText(page: Page, text: string): Locator {
  return page.locator('.block-node').filter({
    has: page.locator(':scope > .block-row .text', { hasText: exact(text) }),
  });
}

/** The header row of a block (safe drag/click target — excludes nested children). */
export function blockRow(page: Page, text: string): Locator {
  return blockByText(page, text).locator(':scope > .block-row');
}

/** The `.column` containing a block with the given (exact) text, anywhere in its tree. */
export function columnContaining(page: Page, blockText: string): Locator {
  return page.locator('.column').filter({
    has: page.locator('.block-row .text', { hasText: exact(blockText) }),
  });
}

/** Switch the top-nav tab (button text is e.g. "Active 3" — count included). */
export async function switchTab(page: Page, tab: 'Active' | 'Hold' | 'Archive'): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${tab}`) }).click();
}

/** Ordered text of a column's direct (top-level) block children. */
export async function columnTopLevelTexts(page: Page, anchorBlockText: string): Promise<string[]> {
  const roots = columnContaining(page, anchorBlockText).locator('.column-body > .block-node');
  const count = await roots.count();
  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    texts.push((await roots.nth(i).locator(':scope > .block-row > .text').innerText()).trim());
  }
  return texts;
}

/** DOM order of Active columns, identified by the first block text found in each. */
export async function activeColumnOrder(page: Page): Promise<string[]> {
  const columns = page.locator('.columns-scroll > .column');
  const count = await columns.count();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await columns
      .nth(i)
      .locator('.block-row .text')
      .first()
      .innerText()
      .catch(() => '(empty)');
    out.push(text);
  }
  return out;
}

// ---- pointer-based DnD --------------------------------------------------
// Mirrors the engine's own disambiguation: down -> several intermediate
// moves (>5px total, so beginDrag() fires and each move schedules a rAF
// hit-test) -> a short pause for the rAF to actually run -> up.

async function pointerDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    // Give the engine's requestAnimationFrame hit-test a chance to run between moves.
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(50);
  await page.mouse.up();
}

async function rowBox(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('boundingBox() returned null — is the element visible?');
  return box;
}

/**
 * Drag `sourceText`'s block onto `targetText`'s block, landing in the given
 * vertical band (D5 classify.ts): 'before'/'after' = sibling insert (AC10),
 * 'child' = nest as a child (AC8).
 */
export async function dragBlockOntoBlock(
  page: Page,
  sourceText: string,
  targetText: string,
  band: 'before' | 'after' | 'child',
): Promise<void> {
  const srcBox = await rowBox(blockRow(page, sourceText));
  const tgtBox = await rowBox(blockRow(page, targetText));
  const from = { x: srcBox.x + srcBox.width / 2, y: srcBox.y + srcBox.height / 2 };
  const yFrac = band === 'before' ? 0.1 : band === 'after' ? 0.9 : 0.5;
  const to = { x: tgtBox.x + tgtBox.width / 2, y: tgtBox.y + tgtBox.height * yFrac };
  await pointerDrag(page, from, to);
}

/** Drag `sourceText`'s block onto a column's empty drop area (AC9: top-level merge). */
export async function dragBlockOntoColumnDropArea(
  page: Page,
  sourceText: string,
  targetColumnDropArea: Locator,
): Promise<void> {
  const srcBox = await rowBox(blockRow(page, sourceText));
  const tgtBox = await rowBox(targetColumnDropArea);
  const from = { x: srcBox.x + srcBox.width / 2, y: srcBox.y + srcBox.height / 2 };
  const to = { x: tgtBox.x + tgtBox.width / 2, y: tgtBox.y + tgtBox.height / 2 };
  await pointerDrag(page, from, to);
}

/** Drag a column's drag handle onto another column's left/right half (AC11: reorder). */
export async function dragColumnHandle(
  page: Page,
  handle: Locator,
  targetColumn: Locator,
  side: 'left' | 'right',
): Promise<void> {
  const srcBox = await rowBox(handle);
  const tgtBox = await rowBox(targetColumn);
  const from = { x: srcBox.x + srcBox.width / 2, y: srcBox.y + srcBox.height / 2 };
  const xFrac = side === 'left' ? 0.15 : 0.85;
  const to = { x: tgtBox.x + tgtBox.width * xFrac, y: tgtBox.y + Math.min(20, tgtBox.height / 2) };
  await pointerDrag(page, from, to);
}

// ---- higher-level flows --------------------------------------------------

/** Hover + click a block's hover "+" to quick-add a child (AC43), then Enter. */
export async function createChildBlock(page: Page, parentText: string, text: string): Promise<void> {
  const parent = blockByText(page, parentText);
  await blockRow(page, parentText).hover();
  await parent.locator(':scope > .block-row > .quick-add').click();
  const input = parent.locator(':scope > .quick-add-row .text-edit');
  await input.fill(text);
  await input.press('Enter');
  await expect(blockByText(page, text)).toBeVisible();
}

/** Left-click (no drag) on a block's row — completes it, per AC5/AC12. */
export async function completeBlock(page: Page, text: string): Promise<void> {
  await blockRow(page, text).click();
}

/**
 * Blur whatever currently has focus. Needed before testing the global Ctrl+Z
 * shortcut (registerUndoShortcut in src/lib/ui/clock.ts) right after typing
 * into the quick-create input: that input keeps focus after Enter (by
 * design, for fast successive entry), and the shortcut deliberately ignores
 * Ctrl+Z while focus is inside an INPUT/TEXTAREA so native text-field undo
 * keeps working (D6) — exactly what a real user would trigger by clicking
 * elsewhere before invoking undo.
 */
export async function blurFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  });
}

/** Right-click a block and choose a context-menu item by its exact label. */
export async function chooseContextMenuItem(page: Page, blockText: string, itemLabel: string): Promise<void> {
  await blockRow(page, blockText).click({ button: 'right' });
  await page.getByRole('button', { name: itemLabel, exact: true }).click();
}

/** Full hold flow: context menu -> annotation modal (title required) -> submit (AC20). */
export async function holdBlock(
  page: Page,
  text: string,
  annotation: { title: string; body?: string },
): Promise<void> {
  await chooseContextMenuItem(page, text, '홀드로 이동');
  await page.getByLabel('제목 *').fill(annotation.title);
  if (annotation.body) await page.getByLabel('내용').fill(annotation.body);
  await page.getByRole('button', { name: '홀드', exact: true }).click();
}

/** The Hold-grid card whose root block displays `text`. */
export function holdCardByText(page: Page, text: string): Locator {
  return page.locator('.hold-card').filter({
    has: page.locator('.block-row .text', { hasText: exact(text) }),
  });
}

/** The Archive card whose tree contains a block displaying `text`. */
export function archiveCardByText(page: Page, text: string): Locator {
  return page.locator('.archive-card').filter({
    has: page.locator('.block-row .text', { hasText: exact(text) }),
  });
}
