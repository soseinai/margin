import { expect, test, type Page } from '@playwright/test';
import {
  editor,
  editorMarkdown,
  emitTauriEvent,
  installSoseinSyncMock,
  installTauriMock,
  replaceEditorMarkdown,
  runCommand,
  tauriCalls
} from './helpers';

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

async function installStoredSoseinSession(page: Page, session = storedSoseinSession) {
  await page.addInitScript((session) => {
    window.localStorage.clear();
    window.sessionStorage.setItem('__marginTestStorageCleared', 'true');
    window.localStorage.setItem('margin:sosein-cloud:session:v1', JSON.stringify(session));
  }, session);
}

async function expectLinkNotice(page: Page, title: string, message: string, detail = '') {
  const dialog = page.getByRole('dialog', { name: title });

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(message)).toBeVisible();
  if (detail) await expect(dialog.getByText(detail)).toBeVisible();
  await expect(page.locator('p.error')).toHaveCount(0);
  await expect.poll(async () => {
    const calls = await tauriCalls(page);

    return calls.some((call) => call.command === 'show_notice_message');
  }).toBe(false);
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

test('opens Sosein Cloud document deep links from the native protocol', async ({ page }) => {
  const serverUrl = 'http://127.0.0.1:18787';
  const documentId = '019e04a6-b413-7830-9ebc-58e264a62525';
  const linkedMarkdown = '# Linked Plan\n\nOpened from Sosein Cloud.';

  await installSoseinSyncMock(page, {
    initialMarkdownByDocumentId: {
      [documentId]: linkedMarkdown
    }
  });
  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me', soseinCloudEnabled: true },
    pendingOpenUrls: [
      `margin://sosein/document?server_url=${encodeURIComponent(serverUrl)}&document_id=${encodeURIComponent(documentId)}`
    ],
    soseinDocuments: [
      {
        id: documentId,
        title: 'Linked Plan',
        content_type: 'text/markdown',
        current_snapshot_version: 7,
        created_at: '2026-05-06T10:00:00Z',
        updated_at: '2026-05-06T11:00:00Z'
      }
    ]
  });
  await installStoredSoseinSession(page, { ...storedSoseinSession, serverUrl });

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/?desktop-preview');

  await expect(page.getByLabel('Sosein Cloud documents')).toBeVisible();
  await expect(editor(page)).toContainText('Opened from Sosein Cloud.');
  await expect.poll(() => editorMarkdown(page)).toBe(linkedMarkdown);
  await expect.poll(async () => {
    const calls = await tauriCalls(page);
    const openCall = calls.find(
      (call) =>
        call.command === 'sosein_api_request'
        && call.args?.method === 'GET'
        && call.args?.path === `/v1/documents/${documentId}`
    );

    return openCall?.args?.serverUrl;
  }).toBe(serverUrl);
});

test('opens runtime Sosein Cloud document links after a session is stored', async ({ page }) => {
  const serverUrl = 'http://127.0.0.1:18787';
  const documentId = '019e04a6-b413-7830-9ebc-58e264a62525';
  const linkedMarkdown = '# Runtime Link\n\nOpened after Margin was already running.';

  await installSoseinSyncMock(page, {
    initialMarkdownByDocumentId: {
      [documentId]: linkedMarkdown
    }
  });
  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me', soseinCloudEnabled: true },
    soseinDocuments: [
      {
        id: documentId,
        title: 'Runtime Link',
        content_type: 'text/markdown',
        current_snapshot_version: 9,
        created_at: '2026-05-06T10:00:00Z',
        updated_at: '2026-05-06T11:00:00Z'
      }
    ]
  });

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/?desktop-preview');
  await expect(editor(page)).toBeVisible();

  await page.evaluate((session) => {
    window.localStorage.setItem('margin:sosein-cloud:session:v1', JSON.stringify(session));
  }, { ...storedSoseinSession, serverUrl });
  await emitTauriEvent(page, 'margin://open-urls', [
    `margin://sosein/document?server_url=${encodeURIComponent('http://localhost:18787')}&document_id=${encodeURIComponent(documentId)}`
  ]);

  await expect(page.getByLabel('Sosein Cloud documents')).toBeVisible();
  await expect(editor(page)).toContainText('Opened after Margin was already running.');
  await expect.poll(() => editorMarkdown(page)).toBe(linkedMarkdown);
  await expect.poll(async () => {
    const calls = await tauriCalls(page);
    const openCall = calls.find(
      (call) =>
        call.command === 'sosein_api_request'
        && call.args?.method === 'GET'
        && call.args?.path === `/v1/documents/${documentId}`
    );

    return openCall?.args?.serverUrl;
  }).toBe(serverUrl);
});

