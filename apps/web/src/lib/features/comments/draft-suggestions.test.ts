import { ChangeSet } from '@codemirror/state';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { draftMarkdownSuggestions, type DraftSuggestion } from './draft-suggestions';

const lineArb = fc.oneof(
  fc.constantFrom(
    'shared text',
    'repeat me',
    'business review',
    '## Heading',
    '- list item',
    '    indented code',
    '`inline code`',
    '**bold claim**'
  ),
  fc
    .array(fc.constantFrom('alpha', 'beta', 'gamma', 'review', 'margin', 'patch', 'same'), {
      minLength: 1,
      maxLength: 5
    })
    .map((words) => words.join(' '))
);

const nonBlankLineArb = lineArb.filter((line) => line.trim().length > 0);

type TextChange = {
  from: number;
  to?: number;
  insert?: string;
};

describe('draftMarkdownSuggestions', () => {
  it('keeps identical edits at separate locations as separate suggestions', () => {
    const base = ['same text', 'middle one', 'same text', 'middle two', 'same text'].join('\n');
    const { starts, ends } = lineOffsets(base.split('\n'));
    const specs: TextChange[] = [
      { from: starts[0], to: ends[0], insert: 'changed text' },
      { from: starts[2], to: ends[2], insert: 'changed text' }
    ];
    const current = applySpecs(base, specs);

    const suggestions = draftMarkdownSuggestions(ChangeSet.of(specs, base.length), base, current);

    expect(suggestions).toHaveLength(2);
    expect(suggestions.map((suggestion) => suggestion.line)).toEqual([1, 3]);
    expect(suggestions.map((suggestion) => suggestion.currentLine)).toEqual([1, 3]);
    expect(applySuggestionsByBaseLine(base, suggestions)).toBe(current);
  });

  it('does not include the previous line in the visible diff for inserted lines', () => {
    const base = ['Keep this line', 'Target line', 'After line'].join('\n');
    const { starts } = lineOffsets(base.split('\n'));
    const specs: TextChange[] = [{ from: starts[1], to: starts[1], insert: 'Inserted line\n' }];
    const current = applySpecs(base, specs);

    const suggestions = draftMarkdownSuggestions(ChangeSet.of(specs, base.length), base, current);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].diffQuote).toBe('');
    expect(suggestions[0].diffBody).toBe('Inserted line');
    expect(suggestions[0].currentLine).toBe(2);
    expect(applySuggestionsByBaseLine(base, suggestions)).toBe(current);
  });

  it('carries the active author image onto draft suggestions', () => {
    const base = 'Target line';
    const current = 'Updated line';
    const specs: TextChange[] = [{ from: 0, to: base.length, insert: current }];

    const suggestions = draftMarkdownSuggestions(ChangeSet.of(specs, base.length), base, current, [], {
      author: 'Alice Example',
      authorImageUrl: 'https://example.com/alice.png'
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      author: 'Alice Example',
      authorImageUrl: 'https://example.com/alice.png'
    });
  });

  it('property: random line replacements reconstruct the edited document', () => {
    fc.assert(
      fc.property(
        fc.array(lineArb, { minLength: 1, maxLength: 28 }),
        fc.array(fc.option(lineArb, { nil: undefined }), { minLength: 1, maxLength: 28 }),
        (baseLines, plan) => {
          const base = baseLines.join('\n');
          const { starts, ends } = lineOffsets(baseLines);
          const specs: TextChange[] = [];
          const changedLines: number[] = [];

          for (let index = 0; index < Math.min(baseLines.length, plan.length); index += 1) {
            const replacement = plan[index];
            if (replacement === undefined || replacement === baseLines[index]) continue;
            specs.push({ from: starts[index], to: ends[index], insert: replacement });
            changedLines.push(index + 1);
          }

          fc.pre(specs.length > 0);

          const changes = ChangeSet.of(specs, base.length);
          const current = applySpecs(base, specs);
          const suggestions = draftMarkdownSuggestions(changes, base, current);

          expect(applySuggestionsByBaseLine(base, suggestions)).toBe(current);
          for (const line of changedLines) {
            expect(suggestions.some((suggestion) => suggestion.line <= line && suggestion.endLine >= line)).toBe(
              true
            );
          }
        }
      ),
      { numRuns: 300 }
    );
  });

  it('property: random whole-line insertions reconstruct the edited document', () => {
    fc.assert(
      fc.property(
        fc.array(nonBlankLineArb, { minLength: 1, maxLength: 24 }),
        fc.nat(24),
        fc.array(nonBlankLineArb, { minLength: 1, maxLength: 4 }),
        (baseLines, rawBoundary, insertedLines) => {
          const base = baseLines.join('\n');
          const { starts } = lineOffsets(baseLines);
          const boundary = rawBoundary % (baseLines.length + 1);
          const from = boundary === baseLines.length ? base.length : starts[boundary];
          const insert =
            boundary === baseLines.length ? `\n${insertedLines.join('\n')}` : `${insertedLines.join('\n')}\n`;
          const specs: TextChange[] = [{ from, to: from, insert }];
          const changes = ChangeSet.of(specs, base.length);
          const current = applySpecs(base, specs);
          const suggestions = draftMarkdownSuggestions(changes, base, current);

          expect(suggestions).toHaveLength(1);
          expect(suggestions[0].diffQuote).toBe('');
          expect(suggestions[0].diffBody).toBe(insertedLines.join('\n'));
          expect(suggestions[0].currentLine).toBe(boundary + 1);
          expect(applySuggestionsByBaseLine(base, suggestions)).toBe(current);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('property: random whole-line deletions reconstruct the edited document', () => {
    fc.assert(
      fc.property(
        fc.array(nonBlankLineArb, { minLength: 2, maxLength: 24 }),
        fc.nat(22),
        (baseLines, rawLine) => {
          const base = baseLines.join('\n');
          const { starts } = lineOffsets(baseLines);
          const deletedLine = rawLine % (baseLines.length - 1);
          const specs: TextChange[] = [{ from: starts[deletedLine], to: starts[deletedLine + 1], insert: '' }];
          const changes = ChangeSet.of(specs, base.length);
          const current = applySpecs(base, specs);
          const suggestions = draftMarkdownSuggestions(changes, base, current);

          expect(suggestions).toHaveLength(1);
          expect(suggestions[0].diffQuote).toBe(baseLines[deletedLine]);
          expect(suggestions[0].diffBody).toBe('');
          expect(applySuggestionsByBaseLine(base, suggestions)).toBe(current);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('property: random mixed line edits reconstruct the edited document', () => {
    fc.assert(
      fc.property(
        fc.array(nonBlankLineArb, { minLength: 6, maxLength: 30 }),
        fc.nat(2),
        fc.array(fc.constantFrom('replace', 'insert', 'delete', 'keep'), { minLength: 1, maxLength: 10 }),
        fc.array(nonBlankLineArb, { minLength: 1, maxLength: 10 }),
        (baseLines, rawOffset, operations, payloads) => {
          const base = baseLines.join('\n');
          const { starts, ends } = lineOffsets(baseLines);
          const candidateLines = spacedLineIndexes(baseLines.length, rawOffset % 3);
          const specs: TextChange[] = [];

          for (let index = 0; index < Math.min(candidateLines.length, operations.length); index += 1) {
            const line = candidateLines[index];
            const payload = payloads[index % payloads.length];

            if (operations[index] === 'replace' && payload !== baseLines[line]) {
              specs.push({ from: starts[line], to: ends[line], insert: payload });
            }

            if (operations[index] === 'insert') {
              specs.push({ from: starts[line], to: starts[line], insert: `${payload}\n` });
            }

            if (operations[index] === 'delete' && line < baseLines.length - 1) {
              specs.push({ from: starts[line], to: starts[line + 1], insert: '' });
            }
          }

          fc.pre(specs.length > 0);

          const changes = ChangeSet.of(specs, base.length);
          const current = applySpecs(base, specs);
          const suggestions = draftMarkdownSuggestions(changes, base, current);

          expect(applySuggestionsByBaseLine(base, suggestions)).toBe(current);
        }
      ),
      { numRuns: 500 }
    );
  });
});

function lineOffsets(lines: string[]) {
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;

  for (let index = 0; index < lines.length; index += 1) {
    starts.push(offset);
    ends.push(offset + lines[index].length);
    offset += lines[index].length + (index === lines.length - 1 ? 0 : 1);
  }

  return { starts, ends };
}

function applySpecs(base: string, specs: TextChange[]) {
  return [...specs]
    .sort((left, right) => right.from - left.from)
    .reduce((draft, spec) => {
      const to = spec.to ?? spec.from;
      const insert = spec.insert?.toString() ?? '';
      return `${draft.slice(0, spec.from)}${insert}${draft.slice(to)}`;
    }, base);
}

function spacedLineIndexes(lineCount: number, offset: number) {
  const indexes: number[] = [];
  for (let line = offset; line < lineCount; line += 3) indexes.push(line);
  return indexes;
}

function applySuggestionsByBaseLine(base: string, suggestions: DraftSuggestion[]) {
  const lines = base.split('\n');

  for (const suggestion of [...suggestions].sort((left, right) => right.line - left.line)) {
    const start = suggestion.line - 1;
    const deleteCount = Math.max(0, suggestion.endLine - suggestion.line + 1);
    const replacementLines = suggestion.body === '' ? [] : suggestion.body.split('\n');
    lines.splice(start, deleteCount, ...replacementLines);
  }

  return lines.join('\n');
}
