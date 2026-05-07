import { describe, expect, it } from 'vitest';
import { SOSEIN_CLOUD_API_BASE_URL, SOSEIN_CLOUD_STAGING_API_BASE_URL } from './sosein-cloud';
import {
  clearSoseinSession,
  readSoseinSession,
  writeSoseinSession,
  type SoseinBrowserStorage
} from './sosein-session-store';

class MemoryStorage implements SoseinBrowserStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('Sosein session store', () => {
  it('persists and clears valid prod sessions', () => {
    const storage = new MemoryStorage();

    writeSoseinSession(
      {
        serverUrl: `${SOSEIN_CLOUD_API_BASE_URL}/`,
        sessionToken: 'session',
        expiresAt: '2026-05-05T12:00:00Z',
        user: {
          id: 'user-1',
          email: 'alice@example.com',
          name: ' Alice   Example ',
          profilePictureUrl: ' https://example.com/alice.png '
        },
        defaultWorkspace: { id: 'workspace-1', name: 'Default' }
      },
      storage
    );

    expect(readSoseinSession(storage)).toEqual({
      serverUrl: SOSEIN_CLOUD_API_BASE_URL,
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

    clearSoseinSession(storage);
    expect(readSoseinSession(storage)).toBeNull();
  });

  it('persists valid staging sessions', () => {
    const storage = new MemoryStorage();

    writeSoseinSession(
      {
        serverUrl: `${SOSEIN_CLOUD_STAGING_API_BASE_URL}/`,
        sessionToken: 'session',
        expiresAt: '2026-05-05T12:00:00Z',
        user: { id: 'user-1', email: 'alice@example.com' },
        defaultWorkspace: { id: 'workspace-1', name: 'Default' }
      },
      storage
    );

    expect(readSoseinSession(storage)).toEqual({
      serverUrl: SOSEIN_CLOUD_STAGING_API_BASE_URL,
      sessionToken: 'session',
      expiresAt: '2026-05-05T12:00:00Z',
      user: { id: 'user-1', email: 'alice@example.com' },
      defaultWorkspace: { id: 'workspace-1', name: 'Default' }
    });
  });

  it('persists valid local development sessions', () => {
    const storage = new MemoryStorage();

    writeSoseinSession(
      {
        serverUrl: 'http://127.0.0.1:18787/',
        sessionToken: 'session',
        expiresAt: '2026-05-05T12:00:00Z',
        user: { id: 'user-1', email: 'alice@example.com' },
        defaultWorkspace: { id: 'workspace-1', name: 'Default' }
      },
      storage
    );

    expect(readSoseinSession(storage)).toEqual({
      serverUrl: 'http://127.0.0.1:18787',
      sessionToken: 'session',
      expiresAt: '2026-05-05T12:00:00Z',
      user: { id: 'user-1', email: 'alice@example.com' },
      defaultWorkspace: { id: 'workspace-1', name: 'Default' }
    });
  });

  it('rejects sessions from unknown server URLs', () => {
    const storage = new MemoryStorage();

    writeSoseinSession(
      {
        serverUrl: 'https://example.com',
        sessionToken: 'session',
        expiresAt: '2026-05-05T12:00:00Z',
        user: { id: 'user-1', email: 'alice@example.com' },
        defaultWorkspace: { id: 'workspace-1', name: 'Default' }
      },
      storage
    );

    expect(readSoseinSession(storage)).toBeNull();
  });

  it('drops invalid profile picture URLs from otherwise valid sessions', () => {
    const storage = new MemoryStorage();

    writeSoseinSession(
      {
        serverUrl: `${SOSEIN_CLOUD_API_BASE_URL}/`,
        sessionToken: 'session',
        expiresAt: '2026-05-05T12:00:00Z',
        user: { id: 'user-1', email: 'alice@example.com', profilePictureUrl: 'javascript:alert(1)' },
        defaultWorkspace: { id: 'workspace-1', name: 'Default' }
      },
      storage
    );

    expect(readSoseinSession(storage)).toEqual({
      serverUrl: SOSEIN_CLOUD_API_BASE_URL,
      sessionToken: 'session',
      expiresAt: '2026-05-05T12:00:00Z',
      user: { id: 'user-1', email: 'alice@example.com' },
      defaultWorkspace: { id: 'workspace-1', name: 'Default' }
    });
  });

  it('normalizes legacy stored profile image field aliases', () => {
    const storage = new MemoryStorage();

    storage.setItem(
      'margin:sosein-cloud:session:v1',
      JSON.stringify({
        serverUrl: `${SOSEIN_CLOUD_API_BASE_URL}/`,
        sessionToken: 'session',
        expiresAt: '2026-05-05T12:00:00Z',
        user: {
          id: 'user-1',
          email: 'alice@example.com',
          display_name: 'Alice Alias',
          profile_picture_url: 'https://example.com/alice.png'
        },
        defaultWorkspace: { id: 'workspace-1', name: 'Default' }
      })
    );

    expect(readSoseinSession(storage)?.user).toEqual({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice Alias',
      profilePictureUrl: 'https://example.com/alice.png'
    });
  });
});
