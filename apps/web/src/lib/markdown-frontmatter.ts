export type MarkdownFrontmatterEntry = { key: string; value: string };

export type MarkdownFrontmatter = {
  entries: MarkdownFrontmatterEntry[];
  rawLines: string[];
};

export function isFrontmatterBoundaryLine(text: string) {
  return /^[ \t]*---[ \t]*$/.test(text);
}

export function isFrontmatterClosingLine(text: string) {
  return /^[ \t]*\.\.\.[ \t]*$/.test(text);
}

export function parseFrontmatter(rawLines: string[]): MarkdownFrontmatter {
  const entries: MarkdownFrontmatterEntry[] = [];
  let currentEntry: MarkdownFrontmatterEntry | null = null;

  for (const line of rawLines) {
    const match = /^[ \t]*([A-Za-z0-9_.-]+):[ \t]*(.*)$/.exec(line);

    if (match) {
      currentEntry = {
        key: match[1],
        value: frontmatterValueLabel(match[2])
      };

      entries.push(currentEntry);
      continue;
    }

    if (!currentEntry) continue;

    const listItem = /^[ \t]+-[ \t]+(.+)$/.exec(line);
    const continuation = /^[ \t]+(.+)$/.exec(line);

    if (listItem) {
      currentEntry.value = joinFrontmatterValue(currentEntry.value, frontmatterValueLabel(listItem[1]), ', ');
      continue;
    }

    if (continuation) {
      currentEntry.value = joinFrontmatterValue(currentEntry.value, frontmatterValueLabel(continuation[1]), ' ');
    }
  }

  return { entries, rawLines };
}

function joinFrontmatterValue(current: string, next: string, separator: string) {
  if (!current) return next;
  if (!next) return current;

  return `${current}${separator}${next}`;
}

function frontmatterValueLabel(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}
