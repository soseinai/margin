import type { EditorState, ChangeSet } from '@codemirror/state';

import type { LocalAnnotations, LocalDocument } from '$lib/types';

export type SuggestionStatus = 'applied' | 'rejected' | 'resolved';
export type EditingMode = 'edit' | 'suggest';
export type ThemeSetting = 'auto' | 'light' | 'dark';
export type AppSettings = { theme: ThemeSetting; localUserName: string; soseinCloudEnabled: boolean };
export type AppUpdateMetadata = { currentVersion: string; version: string; notes?: string | null };
export type AppUpdateCheckState = 'idle' | 'checking' | 'available' | 'current' | 'installing' | 'error';
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict';
export type SaveLocalMarkdownOptions = { promptForPath?: boolean; autosave?: boolean };
export type PrintDocumentOptions = { includeMarginNotesAppendix?: boolean };
export type WordCountMetrics = { words: number; characters: number; lines: number };
export type ReviewCountStats = { open: number; closed: number };
export type TaskCountStats = { open: number; total: number };
export type WordCountStats = {
	document: WordCountMetrics;
	selection: WordCountMetrics | null;
	review: ReviewCountStats;
	tasks: TaskCountStats
};
export type InsertBlockKind = 'table' | 'tasks' | 'bullets' | 'numbers';
export type FindPanelMode = 'compact' | 'expanded';
export type FindPanelIconName = 'up' | 'down' | 'x' | 'scaling' | 'scaling-contract';
export type FindPanelPosition = { left: number; top: number };
export type FindPanelModeOptions = { resetPosition?: boolean };
export type CommandPaletteMode = 'commands' | 'files';
export type CommandPaletteInputMode = 'keyboard' | 'pointer';
export type CommandPaletteEntryKind = 'command' | 'file' | 'recent' | 'tab' | 'empty';
export type CommandPaletteIconName =
	| 'clock'
	| 'cloud'
	| 'command'
	| 'file-plus'
	| 'file-text'
	| 'folder-open'
	| 'folder-tree'
	| 'list'
	| 'list-checks'
	| 'list-ordered'
	| 'message-square-plus'
	| 'panel-left'
	| 'panel-left-close'
	| 'pencil'
	| 'printer'
	| 'refresh'
	| 'save'
	| 'search'
	| 'settings'
	| 'table'
	| 'x';
export type CommandPaletteEntry = {
	id: string;
	kind: CommandPaletteEntryKind;
	title: string;
	subtitle?: string;
	detail?: string;
	group?: string;
	shortcut?: string;
	keywords?: string[];
	disabled?: boolean;
	action: () => void | Promise<void>
};
export type CommandPaletteOpenRequest = {
	id: number;
	mode: CommandPaletteMode
};
export type CommandPaletteHeadingRow = {
	type: 'heading';
	id: string;
	title: string
};
export type CommandPaletteEntryRow = {
	type: 'entry';
	id: string;
	entry: CommandPaletteEntry;
	index: number
};
export type CommandPaletteRow = CommandPaletteHeadingRow | CommandPaletteEntryRow;
export type FindPanelHandle = {
	setMode: (mode: FindPanelMode, options?: FindPanelModeOptions) => void;
	focus: () => void;
};
export type TauriEvent<T> = { payload: T };
export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export type TauriDragDropPayload =
	{ type: 'enter'; paths: string[]; position: unknown } |
	{ type: 'over'; position: unknown } |
	{ type: 'drop'; paths: string[]; position: unknown } |
	{ type: 'leave' }
;

export type TauriWindow =
	Window &
	typeof globalThis &
	{
		__TAURI__?: {
			core?: {
				invoke?: TauriInvoke;
				convertFileSrc?: (filePath: string, protocol?: string) => string
			};
			event?: {
				listen?: <T>(event: string, handler: (event: TauriEvent<T>) => void) => Promise<() => void>
			 };

			webview?: {
				getCurrentWebview?: () => {
					onDragDropEvent?: (handler: (event: { payload: TauriDragDropPayload }) => void) => Promise<() => void>
				 }
			 }
		 }
	 }
;

export type MarkdownFileHandle = {
	kind?: string;
	name: string;
	getFile: () => Promise<File>;
	createWritable?: () => Promise<MarkdownWritableFile>
 };

