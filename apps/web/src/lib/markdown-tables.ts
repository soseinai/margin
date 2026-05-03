export type MarkdownTableAlignment = 'left' | 'center' | 'right' | null;

export type MarkdownTable = {
  headers: string[];
  alignments: MarkdownTableAlignment[];
  rows: string[][];
};

export function markdownTableCells(text: string) {
  const trimmed = text.trim();

  if (!trimmed.includes('|')) return null;

  let row = trimmed;

  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);

  const cells: string[] = [];
  let current = '';
  let escaped = false;

  for (const character of row) {
    if (escaped) {
      current += character === '|' ? '|' : `\\${character}`;
      escaped = false;

      continue;
    }

    if (character === '\\') {
      escaped = true;

      continue;
    }

    if (character === '|') {
      cells.push(current.trim());
      current = '';

      continue;
    }

    current += character;
  }

  cells.push(current.trim());

  return cells.length > 1 ? cells : null;
}

export function markdownTableDelimiterCells(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

export function markdownTableAlignment(cell: string): MarkdownTableAlignment {
  const normalized = cell.replace(/\s+/g, '');
  const left = normalized.startsWith(':');
  const right = normalized.endsWith(':');

  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';

  return null;
}

export function markdownTableAlignments(cells: string[]) {
  if (!markdownTableDelimiterCells(cells)) return null;

  return cells.map(markdownTableAlignment);
}

export function padMarkdownTableCells(cells: string[], length: number) {
  return Array.from({ length }, (_, index) => cells[index] ?? '');
}

export function padMarkdownTableAlignments(alignments: MarkdownTableAlignment[], length: number) {
  return Array.from({ length }, (_, index) => alignments[index] ?? null);
}
