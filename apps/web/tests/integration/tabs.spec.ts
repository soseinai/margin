import { expect, test } from '@playwright/test';
import {
  editor,
  emitTauriEvent,
  installTauriMock,
  openCleanApp,
  replaceEditorMarkdown,
  setTauriConfirmClose,
  tauriCalls
} from './helpers';

test('keeps dirty state and editor contents isolated across tabs', async ({ page }) => {
  await installTauriMock(page);
  await openCleanApp(page, '/?desktop-preview');

  await replaceEditorMarkdown(page, 'First tab draft');
  await expect(page.getByLabel('Unsaved changes')).toBeVisible();

  await emitTauriEvent(page, 'margin://new-document');
  await expect(page.getByRole('heading', { name: 'Untitled 2.md' })).toBeVisible();
  await replaceEditorMarkdown(page, 'Second tab draft');

  await page.getByRole('button', { name: /^Untitled\.md/ }).click();
  await expect(editor(page)).toContainText('First tab draft');

  await page.getByRole('button', { name: /^Untitled 2\.md/ }).click();
  await expect(editor(page)).toContainText('Second tab draft');
});

test('confirms before closing dirty tabs and before unloading dirty documents', async ({ page }) => {
  await installTauriMock(page);
  await openCleanApp(page, '/?desktop-preview');
  await replaceEditorMarkdown(page, 'Unsaved tab');
  await emitTauriEvent(page, 'margin://new-document');
  await expect(page.getByRole('heading', { name: 'Untitled 2.md' })).toBeVisible();
  await emitTauriEvent(page, 'margin://previous-tab');
  await expect(editor(page)).toContainText('Unsaved tab');

  const dirtyBeforeUnload = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    return !window.dispatchEvent(event);
  });
  expect(dirtyBeforeUnload).toBe(true);

  await setTauriConfirmClose(page, false);
  await page.getByLabel('Close Untitled.md').hover();
  await page.getByLabel('Close Untitled.md').click();
  await expect(page.getByRole('heading', { name: 'Untitled.md' })).toBeVisible();

  await setTauriConfirmClose(page, true);
  await page.getByLabel('Close Untitled.md').hover();
  await page.getByLabel('Close Untitled.md').click();

  await expect(editor(page)).not.toContainText('Unsaved tab');

  const cleanBeforeUnload = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    return !window.dispatchEvent(event);
  });
  expect(cleanBeforeUnload).toBe(false);
});

test('closing the last tab delegates app-wide window close or quit to native', async ({ page }) => {
  await installTauriMock(page);
  await openCleanApp(page, '/?desktop-preview');

  await emitTauriEvent(page, 'margin://close-tab');

  await expect.poll(async () => {
    const calls = await tauriCalls(page);

    return calls.some((call) => call.command === 'close_last_tab_or_quit_app');
  }).toBe(true);

  const calls = await tauriCalls(page);

  expect(calls.some((call) => call.command === 'quit_app')).toBe(false);
  expect(
    calls.some((call) => call.command === 'set_window_tab_state' && call.args?.hasTabs === true)
  ).toBe(true);
});
