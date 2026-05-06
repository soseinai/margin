export type MarkdownFenceInfo = { marker: '`' | '~'; length: number; language: string };
export type MarkdownFenceBlockRange = { start: number; end: number };

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

export function isMarkdownMermaidFenceLanguage(language: string) {
  const normalized = markdownCodeFenceLanguage(language).toLowerCase();

  return normalized === 'mermaid' || normalized === 'mmd';
}

export function isClosingMarkdownFence(text: string, fence: MarkdownFenceInfo | Pick<MarkdownFenceInfo, 'marker' | 'length'>) {
  const trimmed = text.trim();

  if (!trimmed || trimmed[0] !== fence.marker || trimmed.length < fence.length) return false;

  return [...trimmed].every((character) => character === fence.marker);
}

export function markdownFenceContent(lines: string[], block: MarkdownFenceBlockRange) {
  const startIndex = Math.max(0, block.start - 1);
  const endIndex = Math.max(startIndex, block.end - 1);
  const opening = openingMarkdownFence(lines[startIndex] ?? '');
  const hasClosingFence = Boolean(
    opening
      && block.end > block.start
      && isClosingMarkdownFence(lines[endIndex] ?? '', opening)
  );

  return lines
    .slice(startIndex + 1, hasClosingFence ? endIndex : block.end)
    .join('\n');
}
