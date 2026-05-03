import { expect, test } from '@playwright/test';
import {
  activeEditorLineText,
  editor,
  editorMarkdown,
  openCleanApp,
  platformModifier,
  replaceEditorMarkdown,
  saveViaDownload,
  setEditorSelection
} from './helpers';
import { readFile } from 'node:fs/promises';

test('task checkbox toggles the saved Markdown source', async ({ page }) => {
  await openCleanApp(page);
  await replaceEditorMarkdown(page, '- [ ] Ship the test plan');

  await page.getByLabel('Mark task complete').click();
  await expect(page.getByLabel('Mark task incomplete')).toBeVisible();

  const download = await saveViaDownload(page);
  const savedMarkdown = await readFile((await download.path()) as string, 'utf8');
  expect(savedMarkdown).toContain('- [x] Ship the test plan');
});

test('smart list enter continues markers and backspace exits an empty marker', async ({ page }) => {
  await openCleanApp(page);
  await replaceEditorMarkdown(page, '- First item');

  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Second item');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText('Plain paragraph');

  const download = await saveViaDownload(page);
  const savedMarkdown = await readFile((await download.path()) as string, 'utf8');
  expect(savedMarkdown).toContain(['- First item', '- Second item', 'Plain paragraph'].join('\n'));
});

test('single return exits empty list and blockquote lines', async ({ page }) => {
  await openCleanApp(page);

  for (const markdown of ['- ', '- [ ] ', '> ']) {
    await replaceEditorMarkdown(page, markdown);
    await setEditorSelection(page, markdown.length, markdown.length);
    await page.keyboard.press('Enter');
    await expect.poll(() => editorMarkdown(page)).toBe('');
  }
});

test('empty nested list enter outdents one level before exiting the list', async ({ page }) => {
  await openCleanApp(page);
  const markdown = ['- Parent', '  - Child', '    - '].join('\n');

  await replaceEditorMarkdown(page, markdown);
  await setEditorSelection(page, markdown.length, markdown.length);
  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe(['- Parent', '  - Child', '  - '].join('\n'));

  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe(['- Parent', '  - Child', '- '].join('\n'));

  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe(['- Parent', '  - Child', ''].join('\n'));
});

test('nested list enter creates an empty child marker before outdenting it', async ({ page }) => {
  await openCleanApp(page);
  const markdown = ['- Parent', '  - Child'].join('\n');

  await replaceEditorMarkdown(page, markdown);
  await setEditorSelection(page, markdown.length, markdown.length);
  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe(['- Parent', '  - Child', '  - '].join('\n'));

  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe(['- Parent', '  - Child', '- '].join('\n'));
  await expect.poll(() => activeEditorLineText(page)).toBe('- ');
  await expect(page.locator('.cm-active-source-line.cm-live-list-line')).toHaveAttribute('style', /--list-indent: 0px/);

  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe(['- Parent', '  - Child', ''].join('\n'));
  await expect.poll(() => activeEditorLineText(page)).toBe('');
  await expect(page.locator('.cm-active-source-line.cm-live-list-line')).toHaveCount(0);
});

test('indented blank line after a nested list item outdents in place', async ({ page }) => {
  await openCleanApp(page);
  const markdown = ['- Parent', '  - Child', '  '].join('\n');

  await replaceEditorMarkdown(page, markdown);
  await setEditorSelection(page, markdown.length, markdown.length);
  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe(['- Parent', '  - Child', ''].join('\n'));
  await expect.poll(() => activeEditorLineText(page)).toBe('');
  await expect(page.locator('.cm-active-source-line.cm-live-list-line')).toHaveCount(0);
});

test('orphaned indented empty list marker outdents before exiting', async ({ page }) => {
  await openCleanApp(page);
  const markdown = '  - ';

  await replaceEditorMarkdown(page, markdown);
  await setEditorSelection(page, markdown.length, markdown.length);
  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe('- ');
  await expect.poll(() => activeEditorLineText(page)).toBe('- ');
  await expect(page.locator('.cm-active-source-line.cm-live-list-line')).toHaveAttribute('style', /--list-indent: 0px/);

  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe('');
  await expect.poll(() => activeEditorLineText(page)).toBe('');
  await expect(page.locator('.cm-active-source-line.cm-live-list-line')).toHaveCount(0);
});

test('empty nested task list enter outdents before exiting', async ({ page }) => {
  await openCleanApp(page);
  const markdown = ['- Parent', '  - [ ] '].join('\n');

  await replaceEditorMarkdown(page, markdown);
  await setEditorSelection(page, markdown.length, markdown.length);
  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe(['- Parent', '- [ ] '].join('\n'));
  await expect.poll(() => activeEditorLineText(page)).toBe('- [ ] ');
  await expect(page.locator('.cm-active-source-line.cm-live-list-line')).toHaveAttribute('style', /--list-indent: 0px/);

  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe(['- Parent', ''].join('\n'));
  await expect.poll(() => activeEditorLineText(page)).toBe('');
  await expect(page.locator('.cm-active-source-line.cm-live-list-line')).toHaveCount(0);
});

