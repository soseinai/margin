export function leadingMarkdownIndent(text: string) {
  return markdownIndentWidth(/^\s*/.exec(text)?.[0] ?? '');
}

export function leadingMarkdownWhitespaceLength(text: string) {
  return /^\s*/.exec(text)?.[0].length ?? 0;
}

export function sourceMarkdownIndentLengthForWidth(text: string, width: number) {
  if (width <= 0) return 0;

  let currentWidth = 0;
  let length = 0;

  for (const character of text) {
    if (character !== ' ' && character !== '\t') break;

    currentWidth += character === '\t' ? 4 : 1;
    length += character.length;

    if (currentWidth >= width) break;
  }

  return length;
}

export function markdownIndentWidth(value: string) {
  let width = 0;

  for (const character of value) {
    width += character === '\t' ? 4 : 1;
  }

  return width;
}
