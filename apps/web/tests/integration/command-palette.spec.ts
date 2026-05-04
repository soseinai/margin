import { expect, test } from '@playwright/test';
import { editor, emitTauriEvent, installTauriMock, openCleanApp } from './helpers';

test('opens the command palette and runs a command', async ({ page }) => {
  await installTauriMock(page);
  await openCleanApp(page, '/?desktop-preview');

  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'p',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
  });

  await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Command palette search' }).fill('new doc');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Untitled 2.md' })).toBeVisible();
});

test('updates labels and placeholder when switching palette modes', async ({ page }) => {
  await installTauriMock(page);
  await openCleanApp(page, '/?desktop-preview');

  await emitTauriEvent(page, 'margin://open-command-palette');

  await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Command palette search' })).toHaveAttribute(
    'placeholder',
    'Type command'
  );

  await page.getByRole('combobox', { name: 'Command palette search' }).fill('quick open');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('dialog', { name: 'Quick Open' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Quick open search' })).toHaveAttribute(
    'placeholder',
    'Search files'
  );

  await page.getByRole('combobox', { name: 'Quick open search' }).fill('>');

  await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Command palette search' })).toHaveAttribute(
    'placeholder',
    'Type command'
  );
});

test('keeps long palette navigation stable with arrow keys', async ({ page }) => {
  const documents = Array.from({ length: 32 }, (_, index) => {
    const name = `Note ${String(index + 1).padStart(2, '0')}.md`;

    return {
      path: `/workspace/${name}`,
      name,
      markdown: `# ${name}\n\nBody`
    };
  });

  await installTauriMock(page, {
    documents,
    directories: [
      {
        path: '/workspace',
        name: 'workspace',
        entries: documents.map((document) => ({
          path: document.path,
          name: document.name,
          kind: 'markdown',
          children: []
        }))
      }
    ],
    chosenDirectoryPath: '/workspace'
  });
  await openCleanApp(page, '/?desktop-preview');

  await emitTauriEvent(page, 'margin://open-folder');
  await emitTauriEvent(page, 'margin://quick-open-document');

  const fileList = page.locator('.command-palette-list');
  const initialListBox = await fileList.boundingBox();
  if (!initialListBox) throw new Error('Quick-open list is missing');
  const firstOptionBox = await page.locator('#command-palette-option-0').boundingBox();
  if (!firstOptionBox) throw new Error('First quick-open option is missing');
  const parkedPointer = {
    x: firstOptionBox.x + firstOptionBox.width / 2,
    y: firstOptionBox.y + firstOptionBox.height / 2
  };

  await page.mouse.move(parkedPointer.x, parkedPointer.y);

  for (let step = 0; step < 24; step += 1) {
    await page.keyboard.press('ArrowDown');
  }

  await page.evaluate(({ x, y }) => {
    document.elementFromPoint(x, y)?.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: x,
      clientY: y
    }));
  }, parkedPointer);

  await expect(page.locator('#command-palette-option-24')).toHaveClass(/active/);
  await expect(page.locator('#command-palette-option-24')).toContainText('Note 24.md');
  await expect(page.getByRole('combobox', { name: 'Quick open search' })).toHaveAttribute(
    'aria-activedescendant',
    'command-palette-option-24'
  );
  await expect.poll(() => fileList.evaluate((node) => node.scrollTop)).toBe(0);

  const listBoxAfterArrowDown = await fileList.boundingBox();
  const activeBoxAfterArrowDown = await page.locator('#command-palette-option-24').boundingBox();
  if (!listBoxAfterArrowDown || !activeBoxAfterArrowDown) {
    throw new Error('Active quick-open option is missing after ArrowDown navigation');
  }
  expect(Math.abs(listBoxAfterArrowDown.height - initialListBox.height)).toBeLessThan(0.5);
  expect(activeBoxAfterArrowDown.y).toBeGreaterThanOrEqual(listBoxAfterArrowDown.y);
  expect(activeBoxAfterArrowDown.y + activeBoxAfterArrowDown.height).toBeLessThanOrEqual(
    listBoxAfterArrowDown.y + listBoxAfterArrowDown.height
  );

  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press('ArrowUp');
  }

  await page.evaluate(({ x, y }) => {
    document.elementFromPoint(x, y)?.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: x,
      clientY: y
    }));
  }, parkedPointer);

  await expect(page.locator('#command-palette-option-4')).toHaveClass(/active/);
  await expect(page.locator('#command-palette-option-4')).toContainText('Note 04.md');
  await expect(page.getByRole('combobox', { name: 'Quick open search' })).toHaveAttribute(
    'aria-activedescendant',
    'command-palette-option-4'
  );
  await expect.poll(() => fileList.evaluate((node) => node.scrollTop)).toBe(0);

  const listBoxAfterArrowUp = await fileList.boundingBox();
  const activeBoxAfterArrowUp = await page.locator('#command-palette-option-4').boundingBox();
  if (!listBoxAfterArrowUp || !activeBoxAfterArrowUp) {
    throw new Error('Active quick-open option is missing after ArrowUp navigation');
  }
  expect(Math.abs(listBoxAfterArrowUp.height - initialListBox.height)).toBeLessThan(0.5);
  expect(activeBoxAfterArrowUp.y).toBeGreaterThanOrEqual(listBoxAfterArrowUp.y);
  expect(activeBoxAfterArrowUp.y + activeBoxAfterArrowUp.height).toBeLessThanOrEqual(
    listBoxAfterArrowUp.y + listBoxAfterArrowUp.height
  );
});

