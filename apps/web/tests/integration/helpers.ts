import { expect, type Locator, type Page } from '@playwright/test';

export type NativeDocument = {
  path: string;
  name: string;
  markdown: string;
};

type NativeDirectoryEntry = {
  path: string;
  name: string;
  kind: 'directory' | 'markdown' | 'file';
  children: NativeDirectoryEntry[];
};

type NativeDirectoryTree = {
  path: string;
  name: string;
  entries: NativeDirectoryEntry[];
};

export type TauriCall = {
  command: string;
  args?: Record<string, unknown>;
};

type FilePickerFile = {
  name: string;
  markdown: string;
  writable?: boolean;
};

type TauriMockOptions = {
  pendingOpenUrls?: string[];
  documents?: NativeDocument[];
  directories?: NativeDirectoryTree[];
  chosenDocumentPath?: string | null;
  chosenDirectoryPath?: string | null;
  chosenSavePath?: string | null;
  settings?: { theme: string; localUserName: string };
  recentDocuments?: Array<{ path: string; title: string; openedAt: number }>;
  update?: { currentVersion: string; version: string; notes?: string | null } | null;
  confirmClose?: boolean;
  writeSettingsError?: string;
  checkUpdateError?: string;
};

export async function openCleanApp(
  page: Page,
  path = '/',
  options: { preserveFilePicker?: boolean } = {}
) {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.addInitScript((preserveFilePicker) => {
    if (!window.sessionStorage.getItem('__marginTestStorageCleared')) {
      window.localStorage.clear();
      window.sessionStorage.setItem('__marginTestStorageCleared', 'true');
    }
    if (!preserveFilePicker) {
      delete (window as typeof window & { showOpenFilePicker?: unknown }).showOpenFilePicker;
      delete (window as typeof window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
    }
  }, Boolean(options.preserveFilePicker));
  await page.goto(path);
  await expect(editor(page)).toBeVisible();
}

export function editor(page: Page): Locator {
  return page.locator('.cm-content[contenteditable="true"]').first();
}

export async function replaceEditorMarkdown(page: Page, markdown: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(markdown);
  await expect.poll(() => editorMarkdown(page)).toBe(markdown);
}

export async function selectAllEditorText(page: Page) {
  await setEditorSelection(page);
}

export async function setEditorSelection(page: Page, from = 0, to?: number) {
  await editor(page).evaluate(
    (node, selection) => {
      const view = (node as HTMLElement & { cmTile?: { view?: unknown } }).cmTile?.view as
        | {
            state: { doc: { length: number } };
            dispatch: (spec: { selection: { anchor: number; head: number } }) => void;
            focus: () => void;
          }
        | undefined;

      if (!view) throw new Error('CodeMirror view is unavailable');

      const head = selection.to ?? view.state.doc.length;
      view.dispatch({ selection: { anchor: selection.from, head } });
      view.focus();
    },
    { from, to }
  );
}

export async function editorMarkdown(page: Page) {
  return editor(page).evaluate((node) => {
    const view = (node as HTMLElement & { cmTile?: { view?: unknown } }).cmTile?.view as
      | { state: { doc: { toString: () => string } } }
      | undefined;

    if (!view) throw new Error('CodeMirror view is unavailable');

    return view.state.doc.toString();
  });
}

export async function editorSelectionText(page: Page) {
  return editor(page).evaluate((node) => {
    const view = (node as HTMLElement & { cmTile?: { view?: unknown } }).cmTile?.view as
      | {
          state: {
            selection: { main: { from: number; to: number } };
            sliceDoc: (from: number, to: number) => string;
          };
        }
      | undefined;

    if (!view) throw new Error('CodeMirror view is unavailable');

    const selection = view.state.selection.main;
    return view.state.sliceDoc(selection.from, selection.to);
  });
}

export async function activeEditorLineText(page: Page) {
  return editor(page).evaluate((node) => {
    const view = (node as HTMLElement & { cmTile?: { view?: unknown } }).cmTile?.view as
      | {
          state: {
            selection: { main: { head: number } };
            doc: { lineAt: (position: number) => { text: string } };
          };
        }
      | undefined;

    if (!view) throw new Error('CodeMirror view is unavailable');

    return view.state.doc.lineAt(view.state.selection.main.head).text;
  });
}

export async function pressMod(page: Page, key: string) {
  const modifier = await platformModifier(page);
  await page.keyboard.press(`${modifier}+${key}`);
}

export async function openCommentComposer(page: Page) {
  const composer = page.getByLabel('New comment');
  await editor(page).focus();

  for (const shortcut of ['Meta+Alt+m', 'Meta+Alt+KeyM', 'Control+Alt+m', 'Control+Alt+KeyM']) {
    try {
      await page.keyboard.press(shortcut);
    } catch {
      continue;
    }

    if (await composer.isVisible().catch(() => false)) {
      return;
    }
  }

  if (!(await composer.isVisible().catch(() => false))) {
    await editor(page).evaluate((node) => {
      node.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'm',
          code: 'KeyM',
          metaKey: true,
          altKey: true,
          bubbles: true,
          cancelable: true
        })
      );
    });
  }
  await expect(composer).toBeVisible();
}

