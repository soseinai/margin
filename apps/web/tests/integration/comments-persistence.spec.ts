import { expect, test } from '@playwright/test';
import {
  editor,
  editorSelectionText,
  filePickerSnapshot,
  installFilePickerMock,
  openCommentComposer,
  openCleanApp,
  pressMod,
  replaceEditorMarkdown,
  selectAllEditorText,
  setEditorSelection,
  setFilePickerOpenFiles
} from './helpers';

test('adds, focuses, resolves, saves, and reopens local comments', async ({ page }) => {
  await installFilePickerMock(page);
  await openCleanApp(page, '/', { preserveFilePicker: true });

  await replaceEditorMarkdown(page, 'Comment target');
  await selectAllEditorText(page);
  await openCommentComposer(page);

  const composer = page.getByLabel('New comment');
  await expect(composer).toBeVisible();
  await expect(composer.getByRole('button', { name: 'Comment' })).toBeDisabled();

  await page.getByPlaceholder('Add a comment').fill('Please tighten this sentence.');
  await pressMod(page, 'Enter');

  await expect(page.getByRole('button', { name: 'Go to comment' })).toContainText('Please tighten this sentence.');
  await expect(page.locator('.annotation-mark').filter({ hasText: 'Comment target' })).toBeVisible();

  await page.getByRole('button', { name: 'Go to comment' }).click();
  await expect.poll(() => editorSelectionText(page)).toBe('Comment target');

  await page.getByLabel('Resolve comment').click();
  await expect(page.getByText('Please tighten this sentence.')).toBeHidden();

  await selectAllEditorText(page);
  await openCommentComposer(page);
  await page.getByPlaceholder('Add a comment').fill('Persist this comment.');
  await page.getByRole('button', { name: 'Comment' }).click();
  await page.getByLabel('Save document', { exact: true }).click();

  const snapshot = await filePickerSnapshot(page);
  const savedMarkdown = snapshot.saveWrites.at(-1) ?? '';
  expect(savedMarkdown).toContain('Comment target');
  expect(savedMarkdown).toContain('<!-- margin:comments');
  expect(savedMarkdown).toContain('"body": "Persist this comment."');

  await setFilePickerOpenFiles(page, [{ name: 'Commented.md', markdown: savedMarkdown }]);
  await page.getByLabel('New document', { exact: true }).click();
  await page.getByLabel('Open document', { exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Commented.md' })).toBeVisible();
  await expect(editor(page)).toContainText('Comment target');
  await expect(page.getByRole('button', { name: 'Go to comment' })).toContainText('Persist this comment.');
});

test('comment composer supports escape cancel and disabled empty submit', async ({ page }) => {
  await openCleanApp(page);

  await replaceEditorMarkdown(page, 'Temporary comment target');
  await selectAllEditorText(page);
  await openCommentComposer(page);

  await expect(page.getByLabel('New comment')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comment' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(page.getByLabel('New comment')).toBeHidden();
});

test('reveals connector chrome only while hovering the comment area', async ({ page }) => {
  await openCleanApp(page);

  await replaceEditorMarkdown(page, 'Comment target');
  await selectAllEditorText(page);
  await openCommentComposer(page);
  await page.getByPlaceholder('Add a comment').fill('Only show chrome on rail hover.');
  await page.getByRole('button', { name: 'Comment' }).click();

  const card = page.getByRole('button', { name: 'Go to comment' });
  const connectorLayer = page.locator('.connector-layer');
  await expect(card).toContainText('Only show chrome on rail hover.');

  const documentBox = await page.locator('.document-surface').boundingBox();
  if (!documentBox) throw new Error('Document surface is unavailable');

  await page.mouse.move(documentBox.x + 24, documentBox.y + 24);

  await expect.poll(() => connectorLayer.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeLessThan(0.05);
  await expect.poll(() => card.evaluate((node) => Number(getComputedStyle(node, '::before').opacity))).toBeLessThan(0.05);

  await card.hover();

  await expect.poll(() => connectorLayer.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeGreaterThan(0.95);
  await expect.poll(() => card.evaluate((node) => Number(getComputedStyle(node, '::before').opacity))).toBeGreaterThan(0.55);
});

test('keeps selected comment chrome visible until clicking elsewhere', async ({ page }) => {
  await openCleanApp(page);

  await replaceEditorMarkdown(page, 'Comment target');
  await selectAllEditorText(page);
  await openCommentComposer(page);
  await page.getByPlaceholder('Add a comment').fill('Selected comment stays connected.');
  await page.getByRole('button', { name: 'Comment' }).click();

  const card = page.getByRole('button', { name: 'Go to comment' });
  const connectorLayer = page.locator('.connector-layer');
  const documentSurface = page.locator('.document-surface');
  const documentBox = await documentSurface.boundingBox();
  if (!documentBox) throw new Error('Document surface is unavailable');

  await page.mouse.move(documentBox.x + 24, documentBox.y + 24);
  await expect.poll(() => connectorLayer.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeLessThan(0.05);

  await card.click();
  await page.mouse.move(documentBox.x + 24, documentBox.y + 24);

  await expect.poll(() => connectorLayer.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeGreaterThan(0.95);
  await expect.poll(() => card.evaluate((node) => Number(getComputedStyle(node, '::before').opacity))).toBeGreaterThan(0.6);

  await page.mouse.click(documentBox.x + 24, documentBox.y + Math.min(documentBox.height - 24, 240));

  await expect.poll(() => connectorLayer.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeLessThan(0.05);
  await expect.poll(() => card.evaluate((node) => Number(getComputedStyle(node, '::before').opacity))).toBeLessThan(0.05);
});

test('keeps comment rail open while scrolling through uncommented sections', async ({ page }) => {
  await openCleanApp(page);

  const target = 'Comment target';
  const markdown = [
    target,
    ...Array.from({ length: 120 }, (_, index) => `Uncommented paragraph ${index + 1}`)
  ].join('\n\n');

  await replaceEditorMarkdown(page, markdown);
  await setEditorSelection(page, 0, target.length);
  await openCommentComposer(page);
  await page.getByPlaceholder('Add a comment').fill('Keep the rail open.');
  await page.getByRole('button', { name: 'Comment' }).click();

  const rail = page.locator('.margin-rail');
  await expect(rail).toHaveClass(/open/);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  await expect(page.getByRole('button', { name: 'Go to comment' })).toBeHidden();
  await expect(rail).toHaveClass(/open/);
});
