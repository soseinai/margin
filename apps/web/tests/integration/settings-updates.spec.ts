import { expect, test } from '@playwright/test';
import {
  installTauriMock,
  emitTauriEvent,
  openCommentComposer,
  openCleanApp,
  replaceEditorMarkdown,
  selectAllEditorText,
  setTauriUpdate,
  setTauriWriteSettingsError,
  tauriCalls
} from './helpers';

test('persists browser theme and local author name across reloads', async ({ page }) => {
  await openCleanApp(page);

  await page.getByLabel('Settings', { exact: true }).click();
  await page.getByText('Dark').click();
  await page.getByLabel('Local name').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await replaceEditorMarkdown(page, 'Author target');
  await selectAllEditorText(page);
  await openCommentComposer(page);
  await page.getByPlaceholder('Add a comment').fill('Author should persist.');
  await page.getByRole('button', { name: 'Comment' }).click();

  await expect(page.getByRole('button', { name: 'Go to comment' })).toContainText('Ada Lovelace');
});

test('keeps native settings dialog open when save fails', async ({ page }) => {
  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me' },
    writeSettingsError: 'Settings disk is read-only'
  });
  await openCleanApp(page, '/?desktop-preview');

  await emitTauriEvent(page, 'margin://open-settings');
  await page.getByText('Light').click();
  await page.getByLabel('Local name').fill('Grace Hopper');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText('Settings disk is read-only')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();

  await setTauriWriteSettingsError(page, '');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
});

test('covers native update available, install, current, error, and dismiss states', async ({ page }) => {
  await installTauriMock(page, {
    update: { currentVersion: '0.1.4', version: '0.1.5', notes: 'Small fixes' }
  });
  await openCleanApp(page, '/?desktop-preview');

  await emitTauriEvent(page, 'margin://open-settings');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Version 0.1.5 is available').first()).toBeVisible();
  await expect(page.getByText('Update 0.1.5')).toBeVisible();

  await page.getByLabel('Close settings').click();
  await page.getByRole('button', { name: 'Dismiss update' }).click();
  await expect(page.getByText('Update 0.1.5')).toBeHidden();

  await emitTauriEvent(page, 'margin://open-settings');
  await setTauriUpdate(page, null);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Margin is up to date')).toBeVisible();

  await setTauriUpdate(page, null, 'Network unavailable');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Network unavailable')).toBeVisible();

  await setTauriUpdate(page, { currentVersion: '0.1.4', version: '0.1.6', notes: null });
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByRole('button', { name: 'Install and Relaunch' }).click();
  await expect.poll(async () => (await tauriCalls(page)).some((call) => call.command === 'install_app_update')).toBe(true);
});
