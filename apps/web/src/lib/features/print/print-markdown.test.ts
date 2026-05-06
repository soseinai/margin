import { describe, expect, it } from 'vitest';
import { renderPrintMarkdown } from './print-markdown';

describe('renderPrintMarkdown', () => {
  it('renders common document blocks for print', () => {
    const html = renderPrintMarkdown([
      '# Brief',
      '',
      'A **strong** point with `code`.',
      '',
      '- [x] Done',
      '- [ ] Next',
      '',
      '| Owner | Status |',
      '| --- | ---: |',
      '| Ada | Ready |',
      '',
      '```ts',
      'const value = "<safe>";',
      '```'
    ].join('\n'));

    expect(html).toContain('<h1>Brief</h1>');
    expect(html).toContain('<strong>strong</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul><li><span class="print-task-marker checked"');
    expect(html).toContain('<table>');
    expect(html).toContain('<td style="text-align: right;">Ready</td>');
    expect(html).toContain('const value = &quot;&lt;safe&gt;&quot;');
  });

  it('resolves images and escapes unsafe content', () => {
    const html = renderPrintMarkdown('![Alt <tag>](images/shot.png "Shot"){width=320 height=120}', {
      resolveImageSrc: (src) => `asset://${src}`
    });

    expect(html).toContain('src="asset://images/shot.png"');
    expect(html).toContain('alt="Alt &lt;tag&gt;"');
    expect(html).toContain('title="Shot"');
    expect(html).toContain('style="width: 320px; height: 120px"');
  });

  it('does not emit scriptable links or raw HTML', () => {
    const html = renderPrintMarkdown('<script>alert(1)</script> [bad](javascript:alert(1))');

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
  });

  it('renders mermaid fences as printable chart containers with escaped fallback source', () => {
    const html = renderPrintMarkdown(['```mermaid', 'graph TD', 'A["<safe>"] --> B', '```'].join('\n'));

    expect(html).toContain('class="print-mermaid-chart"');
    expect(html).toContain('data-mermaid-source="graph TD');
    expect(html).toContain('A[&quot;&lt;safe&gt;&quot;] --&gt; B');
    expect(html).toContain('<pre><code>graph TD');
    expect(html).toContain('&lt;safe&gt;');
  });
});
