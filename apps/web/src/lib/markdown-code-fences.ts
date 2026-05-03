export type MarkdownFenceInfo = { marker: '`' | '~'; length: number; language: string };

export function openingMarkdownFence(text: string): MarkdownFenceInfo | null {
  const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(text);

  if (!match) return null;

  const marker = match[1][0] as '`' | '~';

  return { marker, length: match[1].length, language: markdownCodeFenceLanguage(match[2] ?? '') };
}

export function markdownCodeFenceLanguage(info: string) {
  const token = info.trim().split(/\s+/)[0] ?? '';

  return token
    .replace(/^\{\.?/, '')
    .replace(/^\./, '')
    .replace(/^language-/, '')
    .replace(/\}$/, '');
}

export function isClosingMarkdownFence(text: string, fence: MarkdownFenceInfo | Pick<MarkdownFenceInfo, 'marker' | 'length'>) {
  const trimmed = text.trim();

  if (!trimmed || trimmed[0] !== fence.marker || trimmed.length < fence.length) return false;

  return [...trimmed].every((character) => character === fence.marker);
}
