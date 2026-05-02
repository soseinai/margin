import { describe, expect, it } from 'vitest';
import {
  markdownAttributeTokens,
  markdownImageFromParts,
  markdownImageOnly,
  markdownImageSizeCss,
  markdownImageWithSize
} from './markdown-images';

describe('Markdown image helpers', () => {
  it('parses images with titles and size attributes', () => {
    const image = markdownImageOnly('![Alt text](<images/shot one.png> "Shot"){width="50%" height=120 loading=lazy}');

    expect(image).toMatchObject({
      alt: 'Alt text',
      src: 'images/shot one.png',
      title: 'Shot',
      raw: '![Alt text](<images/shot one.png> "Shot"){width="50%" height=120 loading=lazy}'
    });
    expect(markdownImageSizeCss(image?.attrs.width ?? null)).toBe('50%');
    expect(markdownImageSizeCss(image?.attrs.height ?? null)).toBe('120px');
    expect(image?.attrs.other).toEqual(['loading=lazy']);
  });

  it('tokenizes quoted attributes without splitting on internal spaces', () => {
    expect(markdownAttributeTokens('width="320 px" height=120 data-label="Product shot"')).toEqual([
      'width="320 px"',
      'height=120',
      'data-label="Product shot"'
    ]);
  });

  it('serializes resized images while preserving non-size attributes', () => {
    const image = markdownImageFromParts(
      'Product [shot]',
      '<assets/product shot.png> "Big Shot"',
      'loading=lazy width=320 height=120'
    );

    expect(image).not.toBeNull();
    expect(markdownImageWithSize(image!, 12, 2500)).toBe(
      '![Product \\[shot\\]](<assets/product shot.png> "Big Shot"){loading=lazy width=48 height=2400}'
    );
  });
});
