import { describe, expect, it } from 'vitest';
import {
  compactLocalPath,
  directoryPath,
  fileNameFromPath,
  imageAltText,
  isImagePathLike,
  isMarkdownPathLike,
  joinLocalPath,
  markdownImageDestination,
  markdownImageDestinationForPath,
  markdownImageReference,
  normalizePathSeparators,
  normalizeRecentDocuments,
  relativeLocalPath
} from './local-documents';

describe('local document helpers', () => {
  it('normalizes recent documents by trimming, deduping, filling titles, and applying a limit', () => {
    expect(
      normalizeRecentDocuments(
        [
          { path: ' /Users/aish/notes/plan.md ', title: ' Plan ', openedAt: 10 },
          { path: '/Users/aish/notes/plan.md', title: 'Duplicate', openedAt: 20 },
          { path: '/Users/aish/notes/todo.markdown', title: '', openedAt: Number.NaN },
          { path: '', title: 'Ignored', openedAt: 30 },
          { path: '/Users/aish/notes/extra.txt', title: 'Extra', openedAt: 40 }
        ],
        2
      )
    ).toEqual([
      { path: '/Users/aish/notes/plan.md', title: 'Plan', openedAt: 10 },
      { path: '/Users/aish/notes/todo.markdown', title: 'todo.markdown', openedAt: 0 }
    ]);
  });

  it('classifies Markdown and image paths case-insensitively', () => {
    expect(isMarkdownPathLike('/tmp/brief.MD')).toBe(true);
    expect(isMarkdownPathLike('/tmp/brief.pdf')).toBe(false);
    expect(isImagePathLike('/tmp/screenshot.PNG?cache=1')).toBe(true);
    expect(isImagePathLike('/tmp/screenshot.md')).toBe(false);
  });

  it('normalizes local paths across platforms', () => {
    expect(fileNameFromPath('C:\\Users\\Ada\\Brief.md')).toBe('Brief.md');
    expect(normalizePathSeparators('C:%5CUsers%5CAda%5CBrief.md')).toBe('C:/Users/Ada/Brief.md');
    expect(directoryPath('/Users/aish/project/brief.md')).toBe('/Users/aish/project');
    expect(compactLocalPath('/Users/aish/project/brief.md')).toBe('~/project/brief.md');
  });

  it('joins and relativizes local paths without escaping the root', () => {
    expect(joinLocalPath('/Users/aish/project/docs', '../assets/image.png')).toBe('/Users/aish/project/assets/image.png');
    expect(joinLocalPath('C:/Users/Ada/project/docs', '../assets/image.png')).toBe(
      'C:/Users/Ada/project/assets/image.png'
    );
    expect(relativeLocalPath('/Users/aish/project/docs', '/Users/aish/project/assets/image.png')).toBe(
      '../assets/image.png'
    );
    expect(relativeLocalPath('C:/Users/Ada/project/docs', '/Users/aish/project/assets/image.png')).toBe('');
  });

  it('builds Markdown image references from local and remote sources', () => {
    expect(imageAltText('/Users/aish/project/assets/product-shot.final.png')).toBe('product shot.final');
    expect(markdownImageDestination('assets/product shot.png')).toBe('<assets/product shot.png>');
    expect(markdownImageDestinationForPath('/Users/aish/project/assets/shot.png', '/Users/aish/project/docs/brief.md')).toBe(
      '../assets/shot.png'
    );
    expect(markdownImageReference('/Users/aish/project/assets/shot.png', 'Product [shot]', '/Users/aish/project/docs/brief.md')).toBe(
      '![Product \\[shot\\]](../assets/shot.png)'
    );
    expect(markdownImageReference('https://example.com/shot.png', 'Remote')).toBe(
      '![Remote](https://example.com/shot.png)'
    );
  });
});
