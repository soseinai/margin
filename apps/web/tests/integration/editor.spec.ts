import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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

  const downloadPromise = page.waitForEvent('download');
  await page.getByLabel('Save document').click();
  const download = await downloadPromise;
  const savedPath = await download.path();

  expect(download.suggestedFilename()).toBe('Untitled.md');
  expect(savedPath).toBeTruthy();
  const savedMarkdown = await readFile(savedPath as string, 'utf8');
  expect(savedMarkdown).toContain(
    ['# Integration Brief', '', 'Draft paragraph from a browser integration test.'].join('\n')
  );
});
