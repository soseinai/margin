import { describe, expect, it } from 'vitest';
import {
  isMarkdownMermaidFenceLanguage,
  isClosingMarkdownFence,
  markdownFenceContent,
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

  it('recognizes mermaid fence languages', () => {
    expect(isMarkdownMermaidFenceLanguage('mermaid')).toBe(true);
    expect(isMarkdownMermaidFenceLanguage('Mermaid')).toBe(true);
    expect(isMarkdownMermaidFenceLanguage('mmd')).toBe(true);
    expect(isMarkdownMermaidFenceLanguage('typescript')).toBe(false);
  });

  it('matches closing fences with compatible marker and length', () => {
    const fence = openingMarkdownFence('````ts');

    expect(fence).not.toBeNull();
    expect(isClosingMarkdownFence('````', fence!)).toBe(true);
    expect(isClosingMarkdownFence('```', fence!)).toBe(false);
    expect(isClosingMarkdownFence('~~~~', fence!)).toBe(false);
    expect(isClosingMarkdownFence('```` js', fence!)).toBe(false);
  });

  it('extracts fenced block content without the fence lines', () => {
    expect(markdownFenceContent(['```mermaid', 'graph TD', 'A-->B', '```'], { start: 1, end: 4 })).toBe(
      'graph TD\nA-->B'
    );
    expect(markdownFenceContent(['```mermaid', 'graph TD'], { start: 1, end: 2 })).toBe('graph TD');
  });
});
