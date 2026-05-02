import { escapeMarkdownImageAlt, markdownImageDestination } from './local-documents';

export type MarkdownImage = {
  alt: string;
  src: string;
  title: string;
  raw: string;
  attrs: MarkdownImageAttributes;
};

export type MarkdownImageAttributes = {
  width: MarkdownImageSize | null;
  height: MarkdownImageSize | null;
  other: string[];
};

export type MarkdownImageSize = {
  value: number;
  unit: string;
  raw: string;
};

export function markdownImagePattern() {
  return /!\[([^\]\n]*)\]\(((?:<[^>\n]+>(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?)|(?:[^)\n]+))\)(?:\{([^\n}]*)\})?/g;
}

export function markdownImageOnly(text: string): MarkdownImage | null {
  const trimmed = text.trim();
  const match = markdownImagePattern().exec(trimmed);

  if (!match || match[0] !== trimmed) return null;

  return markdownImageFromMatch(match);
}

export function markdownImageFromMatch(match: RegExpMatchArray): MarkdownImage | null {
  return markdownImageFromParts(match[1] ?? '', match[2]?.trim() ?? '', match[3] ?? '', match[0] ?? '');
}

export function markdownImageFromParts(
  alt: string,
  destination: string,
  attrs = '',
  raw = ''
): MarkdownImage | null {
  const { src, title } = splitMarkdownDestination(destination.trim());

  if (!src) return null;

  return {
    alt,
    src,
    title,
    raw,
    attrs: parseMarkdownImageAttributes(attrs)
  };
}

export function parseMarkdownImageAttributes(value: string): MarkdownImageAttributes {
  const attrs: MarkdownImageAttributes = { width: null, height: null, other: [] };
  const source = value.trim().replace(/^:/, '').trim();

  for (const token of markdownAttributeTokens(source)) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)=(.+)$/.exec(token);

    if (!match) {
      attrs.other.push(token);
      continue;
    }

    const key = match[1].toLowerCase();
    const size = parseMarkdownImageSize(match[2]);

    if (key === 'width' && size) {
      attrs.width = size;
    } else if (key === 'height' && size) {
      attrs.height = size;
    } else {
      attrs.other.push(token);
    }
  }

  return attrs;
}

export function markdownAttributeTokens(value: string) {
  const tokens: string[] = [];
  let token = '';
  let quote = '';

  for (const character of value) {
    if (quote) {
      token += character;
      if (character === quote) quote = '';
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      token += character;
      continue;
    }

    if (/\s/.test(character)) {
      if (token) {
        tokens.push(token);
        token = '';
      }

      continue;
    }

    token += character;
  }

  if (token) tokens.push(token);

  return tokens;
}

export function parseMarkdownImageSize(value: string): MarkdownImageSize | null {
  const raw = unquoteMarkdownTitle(value);
  const match = /^(\d+(?:\.\d+)?)([A-Za-z%]*)$/.exec(raw);

  if (!match) return null;

  return {
    value: Number(match[1]),
    unit: match[2],
    raw
  };
}

export function splitMarkdownDestination(destination: string) {
  if (destination.startsWith('<')) {
    const closeIndex = destination.indexOf('>');

    if (closeIndex > 0) {
      return {
        src: destination.slice(1, closeIndex).trim(),
        title: unquoteMarkdownTitle(destination.slice(closeIndex + 1).trim())
      };
    }
  }

  const title = /\s+(["'])(.*?)\1\s*$/.exec(destination);

  if (title) {
    return {
      src: destination.slice(0, title.index).trim(),
      title: title[2]
    };
  }

  return { src: destination.trim(), title: '' };
}

export function unquoteMarkdownTitle(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function markdownImageSizeCss(size: MarkdownImageSize | null) {
  if (!size) return '';

  return `${size.value}${size.unit || 'px'}`;
}

export function clampImageResize(value: number) {
  return Math.max(48, Math.min(2400, Math.round(value)));
}

export function markdownImageWithSize(image: MarkdownImage, width: number, height: number) {
  const attrs = [
    ...image.attrs.other,
    `width=${clampImageResize(width)}`,
    `height=${clampImageResize(height)}`
  ];

  return `![${escapeMarkdownImageAlt(image.alt)}](${markdownImageDestinationWithTitle(image)}){${attrs.join(' ')}}`;
}

export function markdownImageDestinationWithTitle(image: MarkdownImage) {
  const destination = markdownImageDestination(image.src);

  if (!image.title) return destination;

  return `${destination} "${escapeMarkdownTitle(image.title)}"`;
}

export function escapeMarkdownTitle(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
