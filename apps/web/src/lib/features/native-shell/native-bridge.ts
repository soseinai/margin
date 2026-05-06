import type {
	InsertBlockKind,
	NativeMarkdownDocumentChange,
	TauriDragDropPayload,
	TauriEvent,
	TauriWindow
} from '../../app-types';

export type NativeDesktopBridgeHandlers = {
	createNewDocument: () => void | Promise<void>;
	handleNativeOpenUrls: (urls: string[]) => void | Promise<void>;
	handleNativeDocumentChanged: (change: NativeMarkdownDocumentChange) => void | Promise<void>;
	openCommandPaletteCommands: () => void | Promise<void>;
	openCommandPaletteFiles: () => void | Promise<void>;
	openLocalMarkdown: () => void | Promise<void>;
	openLocalFolder: () => void | Promise<void>;
	openRecentDocument: (index: number) => void | Promise<void>;
	clearRecentDocuments: () => void | Promise<void>;
	saveLocalMarkdown: () => void | Promise<void>;
	saveLocalMarkdownAs: () => void | Promise<void>;
	requestPrintDocument: () => void | Promise<void>;
	openWordCountDialog: () => void | Promise<void>;
	closeActiveDocumentTab: () => void | Promise<void>;
	activatePreviousTab: () => void | Promise<void>;
	activateNextTab: () => void | Promise<void>;
	openSettingsDialog: () => void | Promise<void>;
	checkForDesktopUpdate: () => void | Promise<void>;
	openFindPanel: () => void | Promise<void>;
	openFindAndReplacePanel: () => void | Promise<void>;
	findNextInEditor: () => void | Promise<void>;
	findPreviousInEditor: () => void | Promise<void>;
	toggleFileTreePanel: () => void | Promise<void>;
	insertMarkdownBlock: (kind: InsertBlockKind) => void | Promise<void>;
	openCommentComposerForSelection: () => void | Promise<void>;
	handleNativeDragDrop: (payload: TauriDragDropPayload) => void | Promise<void>;
	isInsertBlockKind: (value: unknown) => value is InsertBlockKind;
};

export async function registerNativeDesktopBridge(
	windowObject: TauriWindow,
	handlers: NativeDesktopBridgeHandlers
) {
	const cleanup: Array<() => void> = [];
	let menuReady = false;
	const tauri = windowObject.__TAURI__;
	const listen = tauri?.event?.listen;

	if (!listen) {
		return { cleanup, menuReady };
	}

	try {
		cleanup.push(await listen('margin://new-document', () => {
			handlers.createNewDocument();
		}));
		cleanup.push(await listen<string[]>('margin://open-urls', (event: TauriEvent<string[]>) => {
			handlers.handleNativeOpenUrls(event.payload);
		}));
		cleanup.push(await listen<NativeMarkdownDocumentChange>('margin://document-changed', (event: TauriEvent<NativeMarkdownDocumentChange>) => {
			handlers.handleNativeDocumentChanged(event.payload);
		}));
		cleanup.push(await listen('margin://open-command-palette', () => {
			handlers.openCommandPaletteCommands();
		}));
		cleanup.push(await listen('margin://quick-open-document', () => {
			handlers.openCommandPaletteFiles();
		}));
		cleanup.push(await listen('margin://open-document', () => {
			handlers.openLocalMarkdown();
		}));
		cleanup.push(await listen('margin://open-folder', () => {
			handlers.openLocalFolder();
		}));
		cleanup.push(await listen<number>('margin://open-recent-document', (event: TauriEvent<number>) => {
			handlers.openRecentDocument(event.payload);
		}));
		cleanup.push(await listen('margin://clear-recent-documents', () => {
			handlers.clearRecentDocuments();
		}));
		cleanup.push(await listen('margin://save-document', () => {
			handlers.saveLocalMarkdown();
		}));
		cleanup.push(await listen('margin://save-document-as', () => {
			handlers.saveLocalMarkdownAs();
		}));
		cleanup.push(await listen('margin://print-document', () => {
			handlers.requestPrintDocument();
		}));
		cleanup.push(await listen('margin://show-word-count', () => {
			handlers.openWordCountDialog();
		}));
		cleanup.push(await listen('margin://close-tab', () => {
			handlers.closeActiveDocumentTab();
		}));
		cleanup.push(await listen('margin://previous-tab', () => {
			handlers.activatePreviousTab();
		}));
		cleanup.push(await listen('margin://next-tab', () => {
			handlers.activateNextTab();
		}));
		cleanup.push(await listen('margin://open-settings', () => {
			handlers.openSettingsDialog();
		}));
		cleanup.push(await listen('margin://check-for-updates', () => {
			handlers.checkForDesktopUpdate();
		}));
		cleanup.push(await listen('margin://open-find', () => {
			handlers.openFindPanel();
		}));
		cleanup.push(await listen('margin://open-find-and-replace', () => {
			handlers.openFindAndReplacePanel();
		}));
		cleanup.push(await listen('margin://find-next', () => {
			handlers.findNextInEditor();
		}));
		cleanup.push(await listen('margin://find-previous', () => {
			handlers.findPreviousInEditor();
		}));
		cleanup.push(await listen('margin://toggle-file-tree', () => {
			handlers.toggleFileTreePanel();
		}));
		cleanup.push(await listen<InsertBlockKind>('margin://insert-block', (event: TauriEvent<InsertBlockKind>) => {
			if (handlers.isInsertBlockKind(event.payload)) {
				handlers.insertMarkdownBlock(event.payload);
			}
		}));
		cleanup.push(await listen('margin://add-comment', () => {
			handlers.openCommentComposerForSelection();
		}));

		menuReady = true;
	} catch(err) {
		console.warn('Unable to connect native menus', err);
		menuReady = false;
	}

	try {
		const webview = tauri?.webview?.getCurrentWebview?.();

		if (webview?.onDragDropEvent) {
			cleanup.push(await webview.onDragDropEvent((event) => {
				handlers.handleNativeDragDrop(event.payload);
			}));
		}
	} catch(err) {
		console.warn('Unable to connect native file drops', err);
	}

	return { cleanup, menuReady };
}
