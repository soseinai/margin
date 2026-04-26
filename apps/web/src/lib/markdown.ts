export type MarkdownBlock =
  | { kind: 'heading'; level: number; text: string; line: number; raw: string }
  | { kind: 'paragraph'; text: string; line: number; raw: string }
  | { kind: 'list'; items: Array<{ text: string; line: number; raw: string }>; line: number; raw: string };

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.split('\n');
  let paragraph: string[] = [];
  let paragraphRaw: string[] = [];
  let paragraphLine = 1;
  let list: Array<{ text: string; line: number; raw: string }> = [];
  let listLine = 1;

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({
        kind: 'paragraph',
        text: paragraph.join(' '),
        line: paragraphLine,
        raw: paragraphRaw.join('\n')
      });
      paragraph = [];
      paragraphRaw = [];
    }
  }

  function flushList() {
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list, line: listLine, raw: list.map((item) => item.raw).join('\n') });
      list = [];
    }
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const item = /^-\s+(.+)$/.exec(line);

    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2], line: lineNumber, raw: line });
      return;
    }

    if (item) {
      flushParagraph();
      if (list.length === 0) listLine = lineNumber;
      list.push({ text: item[1], line: lineNumber, raw: line });
      return;
    }

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      return;
    }

    flushList();
    if (paragraph.length === 0) paragraphLine = lineNumber;
    paragraph.push(line.trim());
    paragraphRaw.push(line);
  });

  flushParagraph();
  flushList();
  return blocks;
}
