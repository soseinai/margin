import { ChangeSet } from '@codemirror/state';

export type DraftSuggestionStatus = 'applied';

export type SavedSuggestionLike = {
  kind: string;
  quote: string;
  body: string;
};

export type DraftSuggestion = {
  id: string;
  kind: 'suggestion';
  author: string;
  quote: string;
  body: string;
  line: number;
  endLine: number;
  currentLine: number;
  currentEndLine: number;
  diffQuote: string;
  diffBody: string;
  pending: true;
  applied: true;
  resolved: false;
  status: DraftSuggestionStatus;
};

export type DraftSuggestionOptions = {
  author?: string;
  syncedKeys?: ReadonlySet<string>;
};

type LineDiffHunk = {
  baseStart: number;
  baseEnd: number;
  currentStart: number;
  currentEnd: number;
};

type LineIndex = {
  text: string;
  lines: string[];
  starts: number[];
};

type SuggestionPatch = {
  quote: string;
  body: string;
  diffQuote: string;
  diffBody: string;
  line: number;
  endLine: number;
  currentLine: number;
  currentEndLine: number;
};

export function draftMarkdownSuggestions(
  changes: ChangeSet,
  base: string,
  current: string,
  savedThreads: SavedSuggestionLike[] = [],
  options: DraftSuggestionOptions = {}
): DraftSuggestion[] {
  if (changes.empty) return [];

  const baseIndex = lineIndexForText(base);
  const currentIndex = lineIndexForText(current);
  const suggestions: DraftSuggestion[] = [];
  const seenKeys = new Set<string>();
  const syncedKeys = options.syncedKeys ?? new Set<string>();
  const author = options.author ?? 'Me';

  changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    const hunk = hunkFromTransactionRange(
      baseIndex,
      currentIndex,
      fromA,
      toA,
      fromB,
      toB,
      inserted.toString()
    );
    if (!hunk) return;

    const suggestion = suggestionFromHunk(baseIndex.lines, currentIndex.lines, hunk);
    if (!suggestion) return;

    const key = suggestionKey(suggestion.line, suggestion.endLine, suggestion.quote, suggestion.body);
    const saved = savedThreads.some(
      (thread) =>
        thread.kind === 'suggestion' &&
        thread.quote === suggestion.quote &&
        thread.body === suggestion.body
    );
    if (saved || syncedKeys.has(key) || seenKeys.has(key)) return;
    seenKeys.add(key);

    suggestions.push({
      id: `pending-edit-${suggestion.line}-${suggestion.endLine}`,
      kind: 'suggestion',
      author,
      quote: suggestion.quote,
      body: suggestion.body,
      line: suggestion.line,
      endLine: suggestion.endLine,
      currentLine: suggestion.currentLine,
      currentEndLine: suggestion.currentEndLine,
      diffQuote: suggestion.diffQuote,
      diffBody: suggestion.diffBody,
      pending: true,
      applied: true,
      resolved: false,
      status: 'applied'
    });
  });

  return suggestions;
}

export function suggestionKey(line: number, endLine: number, original: string, replacement: string) {
  return `${line}-${endLine}:${original}->${replacement}`;
}

function lineIndexForText(text: string): LineIndex {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1);
  }

  return {
    text,
    lines: text.split('\n'),
    starts
  };
}

function hunkFromTransactionRange(
  baseIndex: LineIndex,
  currentIndex: LineIndex,
  fromA: number,
  toA: number,
  fromB: number,
  toB: number,
  insertedText: string
): LineDiffHunk | null {
  const deletedText = baseIndex.text.slice(fromA, toA);
  const baseStartLine = lineIndexAtOffset(baseIndex, fromA);
  const currentStartLine = lineIndexAtOffset(currentIndex, fromB);
  const startsAtLineBoundary = fromA === baseIndex.starts[baseStartLine];
  const lineInsertion = insertedLineHunk(
    baseIndex,
    currentIndex,
    fromA,
    toA,
    insertedText,
    baseStartLine,
    currentStartLine
  );
  const insertedWholeLines =
    fromA === toA && startsAtLineBoundary && insertedText.includes('\n') && insertedText.endsWith('\n');
  const deletedWholeLines =
    fromB === toB && startsAtLineBoundary && deletedText.includes('\n') && deletedText.endsWith('\n');

  if (lineInsertion) return lineInsertion;

  if (insertedWholeLines) {
    return trimUnchangedHunk(baseIndex.lines, currentIndex.lines, {
      baseStart: baseStartLine,
      baseEnd: baseStartLine,
      currentStart: currentStartLine,
      currentEnd: currentStartLine + wholeLineCount(insertedText)
    });
  }

  if (deletedWholeLines) {
    return trimUnchangedHunk(baseIndex.lines, currentIndex.lines, {
      baseStart: baseStartLine,
      baseEnd: baseStartLine + wholeLineCount(deletedText),
      currentStart: currentStartLine,
      currentEnd: currentStartLine
    });
  }

  const baseSpan = baseLineSpanForRange(baseIndex, fromA, toA);
  const currentSpan = currentLineSpanForRange(currentIndex, fromB, toB);

  return trimUnchangedHunk(baseIndex.lines, currentIndex.lines, {
    baseStart: baseSpan.baseStart,
    baseEnd: baseSpan.baseEnd,
    currentStart: currentSpan.currentStart,
    currentEnd: currentSpan.currentEnd
  });
}

