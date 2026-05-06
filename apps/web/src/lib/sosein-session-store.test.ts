import { describe, expect, it } from 'vitest';
import { SOSEIN_CLOUD_API_BASE_URL } from './sosein-cloud';
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
  it('persists and clears valid sessions', () => {
    const storage = new MemoryStorage();

    writeSoseinSession(
      {
        serverUrl: `${SOSEIN_CLOUD_API_BASE_URL}/`,
        sessionToken: 'session',
        expiresAt: '2026-05-05T12:00:00Z',
        user: { id: 'user-1', email: 'alice@example.com' },
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

    clearSoseinSession(storage);
    expect(readSoseinSession(storage)).toBeNull();
  });

  it('rejects sessions from non-constant server URLs', () => {
    const storage = new MemoryStorage();

    writeSoseinSession(
      {
        serverUrl: 'http://127.0.0.1:18787',
        sessionToken: 'session',
        expiresAt: '2026-05-05T12:00:00Z',
        user: { id: 'user-1', email: 'alice@example.com' },
        defaultWorkspace: { id: 'workspace-1', name: 'Default' }
      },
      storage
    );

    expect(readSoseinSession(storage)).toBeNull();
  });
});
