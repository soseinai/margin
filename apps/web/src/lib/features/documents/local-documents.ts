export type RecentDocument = {
  path: string;
  title: string;
  openedAt: number;
};

const defaultRecentDocumentLimit = 10;

export function normalizeRecentDocuments(
  documents: unknown,
  limit = defaultRecentDocumentLimit
): RecentDocument[] {
  if (!Array.isArray(documents) || limit <= 0) return [];

  const seenPaths = new Set<string>();
  const normalized: RecentDocument[] = [];

  for (const entry of documents) {
    if (!entry || typeof entry !== 'object') continue;

    const document = entry as Partial<RecentDocument>;
    const path = typeof document.path === 'string' ? document.path.trim() : '';

    if (!path || seenPaths.has(path)) continue;

    const title =
      typeof document.title === 'string' && document.title.trim()
        ? document.title.trim()
        : fileNameFromPath(path);
    const openedAt =
      typeof document.openedAt === 'number' && Number.isFinite(document.openedAt)
        ? document.openedAt
        : 0;

    seenPaths.add(path);
    normalized.push({ path, title, openedAt });

    if (normalized.length >= limit) break;
  }

  return normalized;
}

export function isMarkdownPathLike(path: string) {
  return (/\.(md|markdown|txt)$/i).test(path);
}

export function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || 'Untitled.md';
}

export function normalizePathSeparators(path: string) {
  return decodePathComponent(path).replace(/\\/g, '/');
}

export function decodePathComponent(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function isAbsoluteLocalPath(path: string) {
  const normalized = normalizePathSeparators(path);

  return normalized.startsWith('/') || (/^[A-Za-z]:\//).test(normalized);
}

export function directoryPath(path: string) {
  const normalized = normalizePathSeparators(path);
  const index = normalized.lastIndexOf('/');

  if (index < 0) return '';
  if (index === 0) return '/';

  return normalized.slice(0, index);
}

export function compactLocalPath(path: string) {
  const normalized = normalizePathSeparators(path);

  return normalized.replace(/^\/Users\/[^/]+(?=\/|$)/, '~') || 'Local file';
}

export function joinLocalPath(base: string, path: string) {
  const decodedPath = normalizePathSeparators(path);

  if (isAbsoluteLocalPath(decodedPath)) return decodedPath;

  const baseParts = splitLocalPath(base);
  const parts = [...baseParts.parts];

  for (const part of decodedPath.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return buildLocalPath(baseParts.root, parts);
}

export function relativeLocalPath(fromDirectory: string, toPath: string) {
  const from = splitLocalPath(fromDirectory);
  const to = splitLocalPath(toPath);

  if (from.root !== to.root) return '';

  let shared = 0;

  while (from.parts[shared] && from.parts[shared] === to.parts[shared]) {
    shared += 1;
  }

  const up = from.parts.slice(shared).map(() => '..');
  const down = to.parts.slice(shared);

  return [...up, ...down].join('/');
}

export function splitLocalPath(path: string) {
  const normalized = normalizePathSeparators(path);
  const drive = /^([A-Za-z]:)(?:\/|$)/.exec(normalized);
  const root = drive ? `${drive[1]}/` : normalized.startsWith('/') ? '/' : '';
  const rest = root ? normalized.slice(root.length) : normalized;

  return {
    root,
    parts: rest.split('/').filter(Boolean)
  };
}

export function buildLocalPath(root: string, parts: string[]) {
  if (!root) return parts.join('/');
  if (root === '/') return `/${parts.join('/')}`;

  return `${root}${parts.join('/')}`;
}

export function markdownImageReference(source: string, alt: string, documentPath = '') {
  const destination = isAbsoluteLocalPath(source)
    ? markdownImageDestinationForPath(source, documentPath)
    : source;

  return `![${escapeMarkdownImageAlt(alt)}](${markdownImageDestination(destination)})`;
}

export function markdownImageDestinationForPath(path: string, documentPath = '') {
  const normalized = normalizePathSeparators(path);
  const documentDirectory = documentPath ? directoryPath(documentPath) : '';
  const relative = documentDirectory ? relativeLocalPath(documentDirectory, normalized) : '';

  return relative || normalized;
}

export function markdownImageDestination(destination: string) {
  const value = destination.trim();

  if (/[\s()<>]/.test(value)) {
    return `<${value.replace(/</g, '%3C').replace(/>/g, '%3E')}>`;
  }

  return value;
}

export function escapeMarkdownImageAlt(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

export function imageAltText(source: string) {
  const name = fileNameFromPath(source.split(/[?#]/)[0] || source);
  const withoutExtension = name.replace(/\.[^.]+$/, '');

  return decodePathComponent(withoutExtension).replace(/[-_]+/g, ' ').trim() || 'Image';
}

export function isImageSourceLike(source: string) {
  return (/^(?:blob:|data:image\/)/i).test(source) || isImagePathLike(source) || source.startsWith('file://');
}

export function isImagePathLike(path: string) {
  return (/\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)(?:[?#].*)?$/i).test(path);
}