export async function platformModifier(page: Page): Promise<'Meta' | 'Control'> {
  const isMac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  return isMac ? 'Meta' : 'Control';
}

export async function saveViaDownload(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByLabel('Save document', { exact: true }).click();
  return downloadPromise;
}

export async function installFilePickerMock(page: Page, files: FilePickerFile[] = []) {
  await page.addInitScript((initialFiles: FilePickerFile[]) => {
    const handles = new Map(
      initialFiles.map((file) => [
        file.name,
        {
          name: file.name,
          markdown: file.markdown,
          writable: file.writable ?? true,
          writes: [] as string[]
        }
      ])
    );

    const state = {
      handles,
      openQueue: initialFiles.map((file) => file.name),
      saveName: 'Saved.md',
      saveWrites: [] as string[],
      savePickerCalls: [] as Array<Record<string, unknown>>
    };

    function fileFor(name: string, markdown: string) {
      return new File([markdown], name, { type: 'text/markdown' });
    }

    function handleFor(name: string) {
      let handle = state.handles.get(name);
      if (!handle) {
        handle = { name, markdown: '', writable: true, writes: [] };
        state.handles.set(name, handle);
      }

      return {
        name,
        getFile: async () => fileFor(name, handle.markdown),
        createWritable: handle.writable
          ? async () => ({
              write: async (contents: string) => {
                handle.markdown = contents;
                handle.writes.push(contents);
              },
              close: async () => {}
            })
          : undefined
      };
    }

    Object.assign(window, {
      __marginFilePicker: {
        setOpenFiles(nextFiles: FilePickerFile[]) {
          state.handles.clear();
          state.openQueue = [];
          for (const file of nextFiles) {
            state.handles.set(file.name, {
              name: file.name,
              markdown: file.markdown,
              writable: file.writable ?? true,
              writes: []
            });
            state.openQueue.push(file.name);
          }
        },
        setHandleMarkdown(name: string, markdown: string) {
          const handle = state.handles.get(name);
          if (handle) handle.markdown = markdown;
        },
        setSaveName(name: string) {
          state.saveName = name;
        },
        snapshot() {
          return {
            files: Array.from(state.handles.values()).map((handle) => ({
              name: handle.name,
              markdown: handle.markdown,
              writes: handle.writes
            })),
            saveWrites: state.saveWrites,
            savePickerCalls: state.savePickerCalls
          };
        }
      },
      showOpenFilePicker: async () => {
        const nextName = state.openQueue.shift();
        return nextName ? [handleFor(nextName)] : [];
      },
      showSaveFilePicker: async (options?: Record<string, unknown>) => {
        state.savePickerCalls.push(options ?? {});
        const name = state.saveName || (options?.suggestedName as string | undefined) || 'Saved.md';

        return {
          name,
          getFile: async () => fileFor(name, state.saveWrites.at(-1) ?? ''),
          createWritable: async () => ({
            write: async (contents: string) => {
              state.saveWrites.push(contents);
            },
            close: async () => {}
          })
        };
      }
    });
  }, files);
}

export async function filePickerSnapshot(page: Page) {
  return page.evaluate(() =>
    (
      window as typeof window & {
        __marginFilePicker: {
          snapshot: () => {
            files: Array<{ name: string; markdown: string; writes: string[] }>;
            saveWrites: string[];
            savePickerCalls: Array<Record<string, unknown>>;
          };
        };
      }
    ).__marginFilePicker.snapshot()
  );
}

export async function setFilePickerOpenFiles(page: Page, files: FilePickerFile[]) {
  await page.evaluate((nextFiles) => {
    (
      window as typeof window & {
        __marginFilePicker: { setOpenFiles: (files: FilePickerFile[]) => void };
      }
    ).__marginFilePicker.setOpenFiles(nextFiles);
  }, files);
}

