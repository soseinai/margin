const fallbackLocalUserName = 'Me';

export function defaultLocalUserName() {
  return fallbackLocalUserName;
}

export function normalizeLocalUserName(value: unknown, fallback = fallbackLocalUserName) {
  if (typeof value !== 'string') return fallback;

  const name = value.trim().replace(/\s+/g, ' ');

  return name || fallback;
}

export function authorInitials(author: string) {
  const words = normalizeLocalUserName(author).split(/\s+/);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? words[words.length - 1]?.[0] ?? '' : '';

  return `${first}${last}`.toUpperCase() || 'ME';
}

export function avatarStyle(author: string) {
  const hue = hashIdentity(author) % 360;

  return [
    `--avatar-bg: hsl(${hue} 58% 38%)`,
    `--avatar-border: hsl(${hue} 52% 30%)`,
    '--avatar-fg: #fff'
  ].join('; ');
}

function hashIdentity(author: string) {
  const value = normalizeLocalUserName(author).toLowerCase();
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
