import { expect, test, type APIRequestContext, type APIResponse, type Browser, type Page } from '@playwright/test';

const soseinSessionStorageKey = 'margin:sosein-cloud:session:v1';
const liveServerUrl = normalizedLiveServerUrl();
const e2eAuthToken = process.env.MARGIN_SOSEIN_E2E_AUTH_TOKEN ?? '';

type SoseinUser = {
  id: string;
  email: string;
  name?: string | null;
  display_name?: string | null;
  displayName?: string | null;
};

type SoseinAuthSession = {
  session_token: string;
  user: SoseinUser;
  default_workspace: { id: string; name: string };
  expires_at: string;
};

type SoseinStoredSession = {
  serverUrl: string;
  sessionToken: string;
  user: { id: string; email: string; name?: string };
  defaultWorkspace: { id: string; name: string };
  expiresAt: string;
};

type SoseinDocument = {
  id: string;
  title: string;
  content_type: string;
};

type NativeSoseinApiRequest = {
  serverUrl?: string;
  method?: string;
  path?: string;
  sessionToken?: string | null;
  body?: unknown;
};

type NativeSoseinApiResponse = {
  status: number;
  body: unknown;
  bodyText: string;
};

test.describe('Sosein Cloud live E2E', () => {
  test.skip(!liveServerUrl, 'Set MARGIN_SOSEIN_LIVE_URL to run live Sosein Cloud E2E tests.');
  test.skip(!e2eAuthToken, 'Set MARGIN_SOSEIN_E2E_AUTH_TOKEN to mint a live Sosein Cloud E2E session.');
  test.setTimeout(90_000);

  test('syncs a cloud document between two Margin clients', async ({ browser, request }) => {
    const authSession = await mintE2eSession(request);
    const storedSession = storedSessionFromAuth(authSession);
    const documentTitle = `Margin live E2E ${new Date().toISOString()} ${randomSuffix()}`;
    const document = await createDocument(request, authSession.session_token, documentTitle);
    const syncedBody = `${document.id} ${randomSuffix()}`;
    const markdown = `# Margin live E2E\n\n${syncedBody}`;
    const firstPage = await openCloudWorkspacePage(browser, request, storedSession);
    const secondPage = await openCloudWorkspacePage(browser, request, storedSession);

    try {
      await openCloudDocument(firstPage, document.title);
      await openCloudDocument(secondPage, document.title);

      await editor(firstPage).click();
      await firstPage.keyboard.insertText(markdown);

      await expect(editor(firstPage)).toContainText(syncedBody);
      await expect(editor(secondPage)).toContainText(syncedBody, { timeout: 30_000 });
      await expect(cloudSyncStatus(firstPage)).toBeVisible({ timeout: 30_000 });
      await expect(cloudSyncStatus(secondPage)).toBeVisible({ timeout: 30_000 });
    } finally {
      await Promise.all([
        firstPage.context().close(),
        secondPage.context().close()
      ]);
    }
  });
});

async function mintE2eSession(request: APIRequestContext): Promise<SoseinAuthSession> {
  const response = await request.post(soseinApiUrl('/v1/e2e/session'), {
    headers: {
      authorization: `Bearer ${e2eAuthToken}`
    }
  });

  return responseJsonOrThrow<SoseinAuthSession>(response, 'Unable to mint Sosein E2E session');
}

async function createDocument(
  request: APIRequestContext,
  sessionToken: string,
  title: string
): Promise<SoseinDocument> {
  const response = await request.post(soseinApiUrl('/v1/documents'), {
    headers: {
      authorization: `Bearer ${sessionToken}`
    },
    data: { title }
  });

  return responseJsonOrThrow<SoseinDocument>(response, 'Unable to create Sosein document');
}

async function responseJsonOrThrow<T>(
  response: APIResponse,
  message: string
): Promise<T> {
  if (response.ok()) return response.json() as Promise<T>;

  throw new Error(`${message}: ${response.status()} ${await response.text()}`);
}