test('defaults Sosein Cloud document deep links without server_url to prod', async ({ page }) => {
  const localServerUrl = 'http://127.0.0.1:18787';
  const documentId = '019e04a6-b413-7830-9ebc-58e264a62525';

  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me', soseinCloudEnabled: true },
    pendingOpenUrls: [
      `margin://sosein/document?document_id=${encodeURIComponent(documentId)}`
    ]
  });
  await installStoredSoseinSession(page, { ...storedSoseinSession, serverUrl: localServerUrl });

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/?desktop-preview');

  await expectLinkNotice(
    page,
    'Different Sosein Cloud Server',
    `This link points to https://api.sosein.ai, but Margin is connected to ${localServerUrl}.`
  );
});

test('reports Sosein Cloud document links that are missing on the selected server', async ({ page }) => {
  const serverUrl = 'http://127.0.0.1:18787';
  const documentId = 'missing-local-doc';

  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me', soseinCloudEnabled: true },
    pendingOpenUrls: [
      `margin://sosein/document?server_url=${encodeURIComponent(serverUrl)}&document_id=${encodeURIComponent(documentId)}`
    ],
    soseinDocuments: []
  });
  await installStoredSoseinSession(page, { ...storedSoseinSession, serverUrl });

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/?desktop-preview');

  await expectLinkNotice(
    page,
    'Document Link Unavailable',
    'This Sosein Cloud document may have been moved, deleted, or opened from a different server.'
  );
});

test('reports Sosein Cloud document links that the user cannot access', async ({ page }) => {
  const serverUrl = 'http://127.0.0.1:18787';
  const documentId = 'forbidden-local-doc';

  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me', soseinCloudEnabled: true },
    pendingOpenUrls: [
      `margin://sosein/document?server_url=${encodeURIComponent(serverUrl)}&document_id=${encodeURIComponent(documentId)}`
    ],
    soseinDocumentStatuses: { [documentId]: 403 }
  });
  await installStoredSoseinSession(page, { ...storedSoseinSession, serverUrl });

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/?desktop-preview');

  await expectLinkNotice(
    page,
    'Document Link Unavailable',
    'This Sosein Cloud document is not available to the connected account.'
  );
});

test('reports Sosein Cloud document links rejected by the server', async ({ page }) => {
  const serverUrl = 'http://127.0.0.1:18787';
  const documentId = 'bad-local-doc';

  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me', soseinCloudEnabled: true },
    pendingOpenUrls: [
      `margin://sosein/document?server_url=${encodeURIComponent(serverUrl)}&document_id=${encodeURIComponent(documentId)}`
    ],
    soseinDocumentStatuses: { [documentId]: 400 }
  });
  await installStoredSoseinSession(page, { ...storedSoseinSession, serverUrl });

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/?desktop-preview');

  await expectLinkNotice(
    page,
    'Document Link Unavailable',
    'Margin could not open this Sosein Cloud link.',
    'Code 400'
  );
});

