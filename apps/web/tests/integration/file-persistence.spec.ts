import { expect, test } from '@playwright/test';
import {
  editor,
  filePickerSnapshot,
  installFilePickerMock,
  openCleanApp,
  replaceEditorMarkdown,
  runCommand,
  setFilePickerMarkdown
} from './helpers';

test('opens and saves through browser file handles', async ({ page }) => {
  await installFilePickerMock(page, [
    {
      name: 'Opened.md',
      markdown: '# Opened\n\nLoaded from a browser file handle.',
      writable: true
    }
  ]);
  await openCleanApp(page, '/', { preserveFilePicker: true });

  await runCommand(page, 'Open Document...');
  await expect(page.getByRole('heading', { name: 'Opened.md' })).toBeVisible();
  await expect(editor(page)).toContainText('Loaded from a browser file handle.');

  await replaceEditorMarkdown(page, '# Opened\n\nSaved through a writable handle.');
  await runCommand(page, 'Save Document');

  await expect.poll(async () => {
    const snapshot = await filePickerSnapshot(page);
    return snapshot.files.find((file) => file.name === 'Opened.md')?.writes.at(-1) ?? '';
  }).toContain('Saved through a writable handle.');
});

test('autosaves writable browser handles without prompting', async ({ page }) => {
  await installFilePickerMock(page, [
    {
      name: 'Autosave.md',
      markdown: 'Original autosave body.',
      writable: true
    }
  ]);
  await openCleanApp(page, '/', { preserveFilePicker: true });

  await runCommand(page, 'Open Document...');
  await replaceEditorMarkdown(page, 'Autosaved body.');
  await expect.poll(async () => {
    const snapshot = await filePickerSnapshot(page);
    return snapshot.files.find((file) => file.name === 'Autosave.md')?.writes.at(-1) ?? '';
  }).toContain('Autosaved body.');

  const snapshot = await filePickerSnapshot(page);
  expect(snapshot.savePickerCalls).toHaveLength(0);
});

test('detects browser file handle conflicts before overwriting', async ({ page }) => {
  await installFilePickerMock(page, [
    {
      name: 'Conflict.md',
      markdown: 'Original body.',
      writable: true
    }
  ]);
  await openCleanApp(page, '/', { preserveFilePicker: true });

  await runCommand(page, 'Open Document...');
  await setFilePickerMarkdown(page, 'Conflict.md', 'Changed outside Margin.');
  await replaceEditorMarkdown(page, 'Local unsaved body.');
  await runCommand(page, 'Save Document');

  await expect(page.getByText('This file changed outside Margin. Reopen it or use Save As to keep both versions.')).toBeVisible();

  const snapshot = await filePickerSnapshot(page);
  expect(snapshot.files.find((file) => file.name === 'Conflict.md')?.writes).toHaveLength(0);
});
