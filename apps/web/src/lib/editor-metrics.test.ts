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
    const rule = cssRule('.live-preview-editor .cm-markdown-list-source-prefix');

    expect(rule).toContain('color: transparent');
    expect(rule).toContain('font-size: 0');
  });

  it('keeps rendered task checkboxes out of generic button sizing', () => {
    const rule = cssRule('button.task-checkbox-widget');

    expect(rule).toContain('height: 15px');
    expect(rule).toContain('min-height: 15px');
    expect(rule).toContain('min-width: 15px');
    expect(rule).toContain('padding: 0');
    expect(rule).toContain('position: absolute');
    expect(rule).toContain('left: var(--list-indent)');
  });

  it('renders nested list indentation from a CSS variable', () => {
    const listRule = cssRule('.live-preview-editor .cm-live-list-line');
    const markerRule = cssRule('.live-preview-editor .cm-live-list-line::before');
    const orderedLineRule = cssRule('.live-preview-editor .cm-live-list-ordered');
    const orderedRule = cssRule('.live-preview-editor .cm-live-list-ordered::before');
    const continuationRule = cssRule('.live-preview-editor .cm-live-list-continuation-line');

    expect(listRule).toContain('--list-indent: 0px');
    expect(listRule).toContain('--list-marker-offset: 12px');
    expect(listRule).toContain('padding-left: calc(var(--list-indent) + var(--list-marker-offset))');
    expect(markerRule).toContain('left: var(--list-indent)');
    expect(orderedLineRule).toContain('--list-marker-offset: 22px');
    expect(orderedRule).toContain('content: attr(data-list-marker)');
    expect(orderedRule).toContain('text-align: left');
    expect(orderedRule).toContain('width: var(--list-marker-offset)');
    expect(continuationRule).toContain('padding-left: var(--list-continuation-indent)');
  });

  it('keeps active list lines on the same visual layout as read mode', () => {
    const rule = cssRule('.live-preview-editor .cm-live-list-line.cm-active-source-line');
    const subtreeRule = cssRule('.live-preview-editor .cm-active-source-line.cm-active-list-subtree-line:not(.cm-live-list-line)');

    expect(rule).toContain('margin-left: 0');
    expect(rule).toContain('padding-left: calc(var(--list-indent) + var(--list-marker-offset))');
    expect(subtreeRule).toContain('padding-left: calc(var(--active-list-base-indent) + 12px)');
  });

  it('shows list collapse controls on hover or while editing a list tree and hides collapsed subtree lines', () => {
    const toggleRule = cssRule('button.markdown-list-collapse-toggle');
    const chevronRule = cssRule('button.markdown-list-collapse-toggle svg');
    const collapsedChevronRule = cssRule('button.markdown-list-collapse-toggle.is-collapsed svg');
    const visibleRule = cssRule('.live-preview-editor .cm-live-list-parent:hover button.markdown-list-collapse-toggle,\n.live-preview-editor .cm-live-list-controls-visible button.markdown-list-collapse-toggle,\nbutton.markdown-list-collapse-toggle:focus-visible');
    const hiddenRule = cssRule('.live-preview-editor .cm-collapsed-list-hidden-line');

    expect(toggleRule).toContain('opacity: 0');
    expect(toggleRule).toContain('height: 22px');
    expect(toggleRule).toContain('left: calc(var(--list-indent) - 26px)');
    expect(toggleRule).toContain('width: 22px');
    expect(toggleRule).toContain('top: 0.84em');
    expect(chevronRule).toContain('height: 16px');
    expect(chevronRule).toContain('stroke-linecap: round');
    expect(chevronRule).toContain('stroke-linejoin: round');
    expect(chevronRule).toContain('stroke-width: 1.8');
    expect(chevronRule).toContain('width: 16px');
    expect(collapsedChevronRule).toContain('transform: rotate(-90deg)');
    expect(visibleRule).toContain('opacity: 1');
    expect(hiddenRule).toContain('display: none');
  });

  it('styles visible Markdown syntax without taking over line metrics', () => {
    const sourceSyntax = cssRule('.live-preview-editor .cm-markdown-source-syntax');
    const headingSyntax = cssRule('.live-preview-editor .cm-markdown-heading-syntax');

    expect(sourceSyntax).not.toContain('font-family');
    expect(sourceSyntax).not.toContain('line-height');
    expect(headingSyntax).toContain('font-size: 0.58em');
  });

  it('shows four-space indentation guides while editing nested source', () => {
    const activeSourceRule = cssRule('.live-preview-editor .cm-active-source-line');
    const guideRule = cssRule('.live-preview-editor .cm-source-indent-guide');
    const hiddenBaseRule = cssRule('.live-preview-editor .cm-active-list-base-indent');
    const subtreeRule = cssRule('.live-preview-editor .cm-active-source-line.cm-active-list-subtree-line:not(.cm-live-list-line)');

    expect(activeSourceRule).toContain('tab-size: 4');
    expect(guideRule).toContain('border-left: 1px solid');
    expect(guideRule).toContain('width: 0');
    expect(hiddenBaseRule).toContain('font-size: 0');
    expect(subtreeRule).toContain('--active-list-base-indent: 0px');
    expect(subtreeRule).toContain('padding-left: calc(var(--active-list-base-indent) + 12px)');
  });

  it('can indent code blocks under nested list content', () => {
    const codeLineRule = cssRule('.live-preview-editor .cm-live-codeblock-line');
    const fenceLineRule = cssRule('.live-preview-editor .cm-live-code-fence-hidden-line');

    expect(codeLineRule).toContain('--codeblock-indent: 0px');
    expect(codeLineRule).toContain('margin-left: calc(var(--codeblock-indent) - 12px)');
    expect(fenceLineRule).toContain('margin-left: calc(var(--codeblock-indent) - 12px)');
  });
});

function cssRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{(?<body>[^}]+)\\}`).exec(styles);
  if (!match?.groups?.body) throw new Error(`Missing CSS rule for ${selector}`);
  return match.groups.body.replace(/\s+/g, ' ').trim();
}
