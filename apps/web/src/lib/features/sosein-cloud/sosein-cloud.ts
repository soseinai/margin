export const SOSEIN_CLOUD_API_BASE_URL = 'https://api.sosein.ai';
export const SOSEIN_CLOUD_STAGING_API_BASE_URL = 'https://api-staging.sosein.ai';
export const DEFAULT_SOSEIN_SERVER_URL = SOSEIN_CLOUD_API_BASE_URL;
export const SOSEIN_DEV_BOOTSTRAP_TOKEN = 'dev-bootstrap-token';
export const SOSEIN_BODY_TEXT_NAME = 'body';
export const SOSEIN_CLOUD_ENVIRONMENTS = [
  { environment: 'prod', label: 'Prod', serverUrl: SOSEIN_CLOUD_API_BASE_URL },
  { environment: 'staging', label: 'Staging', serverUrl: SOSEIN_CLOUD_STAGING_API_BASE_URL }
] as const;

export type SoseinCloudEnvironment = (typeof SOSEIN_CLOUD_ENVIRONMENTS)[number]['environment'];

export type SoseinUser = {
  id: string;
  email: string;
  name?: string | null;
  displayName?: string | null;
  display_name?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  picture?: string | null;
  profileImageUrl?: string | null;
  profile_image_url?: string | null;
  profilePictureUrl?: string | null;
  profile_picture_url?: string | null;
};

export type SoseinStoredUser = {
  id: string;
  email: string;
  name?: string;
  profilePictureUrl?: string;
};

export type SoseinWorkspace = {
  id: string;
  name: string;
};

export type SoseinAuthSession = {
  session_token: string;
  user: SoseinUser;
  default_workspace: SoseinWorkspace;
  expires_at: string;
};

export type SoseinStoredSession = {
  serverUrl: string;
  sessionToken: string;
  user: SoseinStoredUser;
  defaultWorkspace: SoseinWorkspace;
  expiresAt: string;
};

export type SoseinDocumentSummary = {
  id: string;
  title: string;
  content_type: string;
  current_snapshot_version: number;
  created_at: string;
  updated_at: string;
};

export type SoseinLatestSnapshot = {
  version: number;
  yrs_state_hash: string;
  markdown_content: string;
  markdown_content_hash: string;
};

export type SoseinDocument = {
  id: string;
  title: string;
  content_type: string;
  latest_snapshot: SoseinLatestSnapshot;
};

export type SoseinSyncTicket = {
  ticket: string;
  expires_at: string;
};

export type SoseinSessionValidation = {
  user: SoseinUser;
  expires_at: string;
};

export type SoseinCloudRequest = {
  baseUrl: string;
  path: string;
  method: string;
  body?: unknown;
  sessionToken?: string;
  bootstrapToken?: string;
  requireSession?: boolean;
};

export type SoseinCloudTransport = <T>(request: SoseinCloudRequest) => Promise<T>;

export class SoseinCloudApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string, message = `Sosein Cloud request failed with ${status}`) {
    super(message);
    this.name = 'SoseinCloudApiError';
    this.status = status;
    this.body = body;
  }
}

export class SoseinCloudClient {
  readonly baseUrl: string;
  readonly sessionToken?: string;
  private readonly transport?: SoseinCloudTransport;

  constructor(baseUrl = DEFAULT_SOSEIN_SERVER_URL, sessionToken?: string, transport?: SoseinCloudTransport) {
    this.baseUrl = normalizeSoseinServerUrl(baseUrl);
    this.sessionToken = sessionToken;
    this.transport = transport;
  }

  withSession(sessionToken: string) {
    return new SoseinCloudClient(this.baseUrl, sessionToken, this.transport);
  }

  async devSession(email: string, workspace = 'Default', bootstrapToken = SOSEIN_DEV_BOOTSTRAP_TOKEN) {
    return this.requestJson<SoseinAuthSession>('/v1/auth/dev-session', {
      method: 'POST',
      bootstrapToken,
      body: { email, workspace }
    });
  }

  async exchangeOAuthHandoff(handoffCode: string) {
    return this.requestJson<SoseinAuthSession>('/v1/auth/oauth/handoff/exchange', {
      method: 'POST',
      body: { handoff_code: handoffCode }
    });
  }

  oauthLoginUrl(returnTo: string, providerId = 'google') {
    const url = new URL(`/v1/auth/oauth/${encodeURIComponent(providerId)}/login`, `${this.baseUrl}/`);
    url.searchParams.set('return_to', returnTo);

    return url.toString();
  }

  async validateSession() {
    return this.requestJson<SoseinSessionValidation>('/v1/auth/session/validate', {
      method: 'POST',
      requireSession: true
    });
  }

  async listDocuments() {
    return this.requestJson<{ documents: SoseinDocumentSummary[] }>('/v1/documents', {
      requireSession: true
    });
  }

  async createDocument(title: string) {
    return this.requestJson<SoseinDocument>('/v1/documents', {
      method: 'POST',
      requireSession: true,
      body: { title }
    });
  }

  async getDocument(documentId: string) {
    return this.requestJson<SoseinDocument>(`/v1/documents/${encodeURIComponent(documentId)}`, {
      requireSession: true
    });
  }

