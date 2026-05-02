import { describe, expect, it } from 'vitest';
import {
  leadingMarkdownIndent,
  leadingMarkdownWhitespaceLength,
  markdownIndentWidth,
  sourceMarkdownIndentLengthForWidth
} from './markdown-indent';

describe('Markdown indentation helpers', () => {
  it('measures leading indentation with tabs as four columns', () => {
    expect(markdownIndentWidth('  \t ')).toBe(7);
    expect(leadingMarkdownIndent('\t  item')).toBe(6);
    expect(leadingMarkdownWhitespaceLength('\t  item')).toBe(3);
  });

  it('returns the source length needed to cover a visual indent width', () => {
    expect(sourceMarkdownIndentLengthForWidth('\t  item', 4)).toBe(1);
    expect(sourceMarkdownIndentLengthForWidth('\t  item', 6)).toBe(3);
    expect(sourceMarkdownIndentLengthForWidth('  item', 0)).toBe(0);
    expect(sourceMarkdownIndentLengthForWidth('  item', 8)).toBe(2);
  });
});