async function openCloudWorkspacePage(
  browser: Browser,
  request: APIRequestContext,
  session: SoseinStoredSession
) {
  const context = await browser.newContext();

  await context.exposeBinding(
    'marginLiveSoseinApiRequest',
    async (_source, apiRequest: NativeSoseinApiRequest) => requestSoseinApi(request, apiRequest)
  );

  await context.addInitScript(({ storageKey, storedSession }) => {
    type LiveTauriWindow = Window & {
      __TAURI__?: {
        core: {
          invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
          convertFileSrc: (filePath: string) => string;
        };
        event: {
          listen: (
            eventName: string,
            handler: (event: { payload: unknown }) => void
          ) => Promise<() => void>;
        };
        webview: {
          getCurrentWebview: () => {
            onDragDropEvent: (handler: (event: { payload: unknown }) => void) => Promise<() => void>;
          };
        };
      };
      marginLiveSoseinApiRequest?: (
        request: NativeSoseinApiRequest
      ) => Promise<NativeSoseinApiResponse>;
    };
    const liveWindow = window as LiveTauriWindow;

    window.localStorage.clear();
    window.sessionStorage.setItem('__marginTestStorageCleared', 'true');
    window.localStorage.setItem(storageKey, JSON.stringify(storedSession));

    liveWindow.__TAURI__ = {
      core: {
        invoke: async (command: string, args?: Record<string, unknown>) => {
          if (command === 'read_settings') {
            return { theme: 'auto', localUserName: 'Margin E2E', soseinCloudEnabled: true };
          }

          if (command === 'read_recent_documents') return [];
          if (command === 'write_recent_documents') return [];
          if (command === 'take_pending_open_urls') return [];
          if (command === 'set_window_tab_state') return undefined;
          if (command === 'check_for_app_update') return null;
          if (command === 'sosein_cloud_enabled') return true;
          if (command === 'open_sosein_workspace_window') return undefined;

          if (command === 'sosein_api_request') {
            if (!liveWindow.marginLiveSoseinApiRequest) {
              throw new Error('Live Sosein API bridge is unavailable.');
            }

            return liveWindow.marginLiveSoseinApiRequest(args ?? {});
          }

          throw new Error(`Unexpected Tauri command ${command}`);
        },
        convertFileSrc: (filePath: string) => `asset://${filePath}`
      },
      event: {
        listen: async () => () => {}
      },
      webview: {
        getCurrentWebview: () => ({
          onDragDropEvent: async () => () => {}
        })
      }
    };
  }, { storageKey: soseinSessionStorageKey, storedSession: session });

  const page = await context.newPage();

  await page.goto('/?desktop-preview&workspace=sosein');
  await expect(page.getByLabel('Sosein Cloud documents')).toBeVisible();

  return page;
}

async function requestSoseinApi(
  request: APIRequestContext,
  apiRequest: NativeSoseinApiRequest
): Promise<NativeSoseinApiResponse> {
  const method = apiRequest.method ?? 'GET';
  const path = apiRequest.path ?? '/';
  const headers: Record<string, string> = {};

  if (apiRequest.body !== null && apiRequest.body !== undefined) headers['content-type'] = 'application/json';
  if (apiRequest.sessionToken) headers.authorization = `Bearer ${apiRequest.sessionToken}`;

  const response = await request.fetch(new URL(path, `${apiRequest.serverUrl ?? liveServerUrl}/`).toString(), {
    method,
    headers,
    data: apiRequest.body === null ? undefined : apiRequest.body
  });
  const bodyText = await response.text();

  return {
    status: response.status(),
    body: parseJsonOrNull(bodyText),
    bodyText
  };
}

async function openCloudDocument(page: Page, title: string) {
  const documents = page.getByLabel('Sosein Cloud documents');
  const documentButton = documents.getByRole('button', { name: title });

  await expect(documentButton).toBeVisible({ timeout: 30_000 });
  await documentButton.click();
  await expect(editor(page)).toBeVisible({ timeout: 30_000 });
  await expect(cloudSyncStatus(page)).toBeVisible({ timeout: 30_000 });
}

function editor(page: Page) {
  return page.locator('.cm-content[contenteditable="true"]').first();
}

function cloudSyncStatus(page: Page) {
  return page.getByText('Cloud synced', { exact: true });
}

function storedSessionFromAuth(session: SoseinAuthSession): SoseinStoredSession {
  return {
    serverUrl: liveServerUrl,
    sessionToken: session.session_token,
    user: {
      id: session.user.id,
      email: session.user.email,
      ...(soseinUserDisplayName(session.user) ? { name: soseinUserDisplayName(session.user) } : {})
    },
    defaultWorkspace: session.default_workspace,
    expiresAt: session.expires_at
  };
}

function soseinUserDisplayName(user: SoseinUser) {
  return normalizedOptionalString(user.name)
    ?? normalizedOptionalString(user.display_name)
    ?? normalizedOptionalString(user.displayName);
}

function normalizedOptionalString(value: unknown) {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().replace(/\s+/g, ' ');

  return normalized || null;
}

function parseJsonOrNull(value: string) {
  if (!value) return null;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function soseinApiUrl(path: string) {
  return new URL(path, `${liveServerUrl}/`).toString();
}

function normalizedLiveServerUrl() {
  const rawServerUrl = process.env.MARGIN_SOSEIN_LIVE_URL;

  if (!rawServerUrl) return '';

  const url = new URL(rawServerUrl);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('MARGIN_SOSEIN_LIVE_URL must start with http:// or https://.');
  }

  url.hash = '';
  url.search = '';

  return url.toString().replace(/\/+$/, '');
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}
