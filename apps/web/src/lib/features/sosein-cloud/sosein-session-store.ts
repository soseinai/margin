import {
  normalizeSoseinProfilePictureUrl,
  normalizeSoseinUserName,
  SOSEIN_CLOUD_API_BASE_URL,
  type SoseinStoredSession
} from './sosein-cloud';

const soseinSessionStorageKey = 'margin:sosein-cloud:session:v1';

export type SoseinBrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readSoseinSession(storage = browserStorage()): SoseinStoredSession | null {
  if (!storage) return null;

  try {
    return normalizeStoredSession(JSON.parse(storage.getItem(soseinSessionStorageKey) || 'null'));
  } catch {
    return null;
  }
}

export function writeSoseinSession(session: SoseinStoredSession, storage = browserStorage()) {
  if (!storage) return;

  storage.setItem(soseinSessionStorageKey, JSON.stringify(normalizeStoredSession(session)));
}

export function clearSoseinSession(storage = browserStorage()) {
  if (!storage) return;

  storage.removeItem(soseinSessionStorageKey);
}

function normalizeStoredSession(value: unknown): SoseinStoredSession | null {
  if (!value || typeof value !== 'object') return null;

  const session = value as Partial<SoseinStoredSession>;

  if (
    typeof session.sessionToken !== 'string'
    || !session.sessionToken
    || !session.user
    || typeof session.user.id !== 'string'
    || typeof session.user.email !== 'string'
    || !session.defaultWorkspace
    || typeof session.defaultWorkspace.id !== 'string'
    || typeof session.defaultWorkspace.name !== 'string'
    || typeof session.expiresAt !== 'string'
  ) {
    return null;
  }

  const serverUrl = storedSessionServerUrl(session.serverUrl);
  const rawUser = session.user as Partial<SoseinStoredSession['user']> & {
    displayName?: unknown;
    display_name?: unknown;
    imageUrl?: unknown;
    image_url?: unknown;
    picture?: unknown;
    profileImageUrl?: unknown;
    profile_image_url?: unknown;
    profilePictureUrl?: unknown;
    profile_picture_url?: unknown;
  };
  const name = normalizeSoseinUserName(session.user.name)
    ?? normalizeSoseinUserName(rawUser.displayName)
    ?? normalizeSoseinUserName(rawUser.display_name);
  const profilePictureUrl = normalizeSoseinProfilePictureUrl(rawUser.profilePictureUrl)
    ?? normalizeSoseinProfilePictureUrl(rawUser.profile_picture_url)
    ?? normalizeSoseinProfilePictureUrl(rawUser.profileImageUrl)
    ?? normalizeSoseinProfilePictureUrl(rawUser.profile_image_url)
    ?? normalizeSoseinProfilePictureUrl(rawUser.imageUrl)
    ?? normalizeSoseinProfilePictureUrl(rawUser.image_url)
    ?? normalizeSoseinProfilePictureUrl(rawUser.picture);

  if (!serverUrl) return null;

  return {
    serverUrl,
    sessionToken: session.sessionToken,
    user: {
      id: session.user.id,
      email: session.user.email,
      ...(name ? { name } : {}),
      ...(profilePictureUrl ? { profilePictureUrl } : {})
    },
    defaultWorkspace: {
      id: session.defaultWorkspace.id,
      name: session.defaultWorkspace.name
    },
    expiresAt: session.expiresAt
  };
}

function storedSessionServerUrl(value: unknown) {
  if (typeof value !== 'string') return null;

  try {
    const parsed = new URL(value.trim());

    parsed.hash = '';
    parsed.search = '';

    const normalized = parsed.toString().replace(/\/+$/, '');

    return normalized === SOSEIN_CLOUD_API_BASE_URL ? normalized : null;
  } catch {
    return null;
  }
}

function browserStorage(): SoseinBrowserStorage | null {
  if (typeof window === 'undefined') return null;

  return window.localStorage;
}
