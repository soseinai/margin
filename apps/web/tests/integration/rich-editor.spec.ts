import { expect, test } from '@playwright/test';
import {
  activeEditorLineText,
  editor,
  openCleanApp,
  platformModifier,
  replaceEditorMarkdown,
  saveViaDownload,
  setEditorSelection
} from './helpers';
import { readFile } from 'node:fs/promises';

test('task checkbox toggles the saved Markdown source', async ({ page }) => {
  await openCleanApp(page);
  await replaceEditorMarkdown(page, '- [ ] Ship the test plan');

  await page.getByLabel('Mark task complete').click();
  await expect(page.getByLabel('Mark task incomplete')).toBeVisible();

  const download = await saveViaDownload(page);
  const savedMarkdown = await readFile((await download.path()) as string, 'utf8');
  expect(savedMarkdown).toContain('- [x] Ship the test plan');
});

test('smart list enter continues markers and backspace exits an empty marker', async ({ page }) => {
  await openCleanApp(page);
  await replaceEditorMarkdown(page, '- First item');

  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Second item');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText('Plain paragraph');

  const download = await saveViaDownload(page);
  const savedMarkdown = await readFile((await download.path()) as string, 'utf8');
  expect(savedMarkdown).toContain(['- First item', '- Second item', '  Plain paragraph'].join('\n'));
});

test('list collapse hides and shows child lines', async ({ page }) => {
  await openCleanApp(page);
  await replaceEditorMarkdown(page, ['- Parent', '  - Child', '- Sibling'].join('\n'));

  const parentLine = page.locator('.cm-live-list-parent').filter({ hasText: 'Parent' }).first();
  await parentLine.hover();
  await page.getByLabel('Collapse list item').first().click();
  await expect(page.getByLabel('Expand list item')).toBeVisible();
  await expect(page.locator('.cm-collapsed-list-hidden-line')).toHaveCount(1);

  await page.getByLabel('Expand list item').first().click();
  await expect(page.locator('.cm-collapsed-list-hidden-line')).toHaveCount(0);
});

test('renders edit affordances for rich Markdown widgets', async ({ page }) => {
  await openCleanApp(page);
  const markdown = [
    '---',
    'title: Widget Brief',
    'tags:',
    '  - margin',
    '---',
    '',
    '| Column | Status |',
    '| --- | --- |',
    '| Item | Draft |',
    '',
    '![Product shot](https://example.com/product.png)',
    '',
    '***',
    '',
    'Plain anchor'
  ].join('\n');
  await replaceEditorMarkdown(page, markdown);
  await setEditorSelection(page, markdown.length, markdown.length);

  await expect(page.getByLabel('Edit front matter')).toBeVisible();
  await expect(page.getByLabel('Edit Markdown table')).toBeVisible();
  await expect(page.getByLabel('Edit Markdown image')).toBeVisible();
  await expect(page.getByLabel('Edit horizontal rule')).toBeVisible();
});

test('drops image sources into the editor as Markdown references', async ({ page }) => {
  await openCleanApp(page);
  await replaceEditorMarkdown(page, 'Drop below.');

  await editor(page).dispatchEvent('drop', {
    clientX: 100,
    clientY: 120,
    dataTransfer: await page.evaluateHandle(() => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', 'https://example.com/product-shot.png');
      return dataTransfer;
    })
  });

  const download = await saveViaDownload(page);
  const savedMarkdown = await readFile((await download.path()) as string, 'utf8');
  expect(savedMarkdown).toContain('![product shot](https://example.com/product-shot.png)');
});

test('modifier-clicking a footnote reference jumps to its definition', async ({ page }) => {
  await openCleanApp(page);
  await replaceEditorMarkdown(
    page,
    ['Footnote reference[^1].', '', '', '', '', '', '', '[^1]: Footnote definition.'].join('\n')
  );

  await page.locator('[data-footnote-id="1"]').first().evaluate((node, modifier) => {
    node.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        metaKey: modifier === 'Meta',
        ctrlKey: modifier === 'Control'
      })
    );
  }, await platformModifier(page));
  await expect.poll(() => activeEditorLineText(page)).toContain('Footnote definition.');
});