function insertedLineHunk(
  baseIndex: LineIndex,
  currentIndex: LineIndex,
  fromA: number,
  toA: number,
  insertedText: string,
  baseStartLine: number,
  currentStartLine: number
): LineDiffHunk | null {
  if (
    fromA !== toA ||
    !insertedText.includes('\n') ||
    (!insertedText.startsWith('\n') && !insertedText.endsWith('\n'))
  ) {
    return null;
  }

  const insertedLineCount = insertedText.split('\n').length - 1;
  if (insertedLineCount <= 0) return null;

  const insertsAfterCurrentLine = insertedText.startsWith('\n');
  const baseStart = baseStartLine + (insertsAfterCurrentLine ? 1 : 0);
  const currentStart = currentStartLine + (insertsAfterCurrentLine ? 1 : 0);

  return trimUnchangedHunk(baseIndex.lines, currentIndex.lines, {
    baseStart,
    baseEnd: baseStart,
    currentStart,
    currentEnd: Math.min(currentStart + insertedLineCount, currentIndex.lines.length)
  });
}

function baseLineSpanForRange(index: LineIndex, from: number, to: number) {
  const span = lineSpanForRange(index, from, to);
  return { baseStart: span.start, baseEnd: span.end };
}

function currentLineSpanForRange(index: LineIndex, from: number, to: number) {
  const span = lineSpanForRange(index, from, to);
  return { currentStart: span.start, currentEnd: span.end };
}

function lineSpanForRange(index: LineIndex, from: number, to: number) {
  if (from === to) {
    const line = lineIndexAtOffset(index, from);
    return { start: line, end: Math.min(line + 1, index.lines.length) };
  }

  const start = lineIndexAtOffset(index, from);
  const endOffset = index.text[to - 1] === '\n' ? to : to - 1;
  const end = Math.min(lineIndexAtOffset(index, endOffset) + 1, index.lines.length);

  return { start, end };
}

function lineIndexAtOffset(index: LineIndex, offset: number) {
  const safeOffset = Math.max(0, Math.min(index.text.length, offset));
  let low = 0;
  let high = index.starts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (index.starts[middle] <= safeOffset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return Math.max(0, low - 1);
}

function wholeLineCount(text: string) {
  return text.endsWith('\n') ? text.slice(0, -1).split('\n').length : text.split('\n').length;
}

function trimUnchangedHunk(
  baseLines: string[],
  currentLines: string[],
  hunk: LineDiffHunk
): LineDiffHunk | null {
  let { baseStart, baseEnd, currentStart, currentEnd } = hunk;

  while (
    baseStart < baseEnd &&
    currentStart < currentEnd &&
    baseLines[baseStart] === currentLines[currentStart]
  ) {
    baseStart += 1;
    currentStart += 1;
  }

  while (
    baseEnd > baseStart &&
    currentEnd > currentStart &&
    baseLines[baseEnd - 1] === currentLines[currentEnd - 1]
  ) {
    baseEnd -= 1;
    currentEnd -= 1;
  }

  if (baseStart === baseEnd && currentStart === currentEnd) return null;

  return { baseStart, baseEnd, currentStart, currentEnd };
}

function suggestionFromHunk(
  baseLines: string[],
  currentLines: string[],
  hunk: LineDiffHunk
): SuggestionPatch | null {
  const originalLines = trimDiffBlock(baseLines.slice(hunk.baseStart, hunk.baseEnd));
  const replacementLines = trimDiffBlock(currentLines.slice(hunk.currentStart, hunk.currentEnd));
  const diffQuote = originalLines.join('\n');
  const diffBody = replacementLines.join('\n');
  let quote = diffQuote;
  let body = diffBody;
  let line = hunk.baseStart + 1;
  let endLine = Math.max(line, hunk.baseEnd);
  let currentLine = hunk.currentStart + 1;
  let currentEndLine = Math.max(currentLine, hunk.currentEnd);

  if (!quote && diffBody) {
    const insertion = insertionPatch(baseLines, hunk.baseStart, replacementLines);
    if (!insertion) return null;
    quote = insertion.quote;
    body = insertion.body;
    line = insertion.line;
    endLine = insertion.endLine;
    currentLine = hunk.currentStart + 1;
    currentEndLine = Math.max(currentLine, hunk.currentEnd);
  }

  if (!quote || quote === body) return null;

  return {
    quote,
    body,
    diffQuote,
    diffBody,
    line,
    endLine,
    currentLine,
    currentEndLine
  };
}

function insertionPatch(baseLines: string[], baseStart: number, insertedLines: string[]) {
  for (let anchorIndex = baseStart - 1; anchorIndex >= 0; anchorIndex -= 1) {
    if (!baseLines[anchorIndex].trim()) continue;
    const context = baseLines.slice(anchorIndex, baseStart);
    return {
      quote: context.join('\n'),
      body: [...context, ...insertedLines].join('\n'),
      line: anchorIndex + 1,
      endLine: Math.max(anchorIndex + 1, baseStart)
    };
  }

  for (let anchorIndex = baseStart; anchorIndex < baseLines.length; anchorIndex += 1) {
    if (!baseLines[anchorIndex].trim()) continue;
    const context = baseLines.slice(baseStart, anchorIndex + 1);
    return {
      quote: context.join('\n'),
      body: [...insertedLines, ...context].join('\n'),
      line: baseStart + 1,
      endLine: anchorIndex + 1
    };
  }

  return null;
}

function trimDiffBlock(lines: string[]) {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start] === '') start += 1;
  while (end > start && lines[end - 1] === '') end -= 1;

  return lines.slice(start, end);
}