export type MarkdownWritableFile = {
	write: (contents: string) => Promise<void>;
	close: () => Promise<void>
};

export type NativeMarkdownDocument = { path: string; name: string; markdown: string };
export type NativeOpenPathPayload = {
	kind: 'document' | 'directory';
	document?: NativeMarkdownDocument | null;
	directory?: NativeDirectoryTree | null
 };
export type NativeDirectoryTree = {
	path: string;
	name: string;
	entries: NativeDirectoryEntry[]
 };
export type NativeDirectoryEntry = {
	path: string;
	name: string;
	kind: 'directory' | 'markdown' | 'file';
	children: NativeDirectoryEntry[]
 };
export type ExternalDocumentChange = NativeMarkdownDocument & { detectedAt: number };
export type NativeMarkdownDocumentChange = { path: string };
export type NativeSoseinApiResponse = { status: number; body: unknown; bodyText: string };

export type SoseinActiveDocument = {
	serverUrl: string;
	id: string;
	title: string;
	contentType: string;
	snapshotVersion: number
};

export type FilePickerWindow =
	Window &
	typeof globalThis &
	{
		showOpenFilePicker?: (
			options: {
				multiple?: boolean;
				types?: Array<{ description: string; accept: Record<string, string[]> }>
			 }
		) => Promise<MarkdownFileHandle[]>;

		showSaveFilePicker?: (
			options: {
				suggestedName?: string;
				types?: Array<{ description: string; accept: Record<string, string[]> }>
			 }
		) => Promise<MarkdownFileHandle>
	 }
;

export type ThreadView = {
	id: string;
	kind: 'comment' | 'suggestion';
	author: string;
	quote: string;
	body: string;
	line: number;
	endLine: number;
	currentLine?: number;
	currentEndLine?: number;
	diffQuote?: string;
	diffBody?: string;
	pending?: boolean;
	applied?: boolean;
	resolved?: boolean;
	status?: SuggestionStatus
 };

export type DocumentTab = {
	id: string;
	title: string;
	documentData: LocalDocument;
	annotations: LocalAnnotations | null;
	editorMarkdown: string;
	baseMarkdown: string;
	draftBaseMarkdown: string;
	pendingEditThreads: ThreadView[];
	draftChanges: ChangeSet;
	editMode: EditingMode;
	localFileMode: boolean;
	localFileHandle: MarkdownFileHandle | null;
	localFileName: string;
	localMetadataDirty: boolean;
	nativeFilePath: string;
	lastPersistedSerializedMarkdown: string;
	externalChange: ExternalDocumentChange | null;
	saveState: SaveState;
	saveMessage: string;
	soseinDocument: SoseinActiveDocument | null;
	documentSessionKey: string;
	syncedEditKeys: string[]
 };

export type MarginItem =
	{
		type: 'composer';
		id: 'composer';
		top: number;
		anchorTop: number;
		height: number;
		connectorKind: 'comment'
	 } |

	{
		type: 'thread';
		id: string;
		top: number;
		anchorTop: number;
		height: number;
		connectorKind: 'comment' | 'suggestion';
		thread: ThreadView
	 }
;

export type DocumentViewport = {
	top: number;
	bottom: number
 };

export type SuggestionSurfaceKind = 'add' | 'replace' | 'remove';

export type ThreadRangeMatch = {
	from: number;
	to: number;
	matched: 'body' | 'quote' | 'deletion'
 };

export type CommentSelectionAnchor = {
	quote: string;
	markdownQuote: string;
	lineTop: number;
	startLine: number;
	endLine: number
 };

export type LivePreviewState = {
	threads: ThreadView[];
	activeThreadId: string;
	commentAnchor: CommentSelectionAnchor | null
 };

export type TypingProfile = {
	changedLines: string;
	decorationRanges: number;
	decorationsMs: number;
	docLength: number;
	lines: number;
	modelCache: 'hit' | 'miss' | 'unknown';
	modelMs: number;
	parseMs: number;
	startedAt: number;
	state: EditorState;
	totalMs: number
};
export type TypingProfileRow = {
	changedLines: string;
	decorationRanges: number;
	decorationsMs: number;
	docLength: number;
	lines: number;
	modelCache: 'hit' | 'miss' | 'unknown';
	modelMs: number;
	parseMs: number;
	totalMs: number
};
