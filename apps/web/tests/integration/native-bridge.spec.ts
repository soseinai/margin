import { expect, test } from '@playwright/test';
import {
  editor,
  emitTauriDragDrop,
  emitTauriEvent,
  installTauriMock,
  openCleanApp,
  replaceEditorMarkdown,
  selectAllEditorText,
  setEditorSelection,
  setTauriDocument,
  tauriCalls
} from './helpers';

function lastCallArgs(calls: Awaited<ReturnType<typeof tauriCalls>>, command: string) {
  return [...calls].reverse().find((call) => call.command === command)?.args;
}

test('routes native menu events through the frontend contract', async ({ page }) => {
  await installTauriMock(page);
  await page.addInitScript(() => {
    (window as typeof window & { __marginPrintCalls?: number }).__marginPrintCalls = 0;
    window.print = () => {
      (window as typeof window & { __marginPrintCalls: number }).__marginPrintCalls += 1;
    };
  });
  await openCleanApp(page, '/?desktop-preview');

  await replaceEditorMarkdown(page, 'Native menu target');
  await selectAllEditorText(page);
  await emitTauriEvent(page, 'margin://add-comment');
  await expect(page.getByLabel('New comment')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await emitTauriEvent(page, 'margin://insert-block', 'table');
  await expect(editor(page)).toContainText('Column');

  await emitTauriEvent(page, 'margin://new-document');
  await expect(page.getByRole('heading', { name: 'Untitled 2.md' })).toBeVisible();

  await emitTauriEvent(page, 'margin://previous-tab');
  await expect(editor(page)).toContainText('Column');

  await emitTauriEvent(page, 'margin://print-document');
  const printDialog = page.getByRole('dialog', { name: 'Print' });
  await expect(printDialog).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Include margin notes appendix' })).toBeDisabled();
  await printDialog.getByRole('button', { name: 'Print', exact: true }).click();
  await expect.poll(async () => {
    const calls = await tauriCalls(page);
    return calls.filter((call) => call.command === 'print_window').length;
  }).toBe(1);
  await expect.poll(() =>
    page.evaluate(() => (window as typeof window & { __marginPrintCalls: number }).__marginPrintCalls)
  ).toBe(0);
  await expect(page.locator('.print-document-body')).toContainText('Column');

  const longReadingBody = Array.from({ length: 13500 }, (_, index) => `word${index}`).join(' ');
  const wordCountBody = `${longReadingBody}\n- [ ] Open task\n- [x] Done task`;
  await replaceEditorMarkdown(page, wordCountBody);
  await setEditorSelection(page, 0, 10);
  await emitTauriEvent(page, 'margin://add-comment');
  await page.getByPlaceholder('Add a comment').fill('Dashboard note.');
  await page.getByRole('button', { name: 'Comment' }).click();
  await expect(page.getByLabel('New comment')).toBeHidden();

  await setEditorSelection(page, 0, 10);
  await emitTauriEvent(page, 'margin://show-word-count');
  const wordCountDialog = page.getByRole('dialog', { name: 'Word Count' });
  await expect(wordCountDialog).toBeVisible();
  await expect(wordCountDialog.locator('[data-word-count-value="document-words"]')).toHaveText('13,505');
  await expect(wordCountDialog.locator('[data-word-count-value="reading-time"]')).toHaveText('1 hr 1 min');
  await expect(wordCountDialog.locator('[data-word-count-value="document-lines"]')).toHaveText('3');
  await expect(wordCountDialog.locator('[data-word-count-value="review-progress"]')).toHaveText('1 open / 0 closed');
  await expect(wordCountDialog.locator('[data-word-count-value="task-progress"]')).toHaveText('1 open / 2 tasks');
  await expect(wordCountDialog.locator('[data-word-count-value="selection-characters"]')).toHaveText('10');
  await wordCountDialog.getByRole('button', { name: 'Done' }).click();

  await emitTauriEvent(page, 'margin://next-tab');
  await expect(page.getByRole('heading', { name: 'Untitled 2.md' })).toBeVisible();

  await emitTauriEvent(page, 'margin://open-settings');
  await expect(page.getByRole('dialog', { name: 'General' })).toBeVisible();
});

test('can omit the margin notes appendix from native print', async ({ page }) => {
  await installTauriMock(page);
  await openCleanApp(page, '/?desktop-preview');

  await replaceEditorMarkdown(page, 'Body with a margin note.');
  await selectAllEditorText(page);
  await emitTauriEvent(page, 'margin://add-comment');
  await page.getByPlaceholder('Add a comment').fill('Printed appendix note.');
  await page.getByRole('button', { name: 'Comment' }).click();
  await expect(page.getByText('Printed appendix note.').first()).toBeVisible();

  await emitTauriEvent(page, 'margin://print-document');
  const printDialog = page.getByRole('dialog', { name: 'Print' });
  await expect(printDialog).toBeVisible();

  const appendixOption = page.getByRole('checkbox', { name: 'Include margin notes appendix' });
  await expect(appendixOption).toBeChecked();
  await appendixOption.uncheck();
  await printDialog.getByRole('button', { name: 'Print', exact: true }).click();

  await expect.poll(async () => {
    const calls = await tauriCalls(page);
    return calls.filter((call) => call.command === 'print_window').length;
  }).toBe(1);
  await expect(page.locator('.print-document-body')).toContainText('Body with a margin note.');
  await expect(page.locator('.print-annotations')).toHaveCount(0);
});

test('opens native deep links, recent documents, and dropped Markdown files', async ({ page }) => {
  await installTauriMock(page, {
    pendingOpenUrls: ['margin://open?path=/tmp/Pending.md'],
    documents: [
      { path: '/tmp/Pending.md', name: 'Pending.md', markdown: '# Pending\n\nOpened at startup.' },
      { path: '/tmp/Recent.md', name: 'Recent.md', markdown: '# Recent\n\nOpened from menu.' },
      { path: '/tmp/Dropped.md', name: 'Dropped.md', markdown: '# Dropped\n\nOpened from drop.' }
    ],
    recentDocuments: [{ path: '/tmp/Recent.md', title: 'Recent.md', openedAt: 1 }]
  });
  await openCleanApp(page, '/?desktop-preview');

  await expect(page.getByRole('heading', { name: 'Pending.md' })).toBeVisible();
  await expect(editor(page)).toContainText('Opened at startup.');

  await emitTauriEvent(page, 'margin://open-recent-document', 1);
  await expect(page.getByRole('heading', { name: 'Recent.md' })).toBeVisible();
  await expect(editor(page)).toContainText('Opened from menu.');

  await emitTauriDragDrop(page, { type: 'drop', paths: ['/tmp/Dropped.md'], position: { x: 100, y: 120 } });
  await expect(page.getByRole('heading', { name: 'Dropped.md' })).toBeVisible();
  await expect(editor(page)).toContainText('Opened from drop.');

  await emitTauriEvent(page, 'margin://clear-recent-documents');
  await expect.poll(async () => {
    const calls = await tauriCalls(page);
    return lastCallArgs(calls, 'write_recent_documents');
  }).toEqual({ entries: [] });
});

test('handles native save contracts and changed-on-disk conflicts', async ({ page }) => {
  await installTauriMock(page, {
    documents: [{ path: '/tmp/Native.md', name: 'Native.md', markdown: 'Original native body.' }],
    chosenDocumentPath: '/tmp/Native.md',
    chosenSavePath: '/tmp/Native-copy.md'
  });
  await openCleanApp(page, '/?desktop-preview');

  await emitTauriEvent(page, 'margin://open-document');
  await expect(page.getByRole('heading', { name: 'Native.md' })).toBeVisible();

  await replaceEditorMarkdown(page, 'Saved native body.');
  await emitTauriEvent(page, 'margin://save-document');
  await expect.poll(async () => {
    const calls = await tauriCalls(page);
    return lastCallArgs(calls, 'save_markdown_document');
  }).toMatchObject({ path: '/tmp/Native.md', markdown: 'Saved native body.' });

  await replaceEditorMarkdown(page, 'Local dirty body.');
  await setTauriDocument(page, {
    path: '/tmp/Native.md',
    name: 'Native.md',
    markdown: 'Changed outside Margin.'
  });
  await emitTauriEvent(page, 'margin://document-changed', { path: '/tmp/Native.md' });

  await expect(page.getByText('Changed on disk')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save As' })).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Unsaved Margin edits');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(editor(page)).toContainText('Changed outside Margin.');

  await replaceEditorMarkdown(page, 'Save as native body.');
  await emitTauriEvent(page, 'margin://save-document-as');
  await expect.poll(async () => {
    const calls = await tauriCalls(page);
    return lastCallArgs(calls, 'save_markdown_document');
  }).toMatchObject({ path: '/tmp/Native-copy.md', markdown: 'Save as native body.' });
});

test('native image drops insert Markdown image references', async ({ page }) => {
  await installTauriMock(page, {
    documents: [{ path: '/tmp/docs/Images.md', name: 'Images.md', markdown: 'Image drop target.' }],
    chosenDocumentPath: '/tmp/docs/Images.md'
  });
  await openCleanApp(page, '/?desktop-preview');

  await emitTauriEvent(page, 'margin://open-document');
  await editor(page).click();
  await emitTauriDragDrop(page, {
    type: 'drop',
    paths: ['/tmp/assets/product-shot.png'],
    position: { x: 100, y: 120 }
  });

  await emitTauriEvent(page, 'margin://save-document');
  await expect.poll(async () => {
    const calls = await tauriCalls(page);
    return lastCallArgs(calls, 'save_markdown_document')?.markdown;
  }).toContain('![product shot](../assets/product-shot.png)');
});