test('Sosein Cloud dialog uses the selected environment for desktop OIDC', async ({ page }) => {
  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me', soseinCloudEnabled: true }
  });

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/?desktop-preview');
  await expect(editor(page)).toBeVisible();

  await runCommand(page, 'Connect Sosein Cloud');

  const dialog = page.getByRole('dialog', { name: 'Cloud Documents' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('https://api.sosein.ai')).toBeVisible();

  await dialog.getByRole('radio', { name: 'Staging' }).click();
  await expect(dialog.getByRole('radio', { name: 'Staging' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByText('https://api-staging.sosein.ai')).toBeVisible();

  await dialog.getByRole('button', { name: 'Connect with Google' }).click();

  await expect.poll(async () => {
    const calls = await tauriCalls(page);
    const loginCall = calls.find((call) => call.command === 'start_sosein_oidc_login');

    return loginCall?.args?.serverUrl;
  }).toBe('https://api-staging.sosein.ai');
});

test('Sosein Cloud dialog can start local Google OIDC', async ({ page }) => {
  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me', soseinCloudEnabled: true }
  });

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/?desktop-preview');
  await expect(editor(page)).toBeVisible();

  await runCommand(page, 'Connect Sosein Cloud');

  const dialog = page.getByRole('dialog', { name: 'Cloud Documents' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('radio', { name: 'Local' }).click();
  await expect(dialog.getByRole('radio', { name: 'Local' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByText('http://127.0.0.1:18787')).toBeVisible();

  await dialog.getByRole('button', { name: 'Connect with Google' }).click();

  await expect.poll(async () => {
    const calls = await tauriCalls(page);
    const loginCall = calls.find((call) => call.command === 'start_sosein_oidc_login');

    return loginCall?.args?.serverUrl;
  }).toBe('http://127.0.0.1:18787');
});

test('cloud document sync hydrates the editor and publishes local edits to Yjs', async ({ page }) => {
  await installSoseinSyncMock(page, {
    initialMarkdownByDocumentId: {
      'doc-1': '# Cloud Plan\n\nRemote body from Yjs.'
    }
  });
  await installTauriMock(page, {
    settings: { theme: 'auto', localUserName: 'Me', soseinCloudEnabled: true },
    soseinDocuments: [
      {
        id: 'doc-1',
        title: 'Cloud Plan',
        content_type: 'text/markdown',
        current_snapshot_version: 3,
        created_at: '2026-05-06T10:00:00Z',
        updated_at: '2026-05-06T11:00:00Z',
        latest_snapshot: {
          version: 3,
          yrs_state_hash: 'test-yrs',
          markdown_content: '# Cloud Plan\n\nSnapshot body should not win over Yjs.',
          markdown_content_hash: 'test-md'
        }
      }
    ]
  });
  await installStoredSoseinSession(page);

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/?desktop-preview&workspace=sosein');
  await page.getByRole('button', { name: 'Cloud Plan' }).click();

  await expect(editor(page)).toContainText('Remote body from Yjs.');
  await expect.poll(() => editorMarkdown(page)).toBe('# Cloud Plan\n\nRemote body from Yjs.');
  await expect(page.getByText('Cloud synced', { exact: true })).toBeVisible();

  await replaceEditorMarkdown(page, '# Cloud Plan\n\nEdited locally in Margin.');

  await expect.poll(async () => {
    return page.evaluate(() =>
      (
        window as typeof window & {
          __marginSoseinSync: {
            snapshot: (documentId: string) => { text: string };
          };
        }
      ).__marginSoseinSync.snapshot('doc-1').text
    );
  }).toBe('# Cloud Plan\n\nEdited locally in Margin.');
});

test('cloud document sync refreshes its ticket after disconnect', async ({ page }) => {
  await installSoseinSyncMock(page, {
    initialMarkdownByDocumentId: {
      'doc-1': '# Cloud Plan\n\nRemote body.'
    }
  });
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
  await page.getByRole('button', { name: 'Cloud Plan' }).click();
  await expect(editor(page)).toContainText('Remote body.');

  await expect.poll(async () => syncTicketCallCount(page)).toBe(1);

  await page.evaluate(() => {
    (
      window as typeof window & {
        __marginSoseinSync: { disconnect: (documentId: string) => void };
      }
    ).__marginSoseinSync.disconnect('doc-1');
  });

  await expect.poll(async () => syncTicketCallCount(page)).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('Cloud synced', { exact: true })).toBeVisible();
});

async function syncTicketCallCount(page: Page) {
  return (await tauriCalls(page)).filter(
    (call) =>
      call.command === 'sosein_api_request'
      && call.args?.method === 'POST'
      && call.args?.path === '/v1/documents/doc-1/sync-ticket'
  ).length;
}