test('smart blockquote enter continues text lines and exits blank quote lines', async ({ page }) => {
  await openCleanApp(page);
  await replaceEditorMarkdown(page, '> First line');

  await setEditorSelection(page, '> First line'.length, '> First line'.length);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Second line');
  await expect.poll(() => editorMarkdown(page)).toBe(['> First line', '> Second line'].join('\n'));

  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe(['> First line', '> Second line', '> '].join('\n'));

  await page.keyboard.press('Enter');
  await expect.poll(() => editorMarkdown(page)).toBe(['> First line', '> Second line', ''].join('\n'));
});

test('list collapse hides and shows child lines', async ({ page }) => {
  await openCleanApp(page);
  await replaceEditorMarkdown(page, ['- Parent', '  - Child', '- Sibling'].join('\n'));

  const parentLine = page.locator('.cm-live-list-parent').filter({ hasText: 'Parent' }).first();
  await parentLine.hover();
  await page.getByLabel('Collapse list item').first().click();
  await expect(page.getByLabel('Expand list item')).toBeVisible();
  await expect(page.locator('.cm-collapsed-list-hidden-line')).toHaveCount(1);

  await page.getByLabel('Expand list item').first().click();
  await expect(page.locator('.cm-collapsed-list-hidden-line')).toHaveCount(0);
});

test('renders edit affordances for rich Markdown widgets', async ({ page }) => {
  await openCleanApp(page);
  const markdown = [
    '---',
    'title: Widget Brief',
    'tags:',
    '  - margin',
    '---',
    '',
    '| Column | Status |',
    '| --- | --- |',
    '| Item | Draft |',
    '',
    '![Product shot](https://example.com/product.png)',
    '',
    '***',
    '',
    'Plain anchor'
  ].join('\n');
  await replaceEditorMarkdown(page, markdown);
  await setEditorSelection(page, markdown.length, markdown.length);

  await expect(page.getByLabel('Edit front matter')).toBeVisible();
  await expect(page.getByLabel('Edit Markdown table')).toBeVisible();
  await expect(page.getByLabel('Edit Markdown image')).toBeVisible();
  await expect(page.getByLabel('Edit horizontal rule')).toBeVisible();
});

test('dims math and strikethrough source markers while editing', async ({ page }) => {
  await openCleanApp(page);
  const markdown = ['$$', 'x + y', '$$', '', 'Use $z$ and ~~gone~~'].join('\n');

  await replaceEditorMarkdown(page, markdown);
  await setEditorSelection(page, 0, 0);

  await expect.poll(async () => {
    const texts = await markdownSourceSyntaxTexts(page);
    return texts.filter((text) => text === '$$').length;
  }).toBe(2);

  const inlinePosition = markdown.indexOf('$z$') + 1;

  await setEditorSelection(page, inlinePosition, inlinePosition);
  await expect.poll(async () => {
    const texts = await markdownSourceSyntaxTexts(page);

    return {
      dollar: texts.filter((text) => text === '$').length,
      strike: texts.filter((text) => text === '~~').length
    };
  }).toEqual({ dollar: 2, strike: 2 });
});

