import { describe, expect, it } from 'vitest';
import { appendMarginCommentBlock, splitMarginCommentBlock, type MarginCommentBlock } from './embedded-margin';

const block: MarginCommentBlock = {
  schema: 'margin.markdown-comments',
  version: 1,
  review_id: 'local-review:test',
  reviewer: 'Aisha Fenton',
  comments: [
    {
      id: 'comment-1',
      author: 'Aisha Fenton',
      body: 'Tighten this sentence.',
      resolved: false,
      created_at: '2026-04-26T00:00:00.000Z',
      anchor: {
        start_line: 3,
        end_line: 3,
        quote: 'Original sentence',
        prefix: '',
        suffix: '',
        heading_path: [],
        content_hash: 'local-3-3-17'
      }
    }
  ],
  suggestions: [
    {
      id: 'suggestion-1',
      author: 'Aisha Fenton',
      original: 'Original sentence',
      replacement: 'Sharper sentence',
      applied: true,
      resolved: false,
      created_at: '2026-04-26T00:00:00.000Z',
      anchor: {
        start_line: 3,
        end_line: 3,
        quote: 'Original sentence',
        prefix: '',
        suffix: '',
        heading_path: [],
        content_hash: 'local-3-3-17'
      }
    }
  ],
  updated_at: '2026-04-26T00:00:00.000Z'
};

describe('embedded Margin comments', () => {
  it('round-trips a Markdown body with a bottom comment block', () => {
    const markdown = appendMarginCommentBlock('# Brief\n\nOriginal sentence\n', block);
    const split = splitMarginCommentBlock(markdown);

    expect(split.markdown).toBe('# Brief\n\nOriginal sentence');
    expect(split.comments?.comments).toHaveLength(1);
    expect(split.comments?.comments[0].body).toBe('Tighten this sentence.');
    expect(split.comments?.suggestions[0].replacement).toBe('Sharper sentence');
  });

  it('does not append an empty metadata block', () => {
    const markdown = appendMarginCommentBlock('# Brief\n', { ...block, comments: [], suggestions: [] });

    expect(markdown).toBe('# Brief\n');
    expect(markdown).not.toContain('margin:comments');
  });

  it('replaces an existing bottom block instead of duplicating it', () => {
    const first = appendMarginCommentBlock('# Brief', block);
    const second = appendMarginCommentBlock(first, {
      ...block,
      comments: [{ ...block.comments[0], id: 'comment-2', body: 'Different note.' }]
    });

    expect(second.match(/margin:comments/g)).toHaveLength(1);
    expect(splitMarginCommentBlock(second).comments?.comments[0].body).toBe('Different note.');
  });

  it('keeps resolved comments and rejected suggestions in the embedded block', () => {
    const markdown = appendMarginCommentBlock('# Brief', {
      ...block,
      comments: [{ ...block.comments[0], resolved: true }],
      suggestions: [{ ...block.suggestions[0], applied: false, resolved: true }]
    });
    const split = splitMarginCommentBlock(markdown);

    expect(split.comments?.comments[0].resolved).toBe(true);
    expect(split.comments?.suggestions[0].applied).toBe(false);
    expect(split.comments?.suggestions[0].resolved).toBe(true);
  });

  it('ignores malformed metadata without losing the document body', () => {
    const markdown = '# Brief\n\n<!-- margin:comments\nnot json\n-->\n';
    const split = splitMarginCommentBlock(markdown);

    expect(split.markdown).toBe('# Brief');
    expect(split.comments).toBeNull();
  });
});
