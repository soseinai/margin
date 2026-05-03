import { describe, expect, it } from 'vitest';
import {
  isFrontmatterBoundaryLine,
  isFrontmatterClosingLine,
  parseFrontmatter
} from './markdown-frontmatter';

describe('Markdown frontmatter helpers', () => {
  it('recognizes YAML frontmatter boundaries', () => {
    expect(isFrontmatterBoundaryLine('---')).toBe(true);
    expect(isFrontmatterBoundaryLine('  ---  ')).toBe(true);
    expect(isFrontmatterClosingLine('...')).toBe(true);
    expect(isFrontmatterClosingLine('  ...  ')).toBe(true);
    expect(isFrontmatterBoundaryLine('--')).toBe(false);
    expect(isFrontmatterClosingLine('....')).toBe(false);
  });

  it('extracts flat, list, and continuation values for compact display', () => {
    expect(
      parseFrontmatter([
        'title: "Quarterly Brief"',
        'tags:',
        '  - launch',
        '  - metrics',
        'summary: First line',
        '  second line',
        'ignored continuation'
      ])
    ).toEqual({
      entries: [
        { key: 'title', value: 'Quarterly Brief' },
        { key: 'tags', value: 'launch, metrics' },
        { key: 'summary', value: 'First line second line' }
      ],
      rawLines: [
        'title: "Quarterly Brief"',
        'tags:',
        '  - launch',
        '  - metrics',
        'summary: First line',
        '  second line',
        'ignored continuation'
      ]
    });
  });
});
