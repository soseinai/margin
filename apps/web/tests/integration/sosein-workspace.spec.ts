import { expect, test, type Page } from '@playwright/test';
import { editor, installTauriMock, tauriCalls } from './helpers';

const storedSoseinSession = {
  serverUrl: 'https://api.sosein.ai',
  sessionToken: 'session',
  user: {
    id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice Example',
    profilePictureUrl: 'https://example.com/alice.png'
  },
  defaultWorkspace: { id: 'workspace-1', name: 'Default' },
  expiresAt: '2026-05-06T12:00:00Z'
};

async function installStoredSoseinSession(page: Page) {
  await page.addInitScript((session) => {
    window.localStorage.clear();
    window.sessionStorage.setItem('__marginTestStorageCleared', 'true');
    window.localStorage.setItem('margin:sosein-cloud:session:v1', JSON.stringify(session));
  }, storedSoseinSession);
}

async function serveProfilePicture(page: Page) {
  await page.route('https://example.com/alice.png', async (route) => {
    await route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        'base64'
      )
    });
  });
}

test('cloud workspace mode replaces the local file tree with cloud documents', async ({ page }) => {
  await serveProfilePicture(page);
  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me', soseinCloudEnabled: true },
    soseinDocuments: [
      {
        id: 'doc-1',
        title: 'Cloud Plan',
        content_type: 'text/markdown',
        current_snapshot_version: 3,
        created_at: '2026-05-06T10:00:00Z',
        updated_at: '2026-05-06T11:00:00Z'
      }
    ]
  });
  await installStoredSoseinSession(page);

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/?desktop-preview&workspace=sosein');

  const cloudPanel = page.getByLabel('Sosein Cloud documents');

  await expect(cloudPanel).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Default' })).toBeVisible();
  await expect(cloudPanel.getByText('Alice Example')).toBeVisible();
  await expect(cloudPanel.locator('img.sosein-account-avatar')).toHaveAttribute('src', 'https://example.com/alice.png');
  await expect(cloudPanel.getByRole('button', { name: 'Cloud Plan' })).toBeVisible();
  await expect(page.locator('.doc-titlebar-shell')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Cloud Documents' })).toHaveCount(0);
  await expect(page.getByText('Open a folder to browse Markdown documents.')).toHaveCount(0);
});

test('cloud workspace reports incomplete account setup when documents return 404', async ({ page }) => {
  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me', soseinCloudEnabled: true },
    soseinDocumentsStatus: 404
  });
  await installStoredSoseinSession(page);

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/?desktop-preview&workspace=sosein');

  const cloudPanel = page.getByLabel('Sosein Cloud documents');

  await expect(cloudPanel).toBeVisible();
  await expect(page.locator('.doc-titlebar-shell')).toHaveCount(0);
  await expect(cloudPanel.getByText('No cloud documents.')).toBeVisible();
  await expect(
    cloudPanel.getByText('Sosein Cloud account setup is incomplete. Disconnect and connect again to finish workspace setup.')
  ).toBeVisible();
  await expect(page.getByText('Unable to list Sosein Cloud documents: 404')).toHaveCount(0);
});

test('local windows open the Sosein workspace in a separate desktop window', async ({ page }) => {
  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me', soseinCloudEnabled: true }
  });
  await installStoredSoseinSession(page);

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/?desktop-preview');
  await expect(editor(page)).toBeVisible();

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
  await page.getByRole('combobox', { name: 'Command palette search' }).fill('open cloud');
  await page.keyboard.press('Enter');

  await expect.poll(async () => {
    const calls = await tauriCalls(page);

    return calls.some((call) => call.command === 'open_sosein_workspace_window');
  }).toBe(true);
});
