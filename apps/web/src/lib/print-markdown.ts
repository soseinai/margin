type PrintMarkdownOptions = {
  resolveImageSrc?: (src: string) => string;
};

type ListItem = {
  checked: boolean | null;
  text: string;
};

type TableBlock = {
  headers: string[];
  alignments: Array<'left' | 'center' | 'right' | null>;
  rows: string[][];
};

const tokenPrefix = '\u0000MPT';
const tokenSuffix = '\u0000';

export function renderPrintMarkdown(markdown: string, options: PrintMarkdownOptions = {}) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = openingFence(line);
    if (fence) {
      const code: string[] = [];
      index += 1;

      while (index < lines.length && !closingFence(lines[index], fence)) {
        code.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) index += 1;
      html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2], options)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^[ \t]{0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/.test(line)) {
      html.push('<hr>');
      index += 1;
      continue;
    }

    const table = tableAt(lines, index);
    if (table) {
      html.push(renderTable(table.table, options));
      index = table.nextIndex;
      continue;
    }

    if (/^[ \t]{0,3}>/.test(line)) {
      const quoteLines: string[] = [];

      while (index < lines.length && (/^[ \t]{0,3}>/.test(lines[index]) || lines[index].trim() === '')) {
        quoteLines.push(lines[index].replace(/^[ \t]{0,3}>[ \t]?/, ''));
        index += 1;
      }

      html.push(`<blockquote>${renderPrintMarkdown(quoteLines.join('\n'), options)}</blockquote>`);
      continue;
    }

    const list = listAt(lines, index);
    if (list) {
      html.push(renderList(list.ordered, list.items, options));
      index = list.nextIndex;
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;

    while (index < lines.length && lines[index].trim() !== '' && !startsBlock(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }

    html.push(`<p>${renderInline(paragraph.join(' '), options)}</p>`);
  }

  return html.join('\n');
}

function startsBlock(lines: string[], index: number) {
  const line = lines[index];

  return Boolean(
    openingFence(line) ||
      /^(#{1,6})[ \t]+/.test(line) ||
      /^[ \t]{0,3}>/.test(line) ||
      /^[ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]+/.test(line) ||
      /^[ \t]{0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/.test(line) ||
      tableAt(lines, index)
  );
}

function openingFence(line: string) {
  const match = /^[ \t]*(`{3,}|~{3,})/.exec(line);

  if (!match) return null;

  return { marker: match[1][0], length: match[1].length };
}

function closingFence(line: string, fence: { marker: string; length: number }) {
  const match = new RegExp(`^[ \\t]*\\${fence.marker}{${fence.length},}[ \\t]*$`).exec(line);

  return Boolean(match);
}

function listAt(lines: string[], startIndex: number) {
  const first = listItemLine(lines[startIndex]);
  if (!first) return null;

  const ordered = first.ordered;
  const items: ListItem[] = [{ checked: first.checked, text: first.text }];
  let index = startIndex + 1;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      break;
    }

    const item = listItemLine(line);
    if (!item || item.ordered !== ordered) break;

    items.push({ checked: item.checked, text: item.text });
    index += 1;
  }

  return { items, nextIndex: index, ordered };
}

function listItemLine(line: string) {
  const match = /^[ \t]{0,3}((?:[-+*])|(?:\d+[.)]))[ \t]+(?:(\[[ xX]\])[ \t]+)?(.*)$/.exec(line);

  if (!match) return null;

  return {
    checked: match[2] ? /x/i.test(match[2]) : null,
    ordered: /\d/.test(match[1][0]),
    text: match[3]
  };
}

function renderList(ordered: boolean, items: ListItem[], options: PrintMarkdownOptions) {
  const tag = ordered ? 'ol' : 'ul';
  const itemHtml = items
    .map((item) => {
      const marker =
        item.checked === null
          ? ''
          : `<span class="print-task-marker${item.checked ? ' checked' : ''}" aria-hidden="true"></span>`;

      return `<li>${marker}${renderInline(item.text, options)}</li>`;
    })
    .join('');

  return `<${tag}>${itemHtml}</${tag}>`;
}

function tableAt(lines: string[], startIndex: number) {
  if (startIndex + 1 >= lines.length) return null;

  const header = tableCells(lines[startIndex]);
  const divider = tableDivider(lines[startIndex + 1]);

  if (!header || !divider || header.length !== divider.length) return null;

  const rows: string[][] = [];
  let index = startIndex + 2;

  while (index < lines.length) {
    const cells = tableCells(lines[index]);
    if (!cells) break;

    rows.push(padCells(cells, header.length));
    index += 1;
  }

  return {
    nextIndex: index,
    table: {
      headers: header,
      alignments: divider,
      rows
    }
  };
}

function tableCells(line: string) {
  if (!line.includes('|')) return null;

  let source = line.trim();
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|')) source = source.slice(0, -1);

  const cells = source.split('|').map((cell) => cell.trim());

  return cells.length > 1 ? cells : null;
}

function tableDivider(line: string): Array<'left' | 'center' | 'right' | null> | null {
  const cells = tableCells(line);
  if (!cells) return null;

  const alignments: Array<'left' | 'center' | 'right' | null> = [];

  for (const cell of cells) {
    if (!/^:?-{3,}:?$/.test(cell)) return null;

    alignments.push(cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : null);
  }

  return alignments;
}

function padCells(cells: string[], count: number) {
  return Array.from({ length: count }, (_, index) => cells[index] ?? '');
}

function renderTable(table: TableBlock, options: PrintMarkdownOptions) {
  const header = table.headers
    .map((cell, index) => `<th${alignmentAttribute(table.alignments[index])}>${renderInline(cell, options)}</th>`)
    .join('');
  const rows = table.rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, index) => `<td${alignmentAttribute(table.alignments[index])}>${renderInline(cell, options)}</td>`)
          .join('')}</tr>`
    )
    .join('');

  return `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
}

function alignmentAttribute(alignment: 'left' | 'center' | 'right' | null | undefined) {
  return alignment ? ` style="text-align: ${alignment};"` : '';
}

function renderInline(markdown: string, options: PrintMarkdownOptions) {
  const tokens: string[] = [];

  let source = markdown.replace(/`([^`\n]+)`/g, (_match, code: string) =>
    storeToken(tokens, `<code>${escapeHtml(code)}</code>`)
  );

  source = source.replace(markdownImagePattern(), (match: string, alt: string, destination: string, attrs: string) => {
    const image = markdownImageFromParts(alt, destination, attrs ?? '');
    if (!image) return match;

    const resolvedSrc = options.resolveImageSrc?.(image.src) ?? image.src;
    if (!safeResourceUrl(resolvedSrc)) return escapeHtml(image.alt);

    const style = imageStyle(image.attrs);
    const title = image.title ? ` title="${escapeAttribute(image.title)}"` : '';

    return storeToken(
      tokens,
      `<img src="${escapeAttribute(resolvedSrc)}" alt="${escapeAttribute(image.alt)}"${title}${style}>`
    );
  });

  source = source.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (match: string, label: string, destination: string) => {
    const { src, title } = splitMarkdownDestination(destination.trim());
    if (!safeResourceUrl(src)) return label;

    const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : '';

    return storeToken(
      tokens,
      `<a href="${escapeAttribute(src)}"${titleAttribute}>${escapeHtml(label)}</a>`
    );
  });

  let html = escapeHtml(source)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>');

  tokens.forEach((token, index) => {
    html = html.replace(tokenKey(index), token);
  });

  return html;
}

function storeToken(tokens: string[], html: string) {
  const key = tokenKey(tokens.length);
  tokens.push(html);

  return key;
}

function tokenKey(index: number) {
  return `${tokenPrefix}${index}${tokenSuffix}`;
}

function markdownImagePattern() {
  return /!\[([^\]\n]*)\]\(((?:<[^>\n]+>(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?)|(?:[^)\n]+))\)(?:\{([^\n}]*)\})?/g;
}