export async function setFilePickerMarkdown(page: Page, name: string, markdown: string) {
  await page.evaluate(
    ({ fileName, contents }) => {
      (
        window as typeof window & {
          __marginFilePicker: { setHandleMarkdown: (name: string, markdown: string) => void };
        }
      ).__marginFilePicker.setHandleMarkdown(fileName, contents);
    },
    { fileName: name, contents: markdown }
  );
}

export async function installTauriMock(page: Page, options: TauriMockOptions = {}) {
  await page.addInitScript((mockOptions: TauriMockOptions) => {
    const documents = new Map((mockOptions.documents ?? []).map((document) => [document.path, document]));
    const directories = new Map((mockOptions.directories ?? []).map((directory) => [directory.path, directory]));
    const listeners = new Map<string, Array<(event: { payload: unknown }) => void>>();
    const calls: TauriCall[] = [];
    let dragDropHandler: ((event: { payload: unknown }) => void) | null = null;
    let pendingOpenUrls = [...(mockOptions.pendingOpenUrls ?? [])];
    let chosenDocumentPath = mockOptions.chosenDocumentPath ?? null;
    let chosenDirectoryPath = mockOptions.chosenDirectoryPath ?? null;
    let chosenSavePath = mockOptions.chosenSavePath ?? null;
    let settings = mockOptions.settings ?? { theme: 'auto', localUserName: 'Me' };
    let recentDocuments = mockOptions.recentDocuments ?? [];
    let update = mockOptions.update ?? null;
    let confirmClose = mockOptions.confirmClose ?? true;
    let writeSettingsError = mockOptions.writeSettingsError ?? '';
    let checkUpdateError = mockOptions.checkUpdateError ?? '';

    function fileNameFromPath(path: string) {
      return path.split(/[\\/]/).filter(Boolean).at(-1) || 'Untitled.md';
    }

    Object.assign(window, {
      __marginTauriMock: {
        calls,
        setDocument(document: NativeDocument) {
          documents.set(document.path, document);
        },
        setChosenDocumentPath(path: string | null) {
          chosenDocumentPath = path;
        },
        setChosenDirectoryPath(path: string | null) {
          chosenDirectoryPath = path;
        },
        setChosenSavePath(path: string | null) {
          chosenSavePath = path;
        },
        setUpdate(nextUpdate: TauriMockOptions['update']) {
          update = nextUpdate ?? null;
          checkUpdateError = '';
        },
        setCheckUpdateError(message: string) {
          checkUpdateError = message;
        },
        setWriteSettingsError(message: string) {
          writeSettingsError = message;
        },
        setConfirmClose(value: boolean) {
          confirmClose = value;
        },
        emit(eventName: string, payload?: unknown) {
          for (const handler of listeners.get(eventName) ?? []) handler({ payload });
        },
        drag(payload: unknown) {
          dragDropHandler?.({ payload });
        }
      },
      __TAURI__: {
        core: {
          invoke: async (command: string, args?: Record<string, unknown>) => {
            calls.push({ command, args });

            if (command === 'take_pending_open_urls') {
              const urls = pendingOpenUrls;
              pendingOpenUrls = [];
              return urls;
            }

            if (command === 'read_settings') return settings;
            if (command === 'write_settings') {
              if (writeSettingsError) throw new Error(writeSettingsError);
              settings = (args?.settings as typeof settings | undefined) ?? settings;
              return settings;
            }

            if (command === 'read_recent_documents') return recentDocuments;
            if (command === 'write_recent_documents') {
              recentDocuments = (args?.entries as typeof recentDocuments | undefined) ?? [];
              return recentDocuments;
            }

            if (command === 'choose_markdown_document') {
              return chosenDocumentPath ? documents.get(chosenDocumentPath) ?? null : null;
            }

            if (command === 'open_markdown_document') {
              const path = args?.path as string;
              const document = documents.get(path);
              if (!document) throw new Error(`Unable to open ${path}`);
              return document;
            }

            if (command === 'open_native_path') {
              const path = args?.path as string;
              const directory = directories.get(path);

              if (directory) {
                return {
                  kind: 'directory',
                  document: null,
                  directory
                };
              }

              const document = documents.get(path);

              if (document) {
                return {
                  kind: 'document',
                  document,
                  directory: null
                };
              }

              throw new Error(`Unable to open ${path}`);
            }

            if (command === 'choose_directory') {
              return chosenDirectoryPath ? directories.get(chosenDirectoryPath) ?? null : null;
            }

            if (command === 'read_directory_tree') {
              const path = args?.path as string;
              const directory = directories.get(path);
              if (!directory) throw new Error(`Unable to open ${path}`);
              return directory;
            }

            if (command === 'choose_markdown_save_path') return chosenSavePath;

            if (command === 'save_markdown_document') {
              const path = args?.path as string;
              const markdown = args?.markdown as string;
              const document = { path, name: fileNameFromPath(path), markdown };
              documents.set(path, document);
              return document;
            }

            if (command === 'watch_markdown_document') return undefined;
            if (command === 'confirm_close_tab') return confirmClose;
            if (command === 'quit_app') return undefined;
            if (command === 'print_window') return undefined;

            if (command === 'check_for_app_update') {
              if (checkUpdateError) throw new Error(checkUpdateError);
              return update;
            }

            if (command === 'install_app_update') return undefined;
            if (command === 'show_comment_context_menu') return undefined;

            throw new Error(`Unexpected command ${command}`);
          },
          convertFileSrc: (filePath: string) => `asset://${filePath}`
        },
        event: {
          listen: async (eventName: string, handler: (event: { payload: unknown }) => void) => {
            const handlers = listeners.get(eventName) ?? [];
            handlers.push(handler);
            listeners.set(eventName, handlers);
            return () => {
              const current = listeners.get(eventName) ?? [];
              listeners.set(
                eventName,
                current.filter((candidate) => candidate !== handler)
              );
            };
          }
        },
        webview: {
          getCurrentWebview: () => ({
            onDragDropEvent: async (handler: (event: { payload: unknown }) => void) => {
              dragDropHandler = handler;
              return () => {
                dragDropHandler = null;
              };
            }
          })
        }
      }
    });
  }, options);
}

