import { expect, test, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { saveViaDownload, runCommand } from './helpers';

async function iconButtonDesign(locator: Locator) {
  await locator.hover();
  await locator.focus();
  await locator.page().waitForTimeout(250);

  return locator.evaluate((button: HTMLElement) => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    const svg = button.querySelector('svg');
    const svgStyle = svg ? getComputedStyle(svg) : null;

    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      boxShadow: style.boxShadow,
      color: style.color,
      height: Math.round(rect.height),
      opacity: style.opacity,
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      svgHeight: svgStyle?.height ?? '',
      svgWidth: svgStyle?.width ?? '',
      transform: style.transform,
      width: Math.round(rect.width)
    };
  });
}

test('edits a new Markdown document in the browser editor', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.addInitScript(() => {
    delete (window as typeof window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Untitled.md' })).toBeVisible();

  const editor = page.locator('.cm-content[contenteditable="true"]').first();
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.type('# Integration Brief');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Draft paragraph from a browser integration test.');

  await expect(editor).toContainText('Integration Brief');
  await expect(editor).toContainText('Draft paragraph from a browser integration test.');

  await page.getByLabel('Collapse heading section').first().click();
  await expect(page.locator('.cm-collapsed-heading-hidden-line')).toHaveCount(2);

  await page.getByLabel('Expand heading section').first().click();
  await expect(page.locator('.cm-collapsed-heading-hidden-line')).toHaveCount(0);

  const download = await saveViaDownload(page);
  const savedPath = await download.path();

  expect(download.suggestedFilename()).toBe('Untitled.md');
  expect(savedPath).toBeTruthy();
  const savedMarkdown = await readFile(savedPath as string, 'utf8');
  expect(savedMarkdown).toContain(
    ['# Integration Brief', '', 'Draft paragraph from a browser integration test.'].join('\n')
  );
});

test('renders Markdown math in the live preview editor', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/');

  const editor = page.locator('.cm-content[contenteditable="true"]').first();
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.insertText('Inline $ \\sum_i x_i $ math.');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('$$ \\sum_{i=1}^n x_i $$');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('$$');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('\\int_0^1 x^2 dx');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('$$');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('after math');

  const inlineMath = page.locator('.markdown-math-widget.inline .katex').first();

  await expect(inlineMath).toBeVisible();
  await expect(inlineMath).toHaveCSS('font-family', /Euler Math/);
  await expect(page.locator('.markdown-math-widget.inline .mathnormal').first()).toHaveCSS('font-family', /Euler Math/);
  await expect(page.locator('.markdown-math-widget.inline .op-symbol.small-op').first()).toHaveCSS('font-family', /Euler Math/);
  await expect(page.locator('.markdown-math-widget.display .katex-display').first()).toBeVisible();
  await expect(page.locator('.markdown-math-widget.display .op-symbol.large-op').first()).toHaveCSS('font-family', /Euler Math/);
  await expect(page.locator('.cm-line .markdown-math-widget.display')).toBeVisible();
});

test('edits a saved margin comment', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.addInitScript(() => {
    delete (window as typeof window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');

  const editor = page.locator('.cm-content[contenteditable="true"]').first();
  await expect(editor).toBeVisible();

  const commentedLine = 'Draft paragraph that needs a margin note.';

  await editor.click();
  await page.keyboard.type('# Integration Brief');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type(commentedLine);

  await page.keyboard.press('Shift+Home');
  const browserModKey = await page.evaluate(() => navigator.platform.startsWith('Mac') ? 'Meta' : 'Control');

  await page.keyboard.press(`${browserModKey}+Alt+m`);
  await page.getByPlaceholder('Add a comment').fill('First note');
  await page.getByRole('button', { name: 'Comment' }).click();

  await expect(page.getByText('First note')).toBeVisible();

  await page.getByRole('button', { name: 'Go to comment' }).hover();
  await page.getByLabel('Edit comment').click();

  const editComment = page.getByRole('textbox', { name: 'Edit comment' });

  await expect(editComment).toBeVisible();
  await editComment.fill('Updated note after review.');
  await page.getByRole('button', { name: 'Save comment' }).click();

  await expect(page.getByText('Updated note after review.')).toBeVisible();
  await expect(page.getByText('First note')).toHaveCount(0);

  const download = await saveViaDownload(page);
  const savedPath = await download.path();

  expect(savedPath).toBeTruthy();
  const savedMarkdown = await readFile(savedPath as string, 'utf8');
  expect(savedMarkdown).toContain('Updated note after review.');
  expect(savedMarkdown).not.toContain('First note');
});

test('finds and replaces text from the keyboard-opened dialog', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/');

  const editor = page.locator('.cm-content[contenteditable="true"]').first();
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.type('Alpha beta');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second Alpha line');

  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+F`);

  const findDialog = page.getByRole('dialog', { name: 'Find and replace' });
  await expect(findDialog).toHaveClass(/is-compact/);

  const findField = page.getByRole('textbox', { name: 'Find' });
  await expect(findField).toBeVisible();
  await findField.fill('Alpha');

  await page.getByRole('button', { name: 'Show more options' }).click();
  await expect(findDialog).toHaveClass(/is-expanded/);
  await expect(page.locator('.margin-find-status')).toHaveText('2 matches');

  await page.keyboard.press('Enter');
  await expect(page.locator('.margin-find-status')).toHaveText('1 of 2');

  await page.getByRole('textbox', { name: 'Replace' }).fill('Gamma');
  await page.getByRole('button', { name: 'Replace all matches' }).click();

  await expect(editor).toContainText('Gamma beta');
  await expect(editor).toContainText('second Gamma line');
  await expect(editor).not.toContainText('Alpha');
});

test('opens the expanded find and replace dialog from its shortcut', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/');

  const editor = page.locator('.cm-content[contenteditable="true"]').first();
  await expect(editor).toBeVisible();

  await editor.click();

  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+Alt+F`);

  const findDialog = page.getByRole('dialog', { name: 'Find and replace' });
  await expect(findDialog).toHaveClass(/is-expanded/);
  await expect(page.getByRole('textbox', { name: 'Find' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Replace' })).toBeVisible();
});

test('keeps find and settings dialogs mutually exclusive', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/');

  const editor = page.locator('.cm-content[contenteditable="true"]').first();
  await expect(editor).toBeVisible();

  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

  await editor.click();
  await page.keyboard.press(`${modifier}+F`);

  const findDialog = page.getByRole('dialog', { name: 'Find and replace' });
  await expect(findDialog).toBeVisible();

  await runCommand(page, 'Settings');

  const settingsDialog = page.getByRole('dialog', { name: 'General' });
  await expect(settingsDialog).toBeVisible();
  await expect(findDialog).toBeHidden();

  const settingsClose = page.getByRole('button', { name: 'Close settings' });
  const settingsCloseBox = await settingsClose.boundingBox();
  expect(settingsCloseBox?.width).toBe(28);
  expect(settingsCloseBox?.height).toBe(28);
  const settingsIconDesign = await iconButtonDesign(settingsClose);

  await page.keyboard.press(`${modifier}+F`);

  await expect(settingsDialog).toBeHidden();
  await expect(findDialog).toBeVisible();

  const findMoreButton = page.getByRole('button', { name: 'Show more options' });
  const findMoreBox = await findMoreButton.boundingBox();
  expect(findMoreBox?.width).toBe(28);
  expect(findMoreBox?.height).toBe(28);
  expect(await iconButtonDesign(findMoreButton)).toEqual(settingsIconDesign);
});
