import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('live preview edit/display metrics', () => {
  it('keeps active plain text lines on the rendered document font metrics', () => {
    const rule = cssRule(
      '.live-preview-editor .cm-active-source-line:not(.cm-live-heading):not(.cm-live-list-line):not(.cm-live-codeblock-line)'
    );

    expect(rule).toContain('font-family: inherit');
    expect(rule).toContain('font-size: inherit');
    expect(rule).toContain('font-weight: inherit');
  });

  it('does not show both the rendered list bullet and source list marker while editing', () => {
    const rule = cssRule('.live-preview-editor .cm-live-list-line.cm-active-source-line::before');

    expect(rule).toContain('content: none');
  });

  it('styles visible Markdown syntax without taking over line metrics', () => {
    const sourceSyntax = cssRule('.live-preview-editor .cm-markdown-source-syntax');
    const headingSyntax = cssRule('.live-preview-editor .cm-markdown-heading-syntax');

    expect(sourceSyntax).not.toContain('font-family');
    expect(sourceSyntax).not.toContain('line-height');
    expect(headingSyntax).toContain('font-size: 0.58em');
  });
});

function cssRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{(?<body>[^}]+)\\}`).exec(styles);
  if (!match?.groups?.body) throw new Error(`Missing CSS rule for ${selector}`);
  return match.groups.body.replace(/\s+/g, ' ').trim();
}
