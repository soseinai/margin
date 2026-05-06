import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOSEIN_SERVER_URL,
  SoseinCloudClient,
  mergedStoredUserFromSoseinUser,
  normalizeSoseinDocumentTitle,
  normalizeSoseinProfilePictureUrl,
  normalizeSoseinUserName,
  normalizeSoseinServerUrl,
  soseinDocumentFileName,
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
