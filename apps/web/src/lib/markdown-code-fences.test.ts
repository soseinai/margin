import { describe, expect, it } from 'vitest';
import {
  isClosingMarkdownFence,
  markdownCodeFenceLanguage,
  openingMarkdownFence
} from './markdown-code-fences';

describe('Markdown code fence helpers', () => {
  it('parses opening fence markers and language info', () => {
    expect(openingMarkdownFence('```ts')).toEqual({ marker: '`', length: 3, language: 'ts' });
    expect(openingMarkdownFence('~~~~ {.language-rust}')).toEqual({
      marker: '~',
      length: 4,
      language: 'rust'
    });
    expect(openingMarkdownFence('``')).toBeNull();
  });

  it('normalizes language tokens', () => {
    expect(markdownCodeFenceLanguage('{.language-javascript}')).toBe('javascript');
    expect(markdownCodeFenceLanguage('.python title="Example"')).toBe('python');
    expect(markdownCodeFenceLanguage('')).toBe('');
  });

  it('matches closing fences with compatible marker and length', () => {
    const fence = openingMarkdownFence('````ts');

    expect(fence).not.toBeNull();
    expect(isClosingMarkdownFence('````', fence!)).toBe(true);
    expect(isClosingMarkdownFence('```', fence!)).toBe(false);
    expect(isClosingMarkdownFence('~~~~', fence!)).toBe(false);
    expect(isClosingMarkdownFence('```` js', fence!)).toBe(false);
  });
});