  async issueSyncTicket(documentId: string) {
    return this.requestJson<SoseinSyncTicket>(`/v1/documents/${encodeURIComponent(documentId)}/sync-ticket`, {
      method: 'POST',
      requireSession: true
    });
  }

  private async requestJson<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      bootstrapToken?: string;
      requireSession?: boolean;
    } = {}
  ): Promise<T> {
    const method = options.method ?? 'GET';
    const sessionToken = this.sessionToken;

    if (!options.bootstrapToken && !sessionToken && options.requireSession) {
      throw new Error('No Sosein Cloud session is available');
    }

    if (this.transport) {
      return this.transport<T>({
        baseUrl: this.baseUrl,
        path,
        method,
        body: options.body,
        bootstrapToken: options.bootstrapToken,
        sessionToken,
        requireSession: Boolean(options.requireSession)
      });
    }

    const headers = new Headers();

    if (options.body !== undefined) headers.set('content-type', 'application/json');
    if (options.bootstrapToken) {
      headers.set('authorization', `Bearer ${options.bootstrapToken}`);
    } else if (sessionToken) {
      headers.set('authorization', `Bearer ${sessionToken}`);
    }

    const response = await fetch(new URL(path, `${this.baseUrl}/`), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new SoseinCloudApiError(response.status, body);
    }

    return response.json() as Promise<T>;
  }
}

export function normalizeSoseinServerUrl(value: unknown) {
  const fallback = DEFAULT_SOSEIN_SERVER_URL;

  return normalizeSoseinServerUrlOrNull(value) ?? fallback;
}

export function normalizeKnownSoseinServerUrl(value: unknown) {
  const normalized = normalizeSoseinServerUrlOrNull(value);

  if (!normalized) return null;

  return SOSEIN_CLOUD_ENVIRONMENTS.some((option) => option.serverUrl === normalized) ? normalized : null;
}

export function soseinServerUrlForEnvironment(environment: SoseinCloudEnvironment) {
  return SOSEIN_CLOUD_ENVIRONMENTS.find((option) => option.environment === environment)?.serverUrl
    ?? DEFAULT_SOSEIN_SERVER_URL;
}

export function soseinEnvironmentForServerUrl(serverUrl: unknown): SoseinCloudEnvironment {
  const normalized = normalizeKnownSoseinServerUrl(serverUrl);
  const option = SOSEIN_CLOUD_ENVIRONMENTS.find((environment) => environment.serverUrl === normalized);

  return option?.environment ?? 'prod';
}

export function soseinWebSocketBaseUrl(serverUrl: string) {
  const parsed = new URL(normalizeSoseinServerUrl(serverUrl));

  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';

  return parsed.toString().replace(/\/+$/, '');
}

export function storedSessionFromAuth(serverUrl: string, session: SoseinAuthSession): SoseinStoredSession {
  return {
    serverUrl: normalizeSoseinServerUrl(serverUrl),
    sessionToken: session.session_token,
    user: storedUserFromSoseinUser(session.user),
    defaultWorkspace: session.default_workspace,
    expiresAt: session.expires_at
  };
}

export function storedUserFromSoseinUser(user: SoseinUser): SoseinStoredUser {
  return mergedStoredUserFromSoseinUser(undefined, user);
}

export function mergedStoredUserFromSoseinUser(
  existingUser: SoseinStoredUser | undefined,
  user: SoseinUser
): SoseinStoredUser {
  const name = normalizeSoseinUserName(user.name)
    ?? normalizeSoseinUserName(user.display_name)
    ?? normalizeSoseinUserName(user.displayName)
    ?? existingUser?.name;
  const profilePictureUrl = normalizeSoseinProfilePictureUrl(user.profile_picture_url)
    ?? normalizeSoseinProfilePictureUrl(user.profilePictureUrl)
    ?? normalizeSoseinProfilePictureUrl(user.profile_image_url)
    ?? normalizeSoseinProfilePictureUrl(user.profileImageUrl)
    ?? normalizeSoseinProfilePictureUrl(user.image_url)
    ?? normalizeSoseinProfilePictureUrl(user.imageUrl)
    ?? normalizeSoseinProfilePictureUrl(user.picture)
    ?? existingUser?.profilePictureUrl;

  return {
    id: user.id,
    email: user.email,
    ...(name ? { name } : {}),
    ...(profilePictureUrl ? { profilePictureUrl } : {})
  };
}

export function soseinStoredUserDisplayName(user: SoseinStoredUser) {
  return user.name || user.email;
}

export function normalizeSoseinUserName(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim().replace(/\s+/g, ' ');

  return trimmed || null;
}

export function normalizeSoseinProfilePictureUrl(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeSoseinDocumentTitle(value: string) {
  const title = value.trim().replace(/\s+/g, ' ');

  return title || 'Untitled';
}

export function soseinDocumentFileName(title: string) {
  const cleanTitle = normalizeSoseinDocumentTitle(title);

  return (/\.(md|markdown|txt)$/i).test(cleanTitle) ? cleanTitle : `${cleanTitle}.md`;
}

function normalizeSoseinServerUrlOrNull(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    parsed.hash = '';
    parsed.search = '';

    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}