test('dims structural Markdown affordances while editing', async ({ page }) => {
  await openCleanApp(page);
  const markdown = [
    '---',
    'title: Affordances',
    '---',
    '',
    '```ts',
    'const answer = 42;',
    '```',
    '',
    '| Name | Value |',
    '| :--- | ---: |',
    '| Item | Draft |',
    '',
    'See [Guide](https://example.com) and ![Alt](image.png).',
    'Use [Reference][guide] and footnote[^1].',
    '[guide]: https://example.com',
    '[^1]: Footnote body.'
  ].join('\n');

  await replaceEditorMarkdown(page, markdown);
  await setEditorSelection(page, markdown.indexOf('title'), markdown.indexOf('title'));
  await expect.poll(async () => {
    const texts = await markdownSourceSyntaxTexts(page);
    return texts.filter((text) => text === '---').length;
  }).toBe(2);

  const codePosition = markdown.indexOf('const answer');
  await setEditorSelection(page, codePosition, codePosition);
  await expect.poll(async () => {
    const texts = await markdownSourceSyntaxTexts(page);
    return texts.filter((text) => text === '```').length;
  }).toBe(2);

  const tablePosition = markdown.indexOf('| Name') + 2;
  await setEditorSelection(page, tablePosition, tablePosition);
  await expect.poll(async () => {
    const texts = await markdownSourceSyntaxTexts(page);

    return {
      pipes: texts.filter((text) => text === '|').length,
      leftAlign: texts.includes(':---'),
      rightAlign: texts.includes('---:')
    };
  }).toEqual({ pipes: 9, leftAlign: true, rightAlign: true });

  const linkPosition = markdown.indexOf('[Guide]') + 1;
  await setEditorSelection(page, linkPosition, linkPosition);
  await expect.poll(async () => {
    const texts = await markdownSourceSyntaxTexts(page);

    return {
      directLink: texts.includes(']('),
      imageStart: texts.includes('!['),
      imageClose: texts.filter((text) => text === ')').length,
      refLink: texts.includes(']['),
      footnoteRef: texts.includes('[^')
    };
  }).toEqual({
    directLink: true,
    imageStart: true,
    imageClose: 2,
    refLink: false,
    footnoteRef: false
  });

  const referencePosition = markdown.indexOf('[Reference]') + 1;
  await setEditorSelection(page, referencePosition, referencePosition);
  await expect.poll(async () => {
    const texts = await markdownSourceSyntaxTexts(page);

    return {
      refLink: texts.includes(']['),
      footnoteRef: texts.includes('[^')
    };
  }).toEqual({ refLink: true, footnoteRef: true });

  const definitionPosition = markdown.indexOf('[guide]:') + 1;
  await setEditorSelection(page, definitionPosition, definitionPosition);
  await expect.poll(async () => {
    const texts = await markdownSourceSyntaxTexts(page);
    return texts.includes(']:');
  }).toBe(true);
});

test('arrow keys move one source line across display math', async ({ page }) => {
  await openCleanApp(page);
  const markdown = [
    'Before math',
    'Another row before math',
    '$$ E = mc^2 $$',
    '',
    'After math',
    'Another row after math'
  ].join('\n');

  await replaceEditorMarkdown(page, markdown);
  await setEditorSelection(page, markdown.length, markdown.length);

  await page.keyboard.press('ArrowUp');
  await expect.poll(() => activeEditorLineText(page)).toBe('After math');

  await page.keyboard.press('ArrowUp');
  await expect.poll(() => activeEditorLineText(page)).toBe('');

  await page.keyboard.press('ArrowUp');
  await expect.poll(() => activeEditorLineText(page)).toBe('$$ E = mc^2 $$');

  await page.keyboard.press('ArrowUp');
  await expect.poll(() => activeEditorLineText(page)).toBe('Another row before math');

  await page.keyboard.press('ArrowUp');
  await expect.poll(() => activeEditorLineText(page)).toBe('Before math');

  await page.keyboard.press('ArrowDown');
  await expect.poll(() => activeEditorLineText(page)).toBe('Another row before math');

  await page.keyboard.press('ArrowDown');
  await expect.poll(() => activeEditorLineText(page)).toBe('$$ E = mc^2 $$');

  await page.keyboard.press('ArrowDown');
  await expect.poll(() => activeEditorLineText(page)).toBe('');

  await page.keyboard.press('ArrowDown');
  await expect.poll(() => activeEditorLineText(page)).toBe('After math');

  await page.keyboard.press('ArrowDown');
  await expect.poll(() => activeEditorLineText(page)).toBe('Another row after math');
});

test('drops image sources into the editor as Markdown references', async ({ page }) => {
  await openCleanApp(page);
  await replaceEditorMarkdown(page, 'Drop below.');

  await editor(page).dispatchEvent('drop', {
    clientX: 100,
    clientY: 120,
    dataTransfer: await page.evaluateHandle(() => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', 'https://example.com/product-shot.png');
      return dataTransfer;
    })
  });

  const download = await saveViaDownload(page);
  const savedMarkdown = await readFile((await download.path()) as string, 'utf8');
  expect(savedMarkdown).toContain('![product shot](https://example.com/product-shot.png)');
});

test('modifier-clicking a footnote reference jumps to its definition', async ({ page }) => {
  await openCleanApp(page);
  await replaceEditorMarkdown(
    page,
    ['Footnote reference[^1].', '', '', '', '', '', '', '[^1]: Footnote definition.'].join('\n')
  );

  await page.locator('[data-footnote-id="1"]').first().evaluate((node, modifier) => {
    node.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        metaKey: modifier === 'Meta',
        ctrlKey: modifier === 'Control'
      })
    );
  }, await platformModifier(page));
  await expect.poll(() => activeEditorLineText(page)).toContain('Footnote definition.');
});

function markdownSourceSyntaxTexts(page: Parameters<typeof editor>[0]) {
  return page.locator('.cm-markdown-source-syntax').evaluateAll((nodes) =>
    nodes.map((node) => node.textContent ?? '')
  );
}