export async function tauriCalls(page: Page): Promise<TauriCall[]> {
  return page.evaluate(() =>
    (
      window as typeof window & {
        __marginTauriMock: { calls: TauriCall[] };
      }
    ).__marginTauriMock.calls
  );
}

export async function emitTauriEvent(page: Page, eventName: string, payload?: unknown) {
  await page.evaluate(
    ({ name, eventPayload }) => {
      (
        window as typeof window & {
          __marginTauriMock: { emit: (eventName: string, payload?: unknown) => void };
        }
      ).__marginTauriMock.emit(name, eventPayload);
    },
    { name: eventName, eventPayload: payload }
  );
}

export async function emitTauriDragDrop(page: Page, payload: unknown) {
  await page.evaluate((eventPayload) => {
    (
      window as typeof window & {
        __marginTauriMock: { drag: (payload: unknown) => void };
      }
    ).__marginTauriMock.drag(eventPayload);
  }, payload);
}

export async function setTauriDocument(page: Page, document: NativeDocument) {
  await page.evaluate((nextDocument) => {
    (
      window as typeof window & {
        __marginTauriMock: { setDocument: (document: NativeDocument) => void };
      }
    ).__marginTauriMock.setDocument(nextDocument);
  }, document);
}

export async function setTauriUpdate(
  page: Page,
  update: TauriMockOptions['update'],
  error = ''
) {
  await page.evaluate(
    ({ nextUpdate, message }) => {
      const mock = (
        window as typeof window & {
          __marginTauriMock: {
            setUpdate: (update: TauriMockOptions['update']) => void;
            setCheckUpdateError: (message: string) => void;
          };
        }
      ).__marginTauriMock;
      mock.setUpdate(nextUpdate);
      if (message) mock.setCheckUpdateError(message);
    },
    { nextUpdate: update, message: error }
  );
}

export async function setTauriWriteSettingsError(page: Page, message: string) {
  await page.evaluate((errorMessage) => {
    (
      window as typeof window & {
        __marginTauriMock: { setWriteSettingsError: (message: string) => void };
      }
    ).__marginTauriMock.setWriteSettingsError(errorMessage);
  }, message);
}

export async function setTauriConfirmClose(page: Page, value: boolean) {
  await page.evaluate((nextValue) => {
    (
      window as typeof window & {
        __marginTauriMock: { setConfirmClose: (value: boolean) => void };
      }
    ).__marginTauriMock.setConfirmClose(nextValue);
  }, value);
}
