import { describe, expect, it } from 'vitest';
import {
  markdownTableAlignment,
  markdownTableAlignments,
  markdownTableCells,
  padMarkdownTableAlignments,
  padMarkdownTableCells
} from './markdown-tables';

describe('Markdown table helpers', () => {
  it('parses pipe-delimited cells and escaped pipes', () => {
    expect(markdownTableCells('| Name | Value |')).toEqual(['Name', 'Value']);
    expect(markdownTableCells('Name | Value')).toEqual(['Name', 'Value']);
    expect(markdownTableCells(String.raw`Name | escaped \| value | done`)).toEqual([
      'Name',
      'escaped | value',
      'done'
    ]);
    expect(markdownTableCells('No table here')).toBeNull();
  });

  it('detects delimiter alignment cells', () => {
    expect(markdownTableAlignment('---')).toBeNull();
    expect(markdownTableAlignment(':---')).toBe('left');
    expect(markdownTableAlignment('---:')).toBe('right');
    expect(markdownTableAlignment(':---:')).toBe('center');
    expect(markdownTableAlignments(['---', ':---:', '---:'])).toEqual([null, 'center', 'right']);
    expect(markdownTableAlignments(['---', 'nope'])).toBeNull();
  });

  it('pads cells and alignments to stable column counts', () => {
    expect(padMarkdownTableCells(['A'], 3)).toEqual(['A', '', '']);
    expect(padMarkdownTableAlignments(['left'], 3)).toEqual(['left', null, null]);
  });
});
