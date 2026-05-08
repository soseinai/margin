import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOSEIN_SERVER_URL,
  SoseinCloudClient,
  SOSEIN_CLOUD_API_BASE_URL,
  SOSEIN_CLOUD_LOCAL_API_BASE_URL,
  SOSEIN_CLOUD_STAGING_API_BASE_URL,
  mergedStoredUserFromSoseinUser,
  normalizeKnownSoseinServerUrl,
  normalizeSoseinDocumentTitle,
  normalizeSoseinProfilePictureUrl,
  normalizeSoseinUserName,
  normalizeSoseinServerUrl,
  soseinEnvironmentForServerUrl,
  soseinDocumentFileName,
  soseinServerUrlForEnvironment,
  soseinWebSocketBaseUrl,
  storedSessionFromAuth,
  type SoseinCloudRequest,
  type SoseinCloudTransport
} from './sosein-cloud';

describe('Sosein Cloud helpers', () => {
  it('normalizes server URLs for HTTP APIs and WebSockets', () => {
    expect(normalizeSoseinServerUrl(' http://127.0.0.1:18787/// ')).toBe('http://127.0.0.1:18787');
    expect(normalizeSoseinServerUrl('https://cloud.sosein.ai/path?token=secret#hash')).toBe(
      'https://cloud.sosein.ai/path'
    );
    expect(normalizeSoseinServerUrl('ftp://example.com')).toBe(DEFAULT_SOSEIN_SERVER_URL);
    expect(soseinWebSocketBaseUrl('https://cloud.sosein.ai')).toBe('wss://cloud.sosein.ai');
    expect(soseinWebSocketBaseUrl('http://127.0.0.1:18787')).toBe('ws://127.0.0.1:18787');
  });

  it('maps Sosein Cloud environments to known server URLs', () => {
    expect(soseinServerUrlForEnvironment('prod')).toBe(SOSEIN_CLOUD_API_BASE_URL);
    expect(soseinServerUrlForEnvironment('staging')).toBe(SOSEIN_CLOUD_STAGING_API_BASE_URL);
    expect(soseinServerUrlForEnvironment('local')).toBe(SOSEIN_CLOUD_LOCAL_API_BASE_URL);
    expect(soseinEnvironmentForServerUrl(`${SOSEIN_CLOUD_STAGING_API_BASE_URL}/`)).toBe('staging');
    expect(soseinEnvironmentForServerUrl(`${SOSEIN_CLOUD_LOCAL_API_BASE_URL}/`)).toBe('local');
    expect(normalizeKnownSoseinServerUrl('http://127.0.0.1:18787')).toBe(SOSEIN_CLOUD_LOCAL_API_BASE_URL);
    expect(normalizeKnownSoseinServerUrl('http://localhost:18787/')).toBe(SOSEIN_CLOUD_LOCAL_API_BASE_URL);
    expect(soseinEnvironmentForServerUrl('http://localhost:18787')).toBe('local');
    expect(normalizeKnownSoseinServerUrl('http://localhost:18787/api')).toBeNull();
  });

  it('builds OIDC login and handoff exchange requests', async () => {
    const client = new SoseinCloudClient('https://api.sosein.ai');
    const loginUrl = new URL(client.oidcLoginUrl('https://margin.local/return?tab=cloud'));

    expect(`${loginUrl.origin}${loginUrl.pathname}`).toBe('https://api.sosein.ai/v1/auth/oidc/google/login');
    expect(loginUrl.searchParams.get('return_to')).toBe('https://margin.local/return?tab=cloud');

    const transport: SoseinCloudTransport = async <T,>(request: SoseinCloudRequest) => {
      expect(request).toMatchObject({
        baseUrl: 'https://api.sosein.ai',
        path: '/v1/auth/oidc/handoff/exchange',
        method: 'POST',
        body: { handoff_code: 'handoff' }
      });

      return {
        session_token: 'session',
        expires_at: '2026-05-05T12:00:00Z',
        user: { id: 'user-1', email: 'alice@example.com' },
        default_workspace: { id: 'workspace-1', name: 'Default' }
      } as T;
    };

    await expect(new SoseinCloudClient('https://api.sosein.ai', undefined, transport).exchangeOidcHandoff('handoff'))
      .resolves.toMatchObject({ session_token: 'session' });
  });

  it('normalizes document titles and file names', () => {
    expect(normalizeSoseinDocumentTitle('  Planning   Notes  ')).toBe('Planning Notes');
    expect(normalizeSoseinDocumentTitle('')).toBe('Untitled');
    expect(soseinDocumentFileName('Planning Notes')).toBe('Planning Notes.md');
    expect(soseinDocumentFileName('Planning Notes.markdown')).toBe('Planning Notes.markdown');
  });

  it('maps auth responses to stored sessions without keeping API field casing', () => {
    expect(
      storedSessionFromAuth('http://127.0.0.1:18787/', {
        session_token: 'session',
        expires_at: '2026-05-05T12:00:00Z',
        user: {
          id: 'user-1',
          email: 'alice@example.com',
          name: ' Alice   Example ',
          profile_picture_url: ' https://example.com/alice.png '
        },
        default_workspace: { id: 'workspace-1', name: 'Default' }
      })
    ).toEqual({
      serverUrl: 'http://127.0.0.1:18787',
      sessionToken: 'session',
      expiresAt: '2026-05-05T12:00:00Z',
      user: {
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice Example',
        profilePictureUrl: 'https://example.com/alice.png'
      },
      defaultWorkspace: { id: 'workspace-1', name: 'Default' }
    });
  });

  it('normalizes profile picture URLs', () => {
    expect(normalizeSoseinProfilePictureUrl(' https://example.com/alice.png ')).toBe('https://example.com/alice.png');
    expect(normalizeSoseinProfilePictureUrl('http://127.0.0.1:18787/avatar')).toBe('http://127.0.0.1:18787/avatar');
    expect(normalizeSoseinProfilePictureUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeSoseinProfilePictureUrl('')).toBeNull();
  });

  it('normalizes Sosein user names', () => {
    expect(normalizeSoseinUserName(' Alice   Example ')).toBe('Alice Example');
    expect(normalizeSoseinUserName('')).toBeNull();
    expect(normalizeSoseinUserName(null)).toBeNull();
  });

  it('preserves stored profile details when validation omits them', () => {
    expect(
      mergedStoredUserFromSoseinUser(
        {
          id: 'user-1',
          email: 'old@example.com',
          name: 'Alice Example',
          profilePictureUrl: 'https://example.com/alice.png'
        },
        { id: 'user-1', email: 'alice@example.com' }
      )
    ).toEqual({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice Example',
      profilePictureUrl: 'https://example.com/alice.png'
    });
  });

  it('accepts common profile image field aliases', () => {
    expect(
      storedSessionFromAuth('https://api.sosein.ai', {
        session_token: 'session',
        expires_at: '2026-05-05T12:00:00Z',
        user: {
          id: 'user-1',
          email: 'alice@example.com',
          displayName: 'Alice Alias',
          profileImageUrl: 'https://example.com/profile.png'
        },
        default_workspace: { id: 'workspace-1', name: 'Default' }
      }).user
    ).toMatchObject({
      name: 'Alice Alias',
      profilePictureUrl: 'https://example.com/profile.png'
    });
  });

  it('can route requests through an injected desktop transport', async () => {
    const transport: SoseinCloudTransport = async <T,>(request: SoseinCloudRequest) => {
      expect(request).toMatchObject({
        baseUrl: 'https://api.sosein.ai',
        path: '/v1/documents',
        method: 'GET',
        sessionToken: 'session',
        requireSession: true
      });

      return { documents: [] } as T;
    };
    const client = new SoseinCloudClient('https://api.sosein.ai', 'session', transport);

    await expect(client.listDocuments()).resolves.toEqual({ documents: [] });
  });
});
