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