test('quick opens Markdown files from the folder tree', async ({ page }) => {
  await installTauriMock(page, {
    documents: [
      {
        path: '/workspace/notes/Alpha.md',
        name: 'Alpha.md',
        markdown: '# Alpha\n\nAlpha body'
      },
      {
        path: '/workspace/notes/Beta.md',
        name: 'Beta.md',
        markdown: '# Beta\n\nBeta body'
      }
    ],
    directories: [
      {
        path: '/workspace',
        name: 'workspace',
        entries: [
          {
            path: '/workspace/notes',
            name: 'notes',
            kind: 'directory',
            children: [
              {
                path: '/workspace/notes/Alpha.md',
                name: 'Alpha.md',
                kind: 'markdown',
                children: []
              },
              {
                path: '/workspace/notes/Beta.md',
                name: 'Beta.md',
                kind: 'markdown',
                children: []
              }
            ]
          }
        ]
      }
    ],
    chosenDirectoryPath: '/workspace'
  });
  await openCleanApp(page, '/?desktop-preview');

  await emitTauriEvent(page, 'margin://open-folder');
  await expect(page.getByText('Beta.md')).toBeVisible();

  await emitTauriEvent(page, 'margin://quick-open-document');
  await expect(page.getByRole('dialog', { name: 'Quick Open' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Quick open search' }).fill('beta');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Beta.md' })).toBeVisible();
  await expect(editor(page)).toContainText('Beta body');
});

test('middle truncates long quick-open file labels without overlap', async ({ page }) => {
  const longFileName = 'Euler-Math-SOURCE-with-an-unreasonably-long-file-name.md';
  const longRelativePath = [
    'apps',
    'web',
    'src',
    'assets',
    'fonts',
    'very-long-folder-name-for-command-palette-overflow',
    longFileName
  ].join('/');
  const longPath = `/workspace/${longRelativePath}`;

  await installTauriMock(page, {
    documents: [
      {
        path: longPath,
        name: longFileName,
        markdown: '# Long file\n\nBody'
      }
    ],
    directories: [
      {
        path: '/workspace',
        name: 'workspace',
        entries: [
          {
            path: longPath,
            name: longFileName,
            kind: 'markdown',
            children: []
          }
        ]
      }
    ],
    chosenDirectoryPath: '/workspace'
  });
  await openCleanApp(page, '/?desktop-preview');

  await emitTauriEvent(page, 'margin://open-folder');
  await emitTauriEvent(page, 'margin://quick-open-document');

  const option = page.locator('button.command-palette-option').filter({ hasText: 'Euler-Math' }).first();
  await expect(option.locator('.command-palette-name')).toContainText('...');
  await expect(option.locator('.command-palette-detail')).toContainText('...');
  await expect(option).toHaveAttribute('title', new RegExp(longFileName));
  await expect(option).toHaveAttribute('title', new RegExp(longRelativePath));

  const nameBox = await option.locator('.command-palette-name').boundingBox();
  const detailBox = await option.locator('.command-palette-detail').boundingBox();
  if (!nameBox || !detailBox) {
    throw new Error('Quick-open file label parts are missing');
  }

  expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(detailBox.x);
});