function markdownImageFromParts(alt: string, destination: string, attrs: string) {
  const { src, title } = splitMarkdownDestination(destination.trim());

  if (!src) return null;

  return {
    alt,
    attrs: parseImageAttributes(attrs),
    src,
    title
  };
}

function splitMarkdownDestination(destination: string) {
  if (destination.startsWith('<')) {
    const closeIndex = destination.indexOf('>');

    if (closeIndex > 0) {
      return {
        src: destination.slice(1, closeIndex).trim(),
        title: unquoteMarkdownTitle(destination.slice(closeIndex + 1).trim())
      };
    }
  }

  const title = (/\s+(["'])(.*?)\1\s*$/).exec(destination);

  if (title) {
    return {
      src: destination.slice(0, title.index).trim(),
      title: title[2]
    };
  }

  return { src: destination.trim(), title: '' };
}

function parseImageAttributes(value: string) {
  const attrs: { width?: string; height?: string } = {};

  for (const token of attributeTokens(value.trim().replace(/^:/, '').trim())) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)=(.+)$/.exec(token);
    if (!match) continue;

    const key = match[1].toLowerCase();
    const size = imageSizeValue(match[2]);

    if (size && (key === 'width' || key === 'height')) attrs[key] = size;
  }

  return attrs;
}

function attributeTokens(value: string) {
  const tokens: string[] = [];
  let quote = '';
  let token = '';

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

function imageSizeValue(value: string) {
  const raw = unquoteMarkdownTitle(value);
  const match = /^(\d+(?:\.\d+)?)([A-Za-z%]*)$/.exec(raw);

  if (!match) return '';

  return `${Number(match[1])}${match[2] || 'px'}`;
}

function imageStyle(attrs: { width?: string; height?: string }) {
  const declarations: string[] = [];

  if (attrs.width) declarations.push(`width: ${attrs.width}`);
  if (attrs.height) declarations.push(`height: ${attrs.height}`);

  return declarations.length > 0 ? ` style="${escapeAttribute(declarations.join('; '))}"` : '';
}

function safeResourceUrl(url: string) {
  return !/^\s*javascript:/i.test(url);
}

function unquoteMarkdownTitle(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
