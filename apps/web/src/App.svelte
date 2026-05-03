<script lang="ts">
	import {
		defaultKeymap,
		history,
		historyKeymap,
		indentLess,
		indentMore,
		insertNewlineAndIndent
	} from '@codemirror/commands';

	import { markdown } from '@codemirror/lang-markdown';
	import { languages } from '@codemirror/language-data';
	import {
		SearchQuery,
		closeSearchPanel,
		findNext,
		findPrevious,
		getSearchQuery,
		openSearchPanel,
		replaceAll,
		replaceNext,
		search,
		searchKeymap,
		setSearchQuery
	} from '@codemirror/search';
	import {
		HighlightStyle,
		LanguageDescription,
		defaultHighlightStyle,
		forceParsing,
		indentUnit,
		syntaxHighlighting
	} from '@codemirror/language';

	import {
		ChangeSet,
		EditorState,
		Prec,
		StateEffect,
		StateField,
		type Extension,
		type Line,
		type Range
	} from '@codemirror/state';

	import {
		Decoration,
		EditorView,
		ViewPlugin,
		WidgetType,
		keymap,
		runScopeHandlers,
		type DecorationSet,
		type Panel,
		type ViewUpdate
	} from '@codemirror/view';
	import { tags } from '@lezer/highlight';
	import katex from 'katex';

	import FilePlusIcon from '@lucide/svelte/icons/file-plus';
	import FolderTreeIcon from '@lucide/svelte/icons/folder-tree';
	import PanelLeftCloseIcon from '@lucide/svelte/icons/panel-left-close';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import CheckIcon from '@lucide/svelte/icons/check';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SaveIcon from '@lucide/svelte/icons/save';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import XIcon from '@lucide/svelte/icons/x';
	import { onMount, tick } from 'svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { draftMarkdownSuggestions, suggestionKey } from './lib/draft-suggestions';
	import FileTreeEntry from './lib/components/FileTreeEntry.svelte';
	import { authorInitials, avatarStyle, defaultLocalUserName, normalizeLocalUserName } from './lib/local-identity';
	import {
		compactLocalPath,
		directoryPath,
		fileNameFromPath,
		imageAltText,
		isAbsoluteLocalPath,
		isImagePathLike,
		isImageSourceLike,
		isMarkdownPathLike,
		joinLocalPath,
		markdownImageReference,
		normalizePathSeparators,
		normalizeRecentDocuments,
		type RecentDocument
	} from './lib/local-documents';
	import {
		clampImageResize,
		markdownImageFromMatch,
		markdownImageOnly,
		markdownImagePattern,
		markdownImageSizeCss,
		markdownImageWithSize,
		type MarkdownImage
	} from './lib/markdown-images';
	import {
		isFrontmatterBoundaryLine,
		isFrontmatterClosingLine,
		parseFrontmatter,
		type MarkdownFrontmatter
	} from './lib/markdown-frontmatter';
	import { orderedListMarkersForLines } from './lib/markdown-lists';
	import {
		inlineMarkdownMathSpans,
		markdownMathBlocksForLines,
		type MarkdownMathBlock as ParsedMarkdownMathBlock
	} from './lib/markdown-math';
	import {
		isClosingMarkdownFence,
		markdownCodeFenceLanguage,
		openingMarkdownFence,
		type MarkdownFenceInfo
	} from './lib/markdown-code-fences';
	import {
		leadingMarkdownIndent,
		leadingMarkdownWhitespaceLength,
		markdownIndentWidth,
		sourceMarkdownIndentLengthForWidth
	} from './lib/markdown-indent';
	import {
		markdownTableAlignment,
		markdownTableCells,
		markdownTableDelimiterCells,
		padMarkdownTableAlignments,
		padMarkdownTableCells,
		type MarkdownTable
	} from './lib/markdown-tables';

	import {
		appendMarginCommentBlock,
		splitMarginCommentBlock,
		type MarginCommentBlock
	} from './lib/embedded-margin';
	import { renderPrintMarkdown } from './lib/print-markdown';

	import type { LocalDocument, MarginAnchor, MarginSuggestion, LocalAnnotations } from './lib/types';

	let documentData: LocalDocument | null = null;
	let annotations: LocalAnnotations | null = null;
	let editorMarkdown = '';
	let baseMarkdown = '';
	let pendingEditThreads: ThreadView[] = [];
	let selectedQuote = '';
	let selectionQuote = '';
	let selectedCommentAnchor: CommentSelectionAnchor | null = null;
	let selectionCommentAnchor: CommentSelectionAnchor | null = null;
	let commentBody = '';
	let editingCommentId = '';
	let editingCommentBody = '';
	let editMode: EditingMode = 'edit';
	let appSettings: AppSettings = { theme: 'auto', localUserName: defaultLocalUserName() };
	let settingsDraftTheme: ThemeSetting = 'auto';
	let settingsDraftLocalUserName = defaultLocalUserName();
	let localAuthor = defaultLocalUserName();
	let settingsDialogOpen = false;
	let printOptionsDialogOpen = false;
	let includeMarginNotesAppendix = true;
	let settingsSaving = false;
	let settingsError = '';
	let availableAppUpdate: AppUpdateMetadata | null = null;
	let updateCheckState: AppUpdateCheckState = 'idle';
	let updateStatusMessage = '';
	let updateNoticeVisible = false;
	let updateAutoCheckTimer: ReturnType<typeof setTimeout> | null = null;
	let error = '';
	let documentSurface: HTMLElement;
	let fileInput: HTMLInputElement;
	let commentTextarea: HTMLElement | null = null;
	let editingCommentTextarea: HTMLElement | null = null;
	let commentComposerAttention = false;
	let mainEditor: EditorView | null = null;
	let selectedLineTop = 0;
	let selectionLineTop = 0;
	let documentHeight = 720;
	let lineTops: Record<number, number> = {};
	let annotationTops: Record<string, number> = {};
	let cardHeights: Record<string, number> = {};
	let persistedThreads: ThreadView[] = [];
	let threads: ThreadView[] = [];
	let marginItems: MarginItem[] = [];
	let stageHeight = 720;
	let activeThreadId = '';
	let draftBaseMarkdown = '';
	let draftChanges = ChangeSet.empty(0);
	let documentSessionKey = 'sample';
	let localFileMode = false;
	let localFileHandle: MarkdownFileHandle | null = null;
	let localFileName = '';
	let localMetadataDirty = false;
	let nativeFilePath = '';
	let lastPersistedSerializedMarkdown = '';
	let externalChange: ExternalDocumentChange | null = null;
	let saveState: SaveState = 'idle';
	let saveMessage = '';
	let localEditRevision = 0;
	let localAutosaveTimer: ReturnType<typeof setTimeout> | null = null;
	let localAutosaveInFlight = false;
	let findPanelMode: FindPanelMode = 'compact';
	let findPanelPosition: FindPanelPosition | null = null;
	let activeFindPanel: FindPanelHandle | null = null;
	let saveProgressVisible = false;
	let saveProgressFading = false;
	let saveProgressShownAt = 0;
	let saveProgressFadeTimer: ReturnType<typeof setTimeout> | null = null;
	let saveProgressHideTimer: ReturnType<typeof setTimeout> | null = null;
	let commentComposerAttentionTimer: ReturnType<typeof setTimeout> | null = null;
	let fileChangeCheckInFlight = false;
	let unlistenNativeInsertMenu: (() => void) | null = null;
	let unlistenNativeCommentMenu: (() => void) | null = null;
	let unlistenNativeNewMenu: (() => void) | null = null;
	let unlistenNativeOpenUrls: (() => void) | null = null;
	let unlistenNativeOpenMenu: (() => void) | null = null;
	let unlistenNativeOpenFolderMenu: (() => void) | null = null;
	let unlistenNativeOpenRecentMenu: (() => void) | null = null;
	let unlistenNativeClearRecentMenu: (() => void) | null = null;
	let unlistenNativeSaveMenu: (() => void) | null = null;
	let unlistenNativeSaveAsMenu: (() => void) | null = null;
	let unlistenNativePrintMenu: (() => void) | null = null;
	let unlistenNativeCloseTabMenu: (() => void) | null = null;
	let unlistenNativePreviousTabMenu: (() => void) | null = null;
	let unlistenNativeNextTabMenu: (() => void) | null = null;
	let unlistenNativeSettingsMenu: (() => void) | null = null;
	let unlistenNativeCheckUpdatesMenu: (() => void) | null = null;
	let unlistenNativeOpenFindMenu: (() => void) | null = null;
	let unlistenNativeOpenFindReplaceMenu: (() => void) | null = null;
	let unlistenNativeFindNextMenu: (() => void) | null = null;
	let unlistenNativeFindPreviousMenu: (() => void) | null = null;
	let unlistenNativeToggleFileTreeMenu: (() => void) | null = null;
	let unlistenNativeDocumentChanged: (() => void) | null = null;
	let unlistenNativeDragDrop: (() => void) | null = null;
	let tauriShell = false;
	let desktopShell = false;
	let mobileShell = false;
	let nativeMenuBridgeReady = false;
	let nativeDragHasEditorImages = false;
	let saveDialogOpen = false;
	let documentTabs: DocumentTab[] = [];
	let visibleDocumentTabs: DocumentTab[] = [];
	let activeDocumentTabId = '';
	let recentDocuments: RecentDocument[] = [];
	let dragActive = false;
	let printDocumentHtml = '';
	let printAppendixCandidateThreads: ThreadView[] = [];
	let printableThreads: ThreadView[] = [];
	let fileTreeRoot: NativeDirectoryTree | null = null;
	let fileTreePanelOpen = false;
	let fileTreePanelWidth = 300;
	let fileTreeResizeActive = false;
	let fileTreeLoading = false;
	let fileTreeError = '';
	let collapsedHeadingKeys = new Set<string>();
	let collapsedListItemKeys = new Set<string>();
	const syncedEditKeys = new Set<string>();
	const anchorContextCharacters = 96;
	const gutterCardGap = 14;
	const gutterReservedTop = 86;
	const recentDocumentsStorageKey = 'margin:recent-documents:v1';
	const settingsStorageKey = 'margin:settings:v1';
	const localAutosaveDelayMs = 900;
	const saveProgressMinVisibleMs = 1000;
	const saveProgressFadeMs = 500;
	const markdownBlockWidgetNavigationRadius = 6;
	const fileTreePanelMinWidth = 220;
	const fileTreePanelMaxWidth = 520;
	const themeOptions: ThemeSetting[] = ['auto', 'light', 'dark'];
	const loadingMarkdownCodeLanguages = new Map<string, Promise<unknown>>();
	const marginHighlightStyle = HighlightStyle.define([
		{
			tag: [tags.keyword, tags.modifier, tags.operatorKeyword, tags.controlKeyword],
			color: 'var(--code-keyword)'
		},
		{ tag: [tags.atom, tags.bool, tags.null], color: 'var(--code-atom)' },
		{ tag: tags.number, color: 'var(--code-number)' },
		{ tag: [tags.string, tags.special(tags.string)], color: 'var(--code-string)' },
		{ tag: tags.comment, color: 'var(--code-comment)', fontStyle: 'italic' },
		{
			tag: [
				tags.definition(tags.variableName),
				tags.function(tags.variableName),
				tags.function(tags.definition(tags.variableName))
			],
			color: 'var(--code-definition)'
		},
		{ tag: [tags.variableName, tags.propertyName], color: 'var(--code-variable)' },
		{ tag: [tags.typeName, tags.className], color: 'var(--code-type)' },
		{ tag: [tags.operator, tags.punctuation, tags.separator], color: 'var(--code-operator)' },
		{ tag: tags.invalid, color: 'var(--code-invalid)' }
	]);

	const markdownFileTypes = [
		{
			description: 'Markdown documents',
			accept: {
				'text/markdown': ['.md', '.markdown'],
				'text/plain': ['.md', '.markdown', '.txt']
			}
		}
	];

	const insertBlocks: Record<InsertBlockKind, { label: string; markdown: string; cursorText: string }> = {
		table: {
			label: 'Table',
			markdown: '| Column | Owner | Status |\n| --- | --- | --- |\n| Item | Team | Draft |',
			cursorText: 'Column'
		},
		tasks: {
			label: 'Task list',
			markdown: '- [ ] Task\n- [ ] Task',
			cursorText: 'Task'
		},
		bullets: {
			label: 'Bullet list',
			markdown: '- Item\n- Item',
			cursorText: 'Item'
		},
		numbers: {
			label: 'Numbered list',
			markdown: '1. Item\n2. Item',
			cursorText: 'Item'
		}
	};

	type SuggestionStatus = 'applied' | 'rejected' | 'resolved';
	type EditingMode = 'edit' | 'suggest';
	type ThemeSetting = 'auto' | 'light' | 'dark';
	type AppSettings = { theme: ThemeSetting; localUserName: string };
	type AppUpdateMetadata = { currentVersion: string; version: string; notes?: string | null };
	type AppUpdateCheckState = 'idle' | 'checking' | 'available' | 'current' | 'installing' | 'error';
	type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict';
	type SaveLocalMarkdownOptions = { promptForPath?: boolean; autosave?: boolean };
	type PrintDocumentOptions = { includeMarginNotesAppendix?: boolean };
	type InsertBlockKind = 'table' | 'tasks' | 'bullets' | 'numbers';
	type FindPanelMode = 'compact' | 'expanded';
	type FindPanelIconName = 'up' | 'down' | 'scaling' | 'scaling-contract';
	type FindPanelPosition = { left: number; top: number };
	type FindPanelModeOptions = { resetPosition?: boolean };
	type FindPanelHandle = {
		setMode: (mode: FindPanelMode, options?: FindPanelModeOptions) => void;
		focus: () => void;
	};
	type TauriEvent<T> = { payload: T };
	type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

	type TauriDragDropPayload =
		{ type: 'enter'; paths: string[]; position: unknown } |
		{ type: 'over'; position: unknown } |
		{ type: 'drop'; paths: string[]; position: unknown } |
		{ type: 'leave' }
	;

	type TauriWindow =
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

	type MarkdownFileHandle = {
		kind?: string;
		name: string;
		getFile: () => Promise<File>;
		createWritable?: () => Promise<MarkdownWritableFile>
	 };

	type MarkdownWritableFile = {
		write: (contents: string) => Promise<void>;
		close: () => Promise<void>
	};

	type NativeMarkdownDocument = { path: string; name: string; markdown: string };
	type NativeOpenPathPayload = {
		kind: 'document' | 'directory';
		document?: NativeMarkdownDocument | null;
		directory?: NativeDirectoryTree | null
	 };
	type NativeDirectoryTree = {
		path: string;
		name: string;
		entries: NativeDirectoryEntry[]
	 };
	type NativeDirectoryEntry = {
		path: string;
		name: string;
		kind: 'directory' | 'markdown' | 'file';
		children: NativeDirectoryEntry[]
	 };
	type ExternalDocumentChange = NativeMarkdownDocument & { detectedAt: number };
	type NativeMarkdownDocumentChange = { path: string };

	type FilePickerWindow =
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

	type ThreadView = {
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

	type DocumentTab = {
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
		documentSessionKey: string;
		syncedEditKeys: string[]
	 };

	type MarginItem =
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

	type SuggestionSurfaceKind = 'add' | 'replace' | 'remove';

	type ThreadRangeMatch = {
		from: number;
		to: number;
		matched: 'body' | 'quote' | 'deletion'
	 };

	type CommentSelectionAnchor = {
		quote: string;
		markdownQuote: string;
		lineTop: number;
		startLine: number;
		endLine: number
	 };

	type LivePreviewState = {
		threads: ThreadView[];
		activeThreadId: string;
		commentAnchor: CommentSelectionAnchor | null;
		decorations: DecorationSet
	 };

	type SourceBlock = {
		start: number;
		end: number;
		kind: 'line' | 'frontmatter' | 'fenced-code' | 'list' | 'indented' | 'table' | 'math';
		listEditBaseSourceIndent?: number;
		listEditBaseVisualIndent?: number;
		language?: string;
		frontmatter?: MarkdownFrontmatter;
		math?: ParsedMarkdownMathBlock;
		table?: MarkdownTable
	 };

	type MarkdownHeadingLine = { level: number; text: string; syntaxLength: number };
	type MarkdownHeading = {
		blockEnd: number;
		collapseKey: string;
		level: number;
		lineNumber: number;
		text: string
	 };
	type MarkdownHeadingModel = {
		collapsedAncestorByLine: Map<number, number>;
		items: Map<number, MarkdownHeading>
	 };
	type ListInfo = { indent: number; contentIndent: number; marker: string; task: boolean };
	type ListContinuationInfo = {
		sourceIndentLength: number;
		sourceIndentWidth: number;
		visualIndent: number
	 };
	type ListContainerContext = {
		info: ListInfo;
		sourceIndent: number;
		visualIndent: number
	 };
	type MarkdownListLayout = {
		depth: number;
		marker: string;
		markerOffset: number;
		markerX: number;
		textX: number
	 };
	type MarkdownListItem = {
		blockEnd: number;
		childLines: number[];
		collapseKey: string;
		info: ListInfo;
		layout: MarkdownListLayout;
		lineNumber: number;
		parentLine: number | null
	 };
	type MarkdownListModel = {
		collapsedAncestorByLine: Map<number, number>;
		items: Map<number, MarkdownListItem>;
		ownerByLine: Map<number, MarkdownListItem>
	 };
	const markdownImageBounds = new Map<string, { width: number; height: number }>();
	const markdownImageResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

	class SuggestionWidget extends WidgetType {
		text = '';
		id = '';
		pending = false;
		status: SuggestionStatus = 'applied';
		focused = false;
		label = '';
		kind: SuggestionSurfaceKind = 'replace';

		constructor(
			text: string,
			id: string,
			pending = false,
			status: SuggestionStatus = 'applied',
			focused = false,
			label = 'edit',
			kind: SuggestionSurfaceKind = 'replace'
		) {
			super();
			this.text = text;
			this.id = id;
			this.pending = pending;
			this.status = status;
			this.focused = focused;
			this.label = label;
			this.kind = kind;
		}

		eq(other: WidgetType) {
			return other instanceof SuggestionWidget && other.text === this.text && other.id === this.id && other.pending === this.pending && other.status === this.status && other.focused === this.focused && other.label === this.label && other.kind === this.kind;
		}

		toDOM() {
			const mark = document.createElement('mark');

			mark.className = `annotation-mark suggestion suggestion-${this.kind}${this.text ? '' : ' empty-change'}${this.pending ? ' pending' : ''} is-${this.status}${this.focused ? ' is-focused' : ''}`;
			mark.dataset.threadAnchor = this.id;

			if (this.text) {
				mark.append(document.createTextNode(this.text));
			}

			mark.append(suggestionBadgeElement(this.label));

			return mark;
		}
	}

	class SuggestionBadgeWidget extends WidgetType {
		id = '';
		label = '';
		pending = false;
		status: SuggestionStatus = 'applied';
		focused = false;
		kind: SuggestionSurfaceKind = 'replace';

		constructor(
			id: string,
			label: string,
			pending = false,
			status: SuggestionStatus = 'applied',
			focused = false,
			kind: SuggestionSurfaceKind = 'replace'
		) {
			super();
			this.id = id;
			this.label = label;
			this.pending = pending;
			this.status = status;
			this.focused = focused;
			this.kind = kind;
		}

		eq(other: WidgetType) {
			return other instanceof SuggestionBadgeWidget && other.id === this.id && other.label === this.label && other.pending === this.pending && other.status === this.status && other.focused === this.focused && other.kind === this.kind;
		}

		toDOM() {
			const badge = suggestionBadgeElement(this.label);

			badge.classList.add('inline-suggestion-badge', `suggestion-${this.kind}`, `is-${this.status}`);

			if (this.pending) badge.classList.add('pending');
			if (this.focused) badge.classList.add('is-focused');

			badge.dataset.threadAnchor = this.id;

			return badge;
		}
	}

	function suggestionBadgeElement(label: string) {
		const badge = document.createElement('span');

		badge.className = 'annotation-badge';
		badge.textContent = label;

		return badge;
	}

	class TaskCheckboxWidget extends WidgetType {
		checked = false;
		checkPosition = 0;

		constructor(checked: boolean, checkPosition: number) {
			super();
			this.checked = checked;
			this.checkPosition = checkPosition;
		}

		eq(other: WidgetType) {
			return other instanceof TaskCheckboxWidget && other.checked === this.checked && other.checkPosition === this.checkPosition;
		}

		toDOM(view: EditorView) {
			const button = document.createElement('button');

			button.type = 'button';
			button.dataset.slot = 'task-checkbox';
			button.className = `task-checkbox-widget${this.checked ? ' checked' : ''}`;
			button.setAttribute('aria-label', this.checked ? 'Mark task incomplete' : 'Mark task complete');
			button.setAttribute('aria-checked', String(this.checked));
			button.setAttribute('role', 'checkbox');
			button.addEventListener('mousedown', (event) => event.preventDefault());

			button.addEventListener('click', (event) => {
				event.preventDefault();

				view.dispatch({
					changes: {
						from: this.checkPosition,
						to: this.checkPosition + 1,
						insert: this.checked ? ' ' : 'x'
					}
				});

				view.focus();
			});

			return button;
		}

		ignoreEvent() {
			return false;
		}
	}

	class ListCollapseToggleWidget extends WidgetType {
		key = '';
		collapsed = false;
		lineNumber = 1;

		constructor(key: string, collapsed: boolean, lineNumber: number) {
			super();
			this.key = key;
			this.collapsed = collapsed;
			this.lineNumber = lineNumber;
		}

		eq(other: WidgetType) {
			return other instanceof ListCollapseToggleWidget
				&& other.key === this.key
				&& other.collapsed === this.collapsed
				&& other.lineNumber === this.lineNumber;
		}

		toDOM(view: EditorView) {
			const button = document.createElement('button');

			button.type = 'button';
			button.dataset.slot = 'list-collapse-toggle';
			button.className = `markdown-list-collapse-toggle${this.collapsed ? ' is-collapsed' : ''}`;
			button.setAttribute('aria-label', this.collapsed ? 'Expand list item' : 'Collapse list item');
			button.setAttribute('aria-expanded', String(!this.collapsed));

			const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

			icon.classList.add('markdown-list-collapse-icon');
			icon.setAttribute('aria-hidden', 'true');
			icon.setAttribute('focusable', 'false');
			icon.setAttribute('viewBox', '0 0 16 16');
			path.setAttribute('d', 'M4.75 6.25L8 9.5L11.25 6.25');
			icon.append(path);
			button.append(icon);

			button.addEventListener('mousedown', (event) => event.preventDefault());
			button.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();

				toggleMarkdownListCollapse(view, this.key, this.lineNumber);
				view.focus();
			});

			return button;
		}

		ignoreEvent() {
			return false;
		}
	}

	class HeadingCollapseToggleWidget extends WidgetType {
		key = '';
		collapsed = false;
		lineNumber = 1;

		constructor(key: string, collapsed: boolean, lineNumber: number) {
			super();
			this.key = key;
			this.collapsed = collapsed;
			this.lineNumber = lineNumber;
		}

		eq(other: WidgetType) {
			return other instanceof HeadingCollapseToggleWidget
				&& other.key === this.key
				&& other.collapsed === this.collapsed
				&& other.lineNumber === this.lineNumber;
		}

		toDOM(view: EditorView) {
			const button = document.createElement('button');

			button.type = 'button';
			button.dataset.slot = 'heading-collapse-toggle';
			button.className = `markdown-heading-collapse-toggle${this.collapsed ? ' is-collapsed' : ''}`;
			button.setAttribute('aria-label', this.collapsed ? 'Expand heading section' : 'Collapse heading section');
			button.setAttribute('aria-expanded', String(!this.collapsed));

			const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

			icon.classList.add('markdown-heading-collapse-icon');
			icon.setAttribute('aria-hidden', 'true');
			icon.setAttribute('focusable', 'false');
			icon.setAttribute('viewBox', '0 0 16 16');
			path.setAttribute('d', 'M4.75 6.25L8 9.5L11.25 6.25');
			icon.append(path);
			button.append(icon);

			button.addEventListener('mousedown', (event) => event.preventDefault());
			button.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();

				toggleMarkdownHeadingCollapse(view, this.key, this.lineNumber);
				view.focus();
			});

			return button;
		}

		ignoreEvent() {
			return false;
		}
	}

	class HorizontalRuleWidget extends WidgetType {
		lineNumber = 1;

		constructor(lineNumber: number) {
			super();
			this.lineNumber = lineNumber;
		}

		eq(other: WidgetType) {
			return other instanceof HorizontalRuleWidget && other.lineNumber === this.lineNumber;
		}

		toDOM(view: EditorView) {
			const rule = document.createElement('div');

			rule.className = 'markdown-horizontal-rule-widget';
			rule.tabIndex = 0;
			rule.setAttribute('role', 'separator');
			rule.setAttribute('aria-label', 'Edit horizontal rule');

			const editRule = (event: Event) => {
				event.preventDefault();

				const line = view.state.doc.line(Math.min(this.lineNumber, view.state.doc.lines));

				view.dispatch({ selection: { anchor: line.from } });
				view.focus();
			};

			rule.addEventListener('mousedown', editRule);

			rule.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') editRule(event);
			});

			return rule;
		}

		ignoreEvent() {
			return false;
		}
	}

	class MarkdownMathWidget extends WidgetType {
		source = '';
		displayMode = false;
		lineNumber = 1;
		editPosition = 0;
		key = '';

		constructor(source: string, displayMode: boolean, lineNumber: number, editPosition: number) {
			super();
			this.source = source;
			this.displayMode = displayMode;
			this.lineNumber = lineNumber;
			this.editPosition = editPosition;
			this.key = `${displayMode}:${source}:${lineNumber}:${editPosition}`;
		}

		eq(other: WidgetType) {
			return other instanceof MarkdownMathWidget && other.key === this.key;
		}

		toDOM(view: EditorView) {
			const wrapper = document.createElement('span');

			wrapper.className = `markdown-math-widget ${this.displayMode ? 'display' : 'inline'}`;
			wrapper.tabIndex = 0;
			wrapper.setAttribute('role', 'button');
			wrapper.setAttribute('aria-label', this.displayMode ? 'Edit display math' : 'Edit inline math');

			try {
				katex.render(this.source, wrapper, {
					displayMode: this.displayMode,
					throwOnError: false,
					strict: 'ignore',
					trust: false
				});
			} catch (error) {
				wrapper.classList.add('is-error');
				wrapper.textContent = this.source;
				wrapper.title = error instanceof Error ? error.message : 'Unable to render math';
			}

			const editMath = (event: Event) => {
				event.preventDefault();

				const position = Math.min(this.editPosition, view.state.doc.length);

				view.dispatch({ selection: { anchor: position } });
				view.focus();
			};

			wrapper.addEventListener('mousedown', editMath);

			wrapper.addEventListener('keydown', (event) => {
				const keyboardEvent = event as KeyboardEvent;

				if (keyboardEvent.key === 'Enter') editMath(keyboardEvent);
			});

			return wrapper;
		}

		ignoreEvent() {
			return false;
		}
	}

	class CodeLanguageLabelWidget extends WidgetType {
		language = '';

		constructor(language: string) {
			super();
			this.language = language;
		}

		eq(other: WidgetType) {
			return other instanceof CodeLanguageLabelWidget && other.language === this.language;
		}

		toDOM() {
			const label = document.createElement('span');

			label.className = 'markdown-code-language-label';
			label.textContent = this.language;
			label.setAttribute('aria-label', `Code language: ${this.language}`);

			return label;
		}
	}

	class SourceIndentGuideWidget extends WidgetType {
		toDOM() {
			const guide = document.createElement('span');

			guide.className = 'cm-source-indent-guide';
			guide.setAttribute('aria-hidden', 'true');

			return guide;
		}
	}

	class MarkdownImageWidget extends WidgetType {
		image: MarkdownImage;
		lineNumber = 1;
		from = 0;
		to = 0;
		block = false;
		key = '';

		constructor(image: MarkdownImage, lineNumber: number, from: number, to: number, block = false) {
			super();
			this.image = image;
			this.lineNumber = lineNumber;
			this.from = from;
			this.to = to;
			this.block = block;
			this.key = `${JSON.stringify(image)}:${from}:${to}:${block}`;
		}

		eq(other: WidgetType) {
			return other instanceof MarkdownImageWidget && other.lineNumber === this.lineNumber && other.key === this.key;
		}

		toDOM(view: EditorView) {
			const wrapper = document.createElement(this.block ? 'figure' : 'span');
			const image = document.createElement('img');
			const fallback = document.createElement('span');
			const resizeHandle = document.createElement('button');
			const resolvedSrc = resolveMarkdownImageSrc(this.image.src);

			wrapper.className = `markdown-image-widget ${this.block ? 'block' : 'inline'}`;
			wrapper.tabIndex = 0;
			wrapper.setAttribute('role', 'button');
			wrapper.setAttribute('aria-label', 'Edit Markdown image');

			image.alt = this.image.alt;
			image.decoding = 'async';
			image.loading = 'lazy';
			image.draggable = false;
			if (this.image.title) image.title = this.image.title;
			applyMarkdownImageSize(image, this.image);

			if (resolvedSrc) {
				image.src = resolvedSrc;
			} else {
				wrapper.classList.add('is-missing');
			}

			fallback.className = 'markdown-image-fallback';
			fallback.textContent = this.image.alt || this.image.src || 'Image';
			resizeHandle.type = 'button';
			resizeHandle.className = 'markdown-image-resize-handle';
			resizeHandle.setAttribute('aria-label', 'Resize image');

			const resizeGrip = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			resizeGrip.classList.add('markdown-image-resize-grip');
			resizeGrip.setAttribute('aria-hidden', 'true');
			resizeGrip.setAttribute('focusable', 'false');
			resizeGrip.setAttribute('viewBox', '0 0 24 24');

			for (const pathData of ['M22 7L7 22', 'M22 13L13 22', 'M22 19L19 22']) {
				const gripLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');

				gripLine.setAttribute('d', pathData);
				resizeGrip.append(gripLine);
			}

			resizeHandle.append(resizeGrip);
			resizeHandle.addEventListener('mousedown', (event) => {
				this.startResize(event, view, image, wrapper);
			});

			wrapper.append(image, fallback, resizeHandle);

			const rememberBounds = () => {
				const rect = image.getBoundingClientRect();

				if (rect.width <= 0 || rect.height <= 0) return;

				markdownImageBounds.set(markdownImageBoundsKey(this.image), {
					width: Math.round(rect.width),
					height: Math.round(rect.height)
				});
			};

			let measureFrame = 0;
			const refreshGeometry = () => {
				if (measureFrame) return;

				measureFrame = window.requestAnimationFrame(() => {
					measureFrame = 0;
					rememberBounds();
					view.requestMeasure();
					window.requestAnimationFrame(updateAnchorPositions);
				});
			};

			image.addEventListener('error', () => {
				wrapper.classList.add('is-missing');
				refreshGeometry();
			});

			image.addEventListener('load', refreshGeometry);
			if (image.complete) refreshGeometry();

			if (typeof ResizeObserver === 'function') {
				const observer = new ResizeObserver(refreshGeometry);

				observer.observe(wrapper);
				observer.observe(image);
				markdownImageResizeObservers.set(wrapper, observer);
			}

			const editImage = (event: Event) => {
				event.preventDefault();

				const line = view.state.doc.line(Math.min(this.lineNumber, view.state.doc.lines));

				view.dispatch({ selection: { anchor: line.from } });
				view.focus();
			};

			wrapper.addEventListener('mousedown', editImage);

			wrapper.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') editImage(event);
			});

			return wrapper;
		}

		startResize(
			event: MouseEvent,
			view: EditorView,
			image: HTMLImageElement,
			wrapper: HTMLElement
		) {
			event.preventDefault();
			event.stopPropagation();

			const rect = image.getBoundingClientRect();

			if (rect.width <= 0 || rect.height <= 0) return;

			const startX = event.clientX;
			const startY = event.clientY;
			const startWidth = rect.width;
			const startHeight = rect.height;
			let nextWidth = Math.round(startWidth);
			let nextHeight = Math.round(startHeight);

			wrapper.classList.add('is-resizing');

			const onMove = (moveEvent: MouseEvent) => {
				moveEvent.preventDefault();

				nextWidth = clampImageResize(startWidth + moveEvent.clientX - startX);
				nextHeight = clampImageResize(startHeight + moveEvent.clientY - startY);
				image.style.width = `${nextWidth}px`;
				image.style.height = `${nextHeight}px`;

				markdownImageBounds.set(markdownImageBoundsKey(this.image), {
					width: nextWidth,
					height: nextHeight
				});
			};

			const onUp = (upEvent: MouseEvent) => {
				upEvent.preventDefault();
				wrapper.classList.remove('is-resizing');
				document.removeEventListener('mousemove', onMove);
				document.removeEventListener('mouseup', onUp);

				replaceMarkdownImageSize(view, this.image, this.from, this.to, nextWidth, nextHeight);
			};

			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
		}

		ignoreEvent() {
			return false;
		}

		destroy(dom: HTMLElement) {
			markdownImageResizeObservers.get(dom)?.disconnect();
			markdownImageResizeObservers.delete(dom);
		}
	}

	class FrontmatterWidget extends WidgetType {
		frontmatter: MarkdownFrontmatter;
		startLine = 1;
		key = '';

		constructor(frontmatter: MarkdownFrontmatter, startLine: number) {
			super();
			this.frontmatter = frontmatter;
			this.startLine = startLine;
			this.key = JSON.stringify(frontmatter);
		}

		eq(other: WidgetType) {
			return other instanceof FrontmatterWidget && other.startLine === this.startLine && other.key === this.key;
		}

		toDOM(view: EditorView) {
			const wrapper = document.createElement('div');

			wrapper.className = 'markdown-frontmatter-widget';
			wrapper.tabIndex = 0;
			wrapper.setAttribute('role', 'button');
			wrapper.setAttribute('aria-label', 'Edit front matter');

			const title = document.createElement('div');

			title.className = 'markdown-frontmatter-title';
			title.textContent = 'front matter';
			wrapper.append(title);

			if (this.frontmatter.entries.length > 0) {
				const list = document.createElement('dl');

				list.className = 'markdown-frontmatter-list';

				this.frontmatter.entries.forEach((entry) => {
					const key = document.createElement('dt');
					const value = document.createElement('dd');

					key.textContent = entry.key;
					value.textContent = entry.value;
					list.append(key, value);
				});

				wrapper.append(list);
			} else {
				const raw = document.createElement('pre');

				raw.className = 'markdown-frontmatter-raw';
				raw.textContent = this.frontmatter.rawLines.filter((line) => line.trim()).join('\n');
				wrapper.append(raw);
			}

			const editFrontmatter = (event: Event) => {
				event.preventDefault();

				const line = view.state.doc.line(Math.min(this.startLine, view.state.doc.lines));

				view.dispatch({ selection: { anchor: line.from } });
				view.focus();
			};

			wrapper.addEventListener('mousedown', editFrontmatter);

			wrapper.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') editFrontmatter(event);
			});

			return wrapper;
		}

		ignoreEvent() {
			return false;
		}
	}

	class MarkdownTableWidget extends WidgetType {
		table: MarkdownTable;
		startLine = 1;
		key = '';

		constructor(table: MarkdownTable, startLine: number) {
			super();
			this.table = table;
			this.startLine = startLine;
			this.key = JSON.stringify(table);
		}

		eq(other: WidgetType) {
			return other instanceof MarkdownTableWidget && other.startLine === this.startLine && other.key === this.key;
		}

		toDOM(view: EditorView) {
			const wrapper = document.createElement('div');

			wrapper.className = 'markdown-table-widget';
			wrapper.tabIndex = 0;
			wrapper.setAttribute('role', 'button');
			wrapper.setAttribute('aria-label', 'Edit Markdown table');

			const table = document.createElement('table');
			const thead = document.createElement('thead');
			const headerRow = document.createElement('tr');

			this.table.headers.forEach((header, index) => {
				const cell = document.createElement('th');

				cell.textContent = header;
				setTableCellAlignment(cell, this.table.alignments[index]);
				headerRow.append(cell);
			});

			thead.append(headerRow);
			table.append(thead);

			const tbody = document.createElement('tbody');

			this.table.rows.forEach((row) => {
				const tableRow = document.createElement('tr');

				for (let index = 0; index < this.table.headers.length; index += 1) {
					const cell = document.createElement('td');

					cell.textContent = row[index] ?? '';
					setTableCellAlignment(cell, this.table.alignments[index]);
					tableRow.append(cell);
				}

				tbody.append(tableRow);
			});

			table.append(tbody);
			wrapper.append(table);

			const editTable = (event: Event) => {
				event.preventDefault();

				const line = view.state.doc.line(Math.min(this.startLine, view.state.doc.lines));

				view.dispatch({ selection: { anchor: line.from } });
				view.focus();
			};

			wrapper.addEventListener('mousedown', editTable);

			wrapper.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') editTable(event);
			});

			return wrapper;
		}

		ignoreEvent() {
			return false;
		}
	}

	function setTableCellAlignment(
		cell: HTMLTableCellElement,
		alignment: 'left' | 'center' | 'right' | null
	) {
		if (alignment) cell.dataset.align = alignment;
	}

	const setThreadsEffect = StateEffect.define<ThreadView[]>();
	const setActiveThreadEffect = StateEffect.define<string>();
	const setCommentAnchorEffect = StateEffect.define<CommentSelectionAnchor | null>();
	const refreshLivePreviewEffect = StateEffect.define<void>();
	const setMarginDropCursorEffect = StateEffect.define<number | null>();

	type DropCursorMeasurement = {
		left: number;
		top: number;
		height: number;
	};

	const marginDropCursor = ViewPlugin.fromClass(
		class {
			cursor: HTMLDivElement | null = null;
			dropPos: number | null = null;
			view: EditorView;

			measureRequest = {
				read: () => this.readCursorPosition(),
				write: (position: DropCursorMeasurement | null) => this.drawCursor(position)
			};

			constructor(view: EditorView) {
				this.view = view;
			}

			update(update: ViewUpdate) {
				for (const transaction of update.transactions) {
					for (const effect of transaction.effects) {
						if (effect.is(setMarginDropCursorEffect)) {
							this.setDropPos(effect.value);

							return;
						}
					}
				}

				if (this.dropPos != null && (update.docChanged || update.geometryChanged)) {
					this.view.requestMeasure(this.measureRequest);
				}
			}

			destroy() {
				this.cursor?.remove();
			}

			setDropPos(position: number | null) {
				if (this.dropPos === position) return;

				this.dropPos = position;

				if (position == null) {
					this.cursor?.remove();
					this.cursor = null;

					return;
				}

				if (!this.cursor) {
					this.cursor = this.view.scrollDOM.appendChild(document.createElement('div'));
					this.cursor.className = 'cm-dropCursor margin-drop-cursor';
				}

				this.view.requestMeasure(this.measureRequest);
			}

			readCursorPosition(): DropCursorMeasurement | null {
				if (this.dropPos == null) return null;

				const cursorRect = this.view.coordsAtPos(this.dropPos);
				if (!cursorRect) return null;

				const scrollerRect = this.view.scrollDOM.getBoundingClientRect();

				return {
					left: cursorRect.left - scrollerRect.left + this.view.scrollDOM.scrollLeft * this.view.scaleX,
					top: cursorRect.top - scrollerRect.top + this.view.scrollDOM.scrollTop * this.view.scaleY,
					height: cursorRect.bottom - cursorRect.top
				};
			}

			drawCursor(position: DropCursorMeasurement | null) {
				if (!this.cursor) return;

				if (!position) {
					this.cursor.style.left = '-100000px';

					return;
				}

				this.cursor.style.left = `${position.left / this.view.scaleX}px`;
				this.cursor.style.top = `${position.top / this.view.scaleY}px`;
				this.cursor.style.height = `${position.height / this.view.scaleY}px`;
			}
		},
		{
			eventObservers: {
				dragover(event) {
					this.setDropPos(this.view.posAtCoords({ x: event.clientX, y: event.clientY }, false));
				},

				dragleave(event) {
					if (
						event.target === this.view.contentDOM
						|| !this.view.contentDOM.contains(event.relatedTarget as Node | null)
					) {
						this.setDropPos(null);
					}
				},

				dragend() {
					this.setDropPos(null);
				},

				drop() {
					this.setDropPos(null);
				}
			}
		}
	);

	const livePreviewField = StateField.define<LivePreviewState>({
		create(state) {
			return {
				threads: [],
				activeThreadId: '',
				commentAnchor: null,
				decorations: buildLivePreviewDecorations(state, [], '', null)
			};
		},

		update(value, transaction) {
			let threadsForState = value.threads;
			let activeThreadForState = value.activeThreadId;
			let commentAnchorForState = value.commentAnchor;
			let threadChange = false;
			let activeThreadChange = false;
			let commentAnchorChange = false;
			let refreshPreview = false;

			for (const effect of transaction.effects) {
				if (effect.is(setThreadsEffect)) {
					threadsForState = effect.value;
					threadChange = true;
				}

				if (effect.is(setActiveThreadEffect)) {
					activeThreadForState = effect.value;
					activeThreadChange = true;
				}

				if (effect.is(setCommentAnchorEffect)) {
					commentAnchorForState = effect.value;
					commentAnchorChange = true;
				}

				if (effect.is(refreshLivePreviewEffect)) {
					refreshPreview = true;
				}
			}

			if (transaction.docChanged || transaction.selection || threadChange || activeThreadChange || commentAnchorChange || refreshPreview) {
				return {
					threads: threadsForState,
					activeThreadId: activeThreadForState,
					commentAnchor: commentAnchorForState,
					decorations: buildLivePreviewDecorations(transaction.state, threadsForState, activeThreadForState, commentAnchorForState)
				};
			}

			return value;
		},
		provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
	});

	$: persistedThreads = annotations
		? [
			...annotations.comments.filter((comment) => !comment.resolved).map((comment) => ({
				id: comment.id,
				kind: 'comment' as const,
				author: comment.author,
				quote: comment.anchor.quote,
				body: comment.body,
				line: comment.anchor.start_line,
				endLine: comment.anchor.end_line,
				diffQuote: comment.anchor.quote,
				diffBody: comment.body,
				resolved: comment.resolved
			})),

			...annotations.suggestions.map((suggestion) => ({
				id: suggestion.id,
				kind: 'suggestion' as const,
				author: suggestion.author,
				quote: suggestion.original,
				body: suggestion.replacement,
				line: suggestion.anchor.start_line,
				endLine: suggestion.anchor.end_line,
				diffQuote: suggestion.original,
				diffBody: suggestion.replacement,
				applied: suggestion.applied,
				resolved: suggestion.resolved,
				status: suggestion.resolved
					? 'resolved' as const
					: suggestion.applied ? 'applied' as const : 'rejected' as const
			}))
		].sort((a, b) => a.line - b.line)
		: [];

	$: threads = [...persistedThreads, ...pendingEditThreads].sort((a, b) => a.line - b.line);
	$: visibleDocumentTabs = (
		editorMarkdown,
		baseMarkdown,
		pendingEditThreads,
		localMetadataDirty,
		saveState,
		externalChange,
		documentTabs.map((tab) => tab.id === activeDocumentTabId ? tabFromCurrentState(tab) : tab)
	);
	$: documentTitleLabel = localFileName || documentData?.fileName || 'Untitled.md';
	$: documentLocationLabel = nativeFilePath ? compactLocalPath(directoryPath(nativeFilePath)) : '';
	$: printAppendixCandidateThreads = threads.filter((thread) => !thread.resolved && thread.body.trim().length > 0);
	$: titlebarEyebrowPlaceholder = localFileMode
		&& !nativeFilePath
		&& !localFileHandle
		&& !lastPersistedSerializedMarkdown
		&& documentSessionKey.startsWith('local:untitled:');
	$: titlebarEyebrowLabel = documentLocationLabel || (titlebarEyebrowPlaceholder
		? 'Unsaved'
		: '');
	$: selectionReady = selectedQuote.trim().length > 0 && annotations;
	$: marginItems = layoutMarginItems(threads, selectedQuote, selectedLineTop, lineTops, annotationTops, cardHeights);
	$: stageHeight = Math.max(documentHeight, ...marginItems.map((item) => item.top + item.height + 24), 240);
	$: marginRailOpen = marginItems.length > 0;
	$: updateSaveProgressIndicator(saveState);
	$: localAuthor = appSettings.localUserName;

	$: if (mainEditor) {
		mainEditor.dispatch({
			effects: [
				setThreadsEffect.of(threads),
				setActiveThreadEffect.of(activeThreadId),
				setCommentAnchorEffect.of(selectedCommentAnchor)
			]
		});

		requestAnimationFrame(updateAnchorPositions);
	}

	onMount(() => {
		const searchParams = new URLSearchParams(window.location.search);
		const desktopPreview = searchParams.has('desktop-preview');
		const mobilePreview = searchParams.has('mobile-preview');

		tauriShell = Boolean((window as TauriWindow).__TAURI__);
		mobileShell = mobilePreview || (tauriShell && isIOSLikeWebView() && !desktopPreview);
		desktopShell = desktopPreview || (tauriShell && !mobileShell);
		const settingsReady = loadAppSettings();

		const nativeListenersReady = setupNativeDesktopListeners();
		const recentDocumentsReady = initializeRecentDocuments();
		if (desktopShell) {
			updateAutoCheckTimer = setTimeout(() => {
				updateAutoCheckTimer = null;
				checkForDesktopUpdate(false);
			}, 1800);
		}

		bootstrapStandaloneDocument(settingsReady, nativeListenersReady, recentDocumentsReady);
		window.addEventListener('resize', updateAnchorPositions);
		window.addEventListener('keydown', handleGlobalShortcut);
		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('resize', updateAnchorPositions);
			window.removeEventListener('keydown', handleGlobalShortcut);
			window.removeEventListener('beforeunload', handleBeforeUnload);
			clearLocalAutosaveTimer();
			clearSaveProgressTimers();
			clearUpdateAutoCheckTimer();
			clearCommentComposerAttention();
			unlistenNativeInsertMenu?.();
			unlistenNativeCommentMenu?.();
			unlistenNativeNewMenu?.();
			unlistenNativeOpenUrls?.();
			unlistenNativeOpenMenu?.();
			unlistenNativeOpenFolderMenu?.();
			unlistenNativeOpenRecentMenu?.();
			unlistenNativeClearRecentMenu?.();
			unlistenNativeSaveMenu?.();
			unlistenNativeSaveAsMenu?.();
			unlistenNativePrintMenu?.();
			unlistenNativeCloseTabMenu?.();
			unlistenNativePreviousTabMenu?.();
			unlistenNativeNextTabMenu?.();
			unlistenNativeSettingsMenu?.();
			unlistenNativeCheckUpdatesMenu?.();
			unlistenNativeOpenFindMenu?.();
			unlistenNativeOpenFindReplaceMenu?.();
			unlistenNativeFindNextMenu?.();
			unlistenNativeFindPreviousMenu?.();
			unlistenNativeToggleFileTreeMenu?.();
			unlistenNativeDocumentChanged?.();
			unlistenNativeDragDrop?.();
			nativeMenuBridgeReady = false;
		};
	});

	function isIOSLikeWebView() {
		const platform = navigator.platform || '';
		const userAgent = navigator.userAgent || '';

		return (/iPhone|iPad|iPod/i).test(userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	}

	async function bootstrapStandaloneDocument(
		settingsReady: Promise<void>,
		nativeListenersReady: Promise<void>,
		recentDocumentsReady: Promise<void>
	) {
		await settingsReady;
		await nativeListenersReady;
		await recentDocumentsReady;
		await flushPendingNativeOpenUrls();

		if (!documentData) createUntitledMarkdownDocument();
	}

	function activeEditorMarkdown() {
		return mainEditor?.state.doc.toString() ?? editorMarkdown;
	}

	function tabFromCurrentState(previous?: DocumentTab): DocumentTab {
		const markdown = activeEditorMarkdown();

		const nextDocumentData = documentData
			? { ...documentData, markdown }
			: previous?.documentData ?? {
				id: documentSessionKey,
				fileName: 'Untitled.md',
				markdown
			};

		return {
			id: previous?.id ?? (activeDocumentTabId || documentSessionKey),
			title: nextDocumentData.fileName,
			documentData: nextDocumentData,
			annotations,
			editorMarkdown: markdown,
			baseMarkdown,
			draftBaseMarkdown,
			pendingEditThreads,
			draftChanges,
			editMode,
			localFileMode,
			localFileHandle,
			localFileName,
			localMetadataDirty,
			nativeFilePath,
			lastPersistedSerializedMarkdown,
			externalChange,
			saveState,
			saveMessage,
			documentSessionKey,
			syncedEditKeys: [...syncedEditKeys]
		};
	}

	function syncActiveDocumentTab() {
		if (!activeDocumentTabId || !documentData) return;

		const nextTab = tabFromCurrentState();
		const existingIndex = documentTabs.findIndex((tab) => tab.id === activeDocumentTabId);

		if (existingIndex >= 0) {
			documentTabs = [
				...documentTabs.slice(0, existingIndex),
				nextTab,
				...documentTabs.slice(existingIndex + 1)
			];
		} else {
			documentTabs = [...documentTabs, nextTab];
		}
	}

	async function activateDocumentTab(tabId: string) {
		if (tabId === activeDocumentTabId) return;

		await flushLocalAutosave();
		syncActiveDocumentTab();

		const nextTab = documentTabs.find((tab) => tab.id === tabId);

		if (!nextTab) return;

		await applyDocumentTab(nextTab);
	}

	async function closeDocumentTab(tabId: string, options: { discard?: boolean } = {}) {
		if (tabId === activeDocumentTabId) await flushLocalAutosave();

		syncActiveDocumentTab();

		const tabIndex = documentTabs.findIndex((tab) => tab.id === tabId);

		if (tabIndex < 0) return;

		const tab = documentTabs[tabIndex];

		if (!options.discard && tabHasDiscardableWork(tab) && !(await confirmDiscardTabClose(tab))) {
			return;
		}

		if (documentTabs.length <= 1) {
			if (await quitDesktopApp()) {
				return;
			}

			createUntitledMarkdownDocument({ replaceActive: true });

			return;
		}

		const nextTabs = documentTabs.filter((candidate) => candidate.id !== tabId);

		documentTabs = nextTabs;

		if (tabId === activeDocumentTabId) {
			const nextTab = nextTabs[Math.max(0, tabIndex - 1)] ?? nextTabs[0];

			if (nextTab) await applyDocumentTab(nextTab);
		}
	}

	async function confirmDiscardTabClose(tab: DocumentTab) {
		if (desktopShell) {
			const request = tauriInvoke<boolean>('confirm_close_tab', { title: tab.title });

			if (request) {
				try {
					return await request;
				} catch(err) {
					console.warn('Unable to show native close confirmation', err);

					return false;
				}
			}
		}

		return window.confirm(`Close ${tab.title}? Unsaved work in this tab will be discarded.`);
	}

	async function quitDesktopApp() {
		if (!desktopShell) return false;

		const request = tauriInvoke<void>('quit_app');

		if (!request) return false;

		try {
			await request;

			return true;
		} catch(err) {
			console.warn('Unable to quit desktop app', err);

			return false;
		}
	}

	async function closeActiveDocumentTab() {
		if (!activeDocumentTabId) return;

		await closeDocumentTab(activeDocumentTabId);
	}

	async function activateAdjacentDocumentTab(direction: -1 | 1) {
		syncActiveDocumentTab();

		if (documentTabs.length <= 1) return;

		const activeIndex = Math.max(0, documentTabs.findIndex((tab) => tab.id === activeDocumentTabId));
		const nextIndex = (activeIndex + direction + documentTabs.length) % documentTabs.length;

		await applyDocumentTab(documentTabs[nextIndex]);
	}

	function tabHasDiscardableWork(tab: DocumentTab) {
		return tab.saveState === 'dirty' || tab.saveState === 'conflict' || tab.pendingEditThreads.length > 0 || tab.editorMarkdown !== tab.baseMarkdown || tab.localMetadataDirty && Boolean((tab.annotations?.comments.length ?? 0) + (tab.annotations?.suggestions.length ?? 0));
	}

	async function applyDocumentTab(nextTab: DocumentTab) {
		clearLocalAutosaveTimer();
		activeDocumentTabId = nextTab.id;
		documentData = { ...nextTab.documentData, markdown: nextTab.editorMarkdown };
		annotations = nextTab.annotations;
		editorMarkdown = nextTab.editorMarkdown;
		baseMarkdown = nextTab.baseMarkdown;
		draftBaseMarkdown = nextTab.draftBaseMarkdown || nextTab.baseMarkdown;
		pendingEditThreads = nextTab.pendingEditThreads;
		draftChanges = nextTab.draftChanges;
		editMode = nextTab.editMode;
		localFileMode = nextTab.localFileMode;
		localFileHandle = nextTab.localFileHandle;
		localFileName = nextTab.localFileName;
		localMetadataDirty = nextTab.localMetadataDirty;
		nativeFilePath = nextTab.nativeFilePath;
		lastPersistedSerializedMarkdown = nextTab.lastPersistedSerializedMarkdown;
		externalChange = nextTab.externalChange;
		saveState = nextTab.saveState;
		saveMessage = nextTab.saveMessage;
		documentSessionKey = nextTab.documentSessionKey;
		activeThreadId = '';
		selectedQuote = '';
		selectionQuote = '';
		selectedCommentAnchor = null;
		selectionCommentAnchor = null;
		commentBody = '';
		clearCommentEdit();
		clearCommentComposerAttention();
		syncedEditKeys.clear();

		for (const key of nextTab.syncedEditKeys) syncedEditKeys.add(key);

		scheduleLocalAutosave();
		await tick();
		updateAnchorPositions();
	}

	function buildLivePreviewDecorations(
		state: EditorState,
		activeThreads: ThreadView[],
		focusedThreadId: string,
		activeCommentAnchor: CommentSelectionAnchor | null
	) {
		const ranges: Range<Decoration>[] = [];
		const frontmatterBlocks = markdownFrontmatterBlocks(state);
		const fencedBlocks = fencedCodeBlocks(state);
		const tableBlocks = markdownTableBlocks(state);
		const mathBlocks = markdownMathBlocks(state, [
			...frontmatterBlocks,
			...fencedBlocks,
			...tableBlocks
		]);
		const ignoredContainerBlocks = [
			...frontmatterBlocks,
			...fencedBlocks,
			...tableBlocks,
			...mathBlocks
		];
		const headingModel = markdownHeadingModel(state, ignoredContainerBlocks);
		const orderedListMarkers = markdownOrderedListMarkers(state, ignoredContainerBlocks);
		const listModel = markdownListModel(state, orderedListMarkers, ignoredContainerBlocks);
		const activeBlocks = activeSourceBlocksForSelection(state, frontmatterBlocks, fencedBlocks, tableBlocks, mathBlocks, listModel);
		const activeHeadingControlLines = activeHeadingControlLineNumbers(state, headingModel);
		const activeListControlLines = activeListControlLineNumbers(state, listModel);
		const selectionLineNumber = state.doc.lineAt(state.selection.main.head).number;

		for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
			const line = state.doc.line(lineNumber);
			const text = line.text;
			const activeBlock = blockForLine(activeBlocks, line.number);
			const active = Boolean(activeBlock);
			const activeClass = activeBlock ? activeSourceClass(activeBlock, line.number) : '';
			const activeAttributes = activeBlock ? activeSourceLineAttributes(activeBlock) : undefined;
			const frontmatterBlock = blockForLine(frontmatterBlocks, line.number);
			const fencedBlock = blockForLine(fencedBlocks, line.number);
			const tableBlock = blockForLine(tableBlocks, line.number);
			const mathBlock = blockForLine(mathBlocks, line.number);

			if (headingModel.collapsedAncestorByLine.has(line.number)) {
				ranges.push(Decoration.line({
					class: 'cm-collapsed-heading-hidden-line'
				}).range(line.from));

				continue;
			}

			if (listModel.collapsedAncestorByLine.has(line.number)) {
				ranges.push(Decoration.line({
					class: 'cm-collapsed-list-hidden-line'
				}).range(line.from));

				continue;
			}

			if (activeBlock) {
				addActiveListBaseIndentHider(ranges, line, activeBlock);
				if (activeBlock.kind !== 'list') addSourceIndentGuides(ranges, line, activeBlock);
			}

			if (
				text.trim() === ''
				&& line.number !== selectionLineNumber
				&& (
					blockImageLineAt(state, line.number - 1)
					|| blockImageLineAt(state, line.number + 1)
				)
			) {
				ranges.push(Decoration.line({
					class: 'cm-live-image-adjacent-blank-line'
				}).range(line.from));

				continue;
			}

			if (frontmatterBlock?.frontmatter) {
				if (active) {
					ranges.push(Decoration.line({
						class: `cm-live-frontmatter-source-line ${activeClass}`,
						attributes: activeAttributes
					}).range(line.from));
					addFrontmatterFenceSourceSyntax(ranges, line);

					continue;
				}

				if (line.number === frontmatterBlock.start) {
					const blockEnd = state.doc.line(frontmatterBlock.end);

					ranges.push(Decoration.replace({
						widget: new FrontmatterWidget(frontmatterBlock.frontmatter, frontmatterBlock.start),
						block: true
					}).range(line.from, blockEnd.to));

					lineNumber = frontmatterBlock.end;
				}

				continue;
			}

			if (fencedBlock) {
				const boundary = line.number === fencedBlock.start || line.number === fencedBlock.end;
				const emptyCodeBlock = fencedBlock.end === fencedBlock.start + 1;
				const listContext = active ? null : markdownListContainerInfo(state, fencedBlock.start, listModel);

				const classes = active
					? `cm-live-codeblock-line ${activeClass}`
					: boundary
						? `cm-live-code-fence-hidden-line${emptyCodeBlock && line.number === fencedBlock.start
							? ' cm-live-code-fence-empty-start'
							: ''}${listContext ? ' cm-live-codeblock-nested' : ''}`
						: `cm-live-codeblock-line${listContext ? ' cm-live-codeblock-nested' : ''}`;

				ranges.push(Decoration.line({
					class: classes,
					attributes: active ? activeAttributes : listContext ? markdownCodeBlockAttributes(listContext) : undefined
				}).range(line.from));

				if (active && boundary) {
					addCodeFenceSourceSyntax(ranges, line);
				}

				if (!active && boundary && line.from < line.to) {
					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(line.from, line.to));
				}

				if (!active && listContext && !boundary) {
					const sourceIndentLength = sourceMarkdownIndentLengthForWidth(line.text, listContext.sourceIndentWidth);

					if (sourceIndentLength > 0) {
						ranges.push(Decoration.mark({
							class: 'cm-markdown-syntax-hidden'
						}).range(line.from, line.from + sourceIndentLength));
					}
				}

				if (!active && line.number === fencedBlock.start && fencedBlock.language) {
					ranges.push(Decoration.widget({
						widget: new CodeLanguageLabelWidget(fencedBlock.language),
						side: 1
					}).range(line.to));
				}

				continue;
			}

			if (tableBlock?.table) {
				if (active) {
					ranges.push(Decoration.line({
						class: `cm-live-table-source-line ${activeClass}`,
						attributes: activeAttributes
					}).range(line.from));
					addTableSourceSyntax(ranges, line, line.number === tableBlock.start + 1);
					addInlineMarkdownSourceSyntax(ranges, line);

					continue;
				}

				if (line.number === tableBlock.start) {
					const blockEnd = state.doc.line(tableBlock.end);

					ranges.push(Decoration.replace({
						widget: new MarkdownTableWidget(tableBlock.table, tableBlock.start),
						block: true
					}).range(line.from, blockEnd.to));

					lineNumber = tableBlock.end;
				}

				continue;
			}

			if (mathBlock?.math) {
				if (active) {
					ranges.push(Decoration.line({
						class: `cm-live-math-source-line ${activeClass}`,
						attributes: activeAttributes
					}).range(line.from));
					addDisplayMathSourceSyntax(ranges, line);

					continue;
				}

				if (line.number === mathBlock.start) {
					const blockEnd = state.doc.line(mathBlock.end);
					const singleLine = mathBlock.start === mathBlock.end;

					ranges.push(Decoration.replace({
						widget: new MarkdownMathWidget(mathBlock.math.source, true, mathBlock.start, line.from),
						block: !singleLine
					}).range(line.from, blockEnd.to));

					lineNumber = mathBlock.end;
				}

				continue;
			}

			const heading = markdownHeadingLine(text);
			const blockquote = (/^([ \t]{0,3}>[ \t]?)(.*)/).exec(text);
			const footnoteDefinition = footnoteDefinitionMatch(text);
			const imageLine = markdownImageOnly(text);

			if (blockquote) {
				const markerEnd = blockquote[1].length;

				ranges.push(Decoration.line({
					class: `cm-live-blockquote-line${active ? ` ${activeClass}` : ''}`,
					attributes: activeAttributes
				}).range(line.from));

				if (active) {
					ranges.push(Decoration.mark({
						class: 'cm-markdown-source-syntax cm-markdown-blockquote-syntax'
					}).range(line.from, line.from + markerEnd));
					addInlineMarkdownSourceSyntax(ranges, line, markerEnd);
				}

				if (!active) {
					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(line.from, line.from + markerEnd));
					addInlineMarkdownPreview(ranges, line, markerEnd);
				}

				continue;
			}

			if (footnoteDefinition) {
				const idStart = footnoteDefinition[1].length + 2;
				const idEnd = idStart + footnoteDefinition[2].length;
				const contentOffset = footnoteDefinition[0].length - footnoteDefinition[4].length;

				ranges.push(Decoration.line({
					class: `cm-live-footnote-definition${active ? ` ${activeClass}` : ''}`,
					attributes: activeAttributes
				}).range(line.from));

				if (active) {
					ranges.push(Decoration.mark({
						class: 'cm-markdown-source-syntax cm-markdown-footnote-syntax'
					}).range(line.from + footnoteDefinition[1].length, line.from + contentOffset));
					addInlineMarkdownSourceSyntax(ranges, line, contentOffset);
				}

				if (!active) {
					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(line.from + footnoteDefinition[1].length, line.from + idStart));
					ranges.push(Decoration.mark({
						class: 'cm-live-footnote-ref',
						attributes: footnoteReferenceAttributes(footnoteDefinition[2])
					}).range(line.from + idStart, line.from + idEnd));
					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(line.from + idEnd, line.from + contentOffset));
					addInlineMarkdownPreview(ranges, line, contentOffset);
				}

				continue;
			}

			if (imageLine) {
				if (active) {
					ranges.push(Decoration.line({
						class: `cm-live-image-source-line ${activeClass}`,
						attributes: mergeDecorationAttributes(
							markdownImagePlaceholderAttributes(imageLine),
							activeAttributes
						)
					}).range(line.from));
					addInlineMarkdownSourceSyntax(ranges, line);
				} else {
					ranges.push(Decoration.replace({
						widget: new MarkdownImageWidget(imageLine, line.number, line.from, line.to, true),
						block: true
					}).range(line.from, line.to));
				}

				continue;
			}

			if (isHorizontalRuleLine(text)) {
				if (active) {
					ranges.push(Decoration.line({
						class: activeClass,
						attributes: activeAttributes
					}).range(line.from));
				} else {
					ranges.push(Decoration.replace({
						widget: new HorizontalRuleWidget(line.number),
						block: true
					}).range(line.from, line.to));
				}

				continue;
			}

			if (heading) {
				const item = headingModel.items.get(line.number);
				const headingFoldable = Boolean(item && item.blockEnd > line.number);
				const headingCollapseKey = headingFoldable ? item?.collapseKey ?? '' : '';
				const headingCollapsed = headingCollapseKey ? collapsedHeadingKeys.has(headingCollapseKey) : false;
				const headingControlsVisible = activeHeadingControlLines.has(line.number);

				ranges.push(Decoration.line({
					class: `cm-live-heading cm-live-heading-${heading.level}${headingFoldable
						? ' cm-live-heading-foldable'
						: ''}${headingControlsVisible
						? ' cm-live-heading-controls-visible'
						: ''}${headingCollapsed
						? ' cm-live-heading-collapsed'
						: ''}${active
						? ` ${activeClass}`
						: ''}`,
					attributes: activeAttributes
				}).range(line.from));

				if (headingCollapseKey) {
					ranges.push(Decoration.widget({
						widget: new HeadingCollapseToggleWidget(headingCollapseKey, headingCollapsed, line.number),
						side: -1
					}).range(line.from));
				}

				if (active) {
					ranges.push(Decoration.mark({
						class: 'cm-markdown-source-syntax cm-markdown-heading-syntax'
					}).range(line.from, line.from + heading.syntaxLength));
					addInlineMarkdownSourceSyntax(ranges, line, heading.syntaxLength);
				}

				if (!active) {
					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(line.from, line.from + heading.syntaxLength));
					addInlineMarkdownPreview(ranges, line, heading.syntaxLength);
				}

				continue;
			}

			const task = (/^(\s*)((?:[-*+])|(?:\d+[.)]))(\s+)\[([ xX])\](\s+)(.*)/).exec(text);

			if (task) {
				const markerStart = line.from + task[1].length;
				const checkPosition = markerStart + task[2].length + task[3].length + 1;
				const syntaxEnd = checkPosition + 2 + task[5].length;
				const contentOffset = syntaxEnd - line.from;
				const checked = task[4].toLowerCase() === 'x';
				const taskItem = listModel.items.get(line.number);
				const taskInfo = taskItem?.info ?? listInfo(line.text);
				const taskHasChildren = Boolean(taskItem?.childLines.length);
				const taskCollapseKey = taskItem?.collapseKey ?? '';
				const taskCollapsed = taskCollapseKey ? collapsedListItemKeys.has(taskCollapseKey) : false;
				const taskControlsVisible = activeListControlLines.has(line.number);
				const taskLayout = taskItem?.layout
					?? markdownListLayoutForItem(taskInfo ?? markdownListInfoFallback(task[1], task[2]), null, orderedListMarkers.get(line.number) ?? task[2]);

				ranges.push(Decoration.line({
					class: `${markdownListLineClass(taskLayout)} cm-live-task-line ${checked ? 'cm-task-checked' : 'cm-task-open'}${taskHasChildren ? ' cm-live-list-parent' : ''}${taskControlsVisible ? ' cm-live-list-controls-visible' : ''}${taskCollapsed ? ' cm-live-list-collapsed' : ''}${active ? ` ${activeClass}` : ''}`,
					attributes: mergeDecorationAttributes(
						markdownListLineAttributes(taskLayout),
						activeAttributes
					)
				}).range(line.from));

				if (taskCollapseKey) {
					ranges.push(Decoration.widget({
						widget: new ListCollapseToggleWidget(taskCollapseKey, taskCollapsed, line.number),
						side: -1
					}).range(line.from));
				}

				if (active) {
					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden cm-markdown-list-source-prefix' }).range(line.from, syntaxEnd));
					ranges.push(Decoration.widget({
						widget: new TaskCheckboxWidget(checked, checkPosition),
						side: -1
					}).range(markerStart));
					addInlineMarkdownSourceSyntax(ranges, line, contentOffset);
				}

				if (!active) {
					if (line.from < markerStart) {
						ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(line.from, markerStart));
					}

					ranges.push(Decoration.widget({
						widget: new TaskCheckboxWidget(checked, checkPosition),
						side: -1
					}).range(markerStart));

					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(markerStart, syntaxEnd));
					addInlineMarkdownPreview(ranges, line, contentOffset);
				}

				continue;
			}

			const list = (/^(\s*)((?:[-*+])|(?:\d+[.)]))(\s+)(.*)/).exec(text);

			if (list) {
				const markerStart = line.from + list[1].length;
				const syntaxEnd = markerStart + list[2].length + list[3].length;
				const item = listModel.items.get(line.number);
				const itemInfo = item?.info ?? listInfo(line.text);
				const itemHasChildren = Boolean(item?.childLines.length);
				const itemCollapseKey = item?.collapseKey ?? '';
				const itemCollapsed = itemCollapseKey ? collapsedListItemKeys.has(itemCollapseKey) : false;
				const itemControlsVisible = activeListControlLines.has(line.number);
				const itemLayout = item?.layout
					?? markdownListLayoutForItem(itemInfo ?? markdownListInfoFallback(list[1], list[2]), null, orderedListMarkers.get(line.number) ?? list[2]);

				ranges.push(Decoration.line({
					class: `${markdownListLineClass(itemLayout)}${itemHasChildren ? ' cm-live-list-parent' : ''}${itemControlsVisible ? ' cm-live-list-controls-visible' : ''}${itemCollapsed ? ' cm-live-list-collapsed' : ''}${active ? ` ${activeClass}` : ''}`,
					attributes: mergeDecorationAttributes(
						markdownListLineAttributes(itemLayout),
						activeAttributes
					)
				}).range(line.from));

				if (itemCollapseKey) {
					ranges.push(Decoration.widget({
						widget: new ListCollapseToggleWidget(itemCollapseKey, itemCollapsed, line.number),
						side: -1
					}).range(line.from));
				}

				if (active) {
					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden cm-markdown-list-source-prefix' }).range(line.from, syntaxEnd));
					addInlineMarkdownSourceSyntax(ranges, line, list[1].length + list[2].length + list[3].length);
				}

				if (!active) {
					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(line.from, syntaxEnd));
					addInlineMarkdownPreview(ranges, line, list[1].length + list[2].length + list[3].length);
				}

				continue;
			}

			const indentedCode = active ? null : markdownIndentedCodeInfo(state, line.number, listModel);

			if (indentedCode) {
				ranges.push(Decoration.line({
					class: `cm-live-codeblock-line${indentedCode.visualIndent > 0 ? ' cm-live-codeblock-nested' : ''}`,
					attributes: markdownCodeBlockAttributes(indentedCode)
				}).range(line.from));

				if (indentedCode.sourceIndentLength > 0) {
					ranges.push(Decoration.mark({
						class: 'cm-markdown-syntax-hidden'
					}).range(line.from, line.from + indentedCode.sourceIndentLength));
				}

				continue;
			}

			const listContinuation = active ? null : markdownListContinuationInfo(state, line.number, listModel);

			if (listContinuation) {
				ranges.push(Decoration.line({
					class: 'cm-live-list-continuation-line',
					attributes: markdownListContinuationAttributes(listContinuation)
				}).range(line.from));

				if (listContinuation.sourceIndentLength > 0) {
					ranges.push(Decoration.mark({
						class: 'cm-markdown-syntax-hidden'
					}).range(line.from, line.from + listContinuation.sourceIndentLength));
				}

				addInlineMarkdownPreview(ranges, line, listContinuation.sourceIndentLength);

				continue;
			}

			if (active) {
				ranges.push(Decoration.line({
					class: activeClass,
					attributes: activeAttributes
				}).range(line.from));
				addInlineMarkdownSourceSyntax(ranges, line);
			} else {
				addInlineMarkdownPreview(ranges, line);
			}
		}

		for (const thread of activeThreads) {
			const range = threadRangeInState(state, thread);

			if (!range) continue;

			const focused = focusedThreadId === thread.id ? ' is-focused' : '';
			const statusClass = thread.status ? ` is-${thread.status}` : '';
			const pendingClass = thread.pending ? ' pending' : '';
			const threadClass = `annotation-mark ${thread.kind === 'suggestion' ? 'suggestion' : ''}${pendingClass}${statusClass}${focused}`;
			const shouldReplaceQuote = thread.kind === 'suggestion' && thread.status !== 'rejected' && range.matched === 'quote';

			if (thread.kind === 'suggestion' && range.matched === 'deletion') {
				const kind = suggestionSurfaceKind(thread);

				ranges.push(Decoration.widget({
					widget: new SuggestionBadgeWidget(thread.id, suggestionAffordanceLabel(thread), thread.pending, thread.status ?? 'applied', focusedThreadId === thread.id, kind),
					side: 1
				}).range(range.from));

				continue;
			}

			if (shouldReplaceQuote) {
				const kind = suggestionSurfaceKind(thread);

				ranges.push(Decoration.replace({
					widget: new SuggestionWidget(thread.body, thread.id, thread.pending, thread.status ?? 'applied', focusedThreadId === thread.id, suggestionAffordanceLabel(thread), kind),
					inclusive: false
				}).range(range.from, range.to));
			} else {
				ranges.push(Decoration.mark({
					class: threadClass,
					attributes: { 'data-thread-anchor': thread.id }
				}).range(range.from, range.to));

				if (thread.kind === 'suggestion' && thread.status !== 'rejected') {
					const kind = suggestionSurfaceKind(thread);

					ranges.push(Decoration.widget({
						widget: new SuggestionBadgeWidget(thread.id, suggestionAffordanceLabel(thread), thread.pending, thread.status ?? 'applied', focusedThreadId === thread.id, kind),
						side: 1
					}).range(range.to));
				}
			}
		}

		const activeCommentRange = activeCommentAnchor ? commentAnchorRangeInState(state, activeCommentAnchor) : null;

		if (activeCommentRange) {
			ranges.push(Decoration.mark({
				class: 'annotation-mark composer-selection'
			}).range(activeCommentRange.from, activeCommentRange.to));
		}

		return Decoration.set(ranges, true);
	}

	function activeSourceBlocksForSelection(
		state: EditorState,
		frontmatterBlocks: SourceBlock[],
		fencedBlocks: SourceBlock[],
		tableBlocks: SourceBlock[],
		mathBlocks: SourceBlock[],
		listModel: MarkdownListModel
	) {
		const blocks: SourceBlock[] = [];

		for (const range of state.selection.ranges) {
			const from = range.from;
			const endPosition = range.empty ? range.head : Math.max(range.from, range.to - 1);
			const startLine = state.doc.lineAt(from).number;
			const endLine = state.doc.lineAt(endPosition).number;

			for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
				const block = sourceBlockForLine(state, lineNumber, frontmatterBlocks, fencedBlocks, tableBlocks, mathBlocks, listModel);

				if (!blocks.some((existing) => sameSourceBlock(existing, block))) {
					blocks.push(block);
				}

				lineNumber = Math.max(lineNumber, block.end);
			}
		}

		return blocks;
	}

	function sameSourceBlock(left: SourceBlock, right: SourceBlock) {
		return left.kind === right.kind
			&& left.start === right.start
			&& left.end === right.end
			&& (left.listEditBaseSourceIndent ?? -1) === (right.listEditBaseSourceIndent ?? -1)
			&& (left.listEditBaseVisualIndent ?? -1) === (right.listEditBaseVisualIndent ?? -1);
	}

	function sourceBlockForLine(
		state: EditorState,
		lineNumber: number,
		frontmatterBlocks: SourceBlock[],
		fencedBlocks: SourceBlock[],
		tableBlocks: SourceBlock[],
		mathBlocks: SourceBlock[],
		listModel: MarkdownListModel
	): SourceBlock {
		const frontmatterBlock = blockForLine(frontmatterBlocks, lineNumber);

		if (frontmatterBlock) return frontmatterBlock;

		const fencedBlock = blockForLine(fencedBlocks, lineNumber);

		if (fencedBlock) return fencedBlock;

		const tableBlock = blockForLine(tableBlocks, lineNumber);

		if (tableBlock) return tableBlock;

		const mathBlock = blockForLine(mathBlocks, lineNumber);

		if (mathBlock) return mathBlock;

		const listBlock = activeListBlockForLine(state, lineNumber, listModel);

		if (listBlock) return listBlock;

		const indentedBlock = indentedBlockForLine(state, lineNumber);

		if (indentedBlock) return indentedBlock;

		return { start: lineNumber, end: lineNumber, kind: 'line' };
	}

	function activeListBlockForLine(state: EditorState, lineNumber: number, listModel: MarkdownListModel): SourceBlock | null {
		const item = listModel.ownerByLine.get(lineNumber);

		if (!item) return null;

		const line = state.doc.line(lineNumber);

		if (!line.text.trim() && leadingIndent(line.text) < item.info.contentIndent) return null;

		const itemBlock: SourceBlock = {
			start: item.lineNumber,
			end: item.blockEnd,
			kind: 'list'
		};

		if (item.info.indent === 0 || item.parentLine === null) return itemBlock;

		const parent = listModel.items.get(item.parentLine);

		if (!parent) return itemBlock;

		const start = parent.lineNumber + 1;
		const end = parent.blockEnd;

		if (start > end) return itemBlock;

		return {
			start,
			end,
			kind: 'list',
			listEditBaseSourceIndent: item.info.indent,
			listEditBaseVisualIndent: parent.layout.textX
		};
	}

	function activeListControlLineNumbers(state: EditorState, listModel: MarkdownListModel) {
		const lines = new Set<number>();

		for (const range of state.selection.ranges) {
			const endPosition = range.empty ? range.head : Math.max(range.from, range.to - 1);
			const startLine = state.doc.lineAt(range.from).number;
			const endLine = state.doc.lineAt(endPosition).number;

			for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
				const item = listModel.ownerByLine.get(lineNumber);

				if (!item) continue;

				const root = rootMarkdownListItem(item, listModel);

				for (const candidate of listModel.items.values()) {
					if (
						candidate.childLines.length > 0
						&& candidate.lineNumber >= root.lineNumber
						&& candidate.lineNumber <= root.blockEnd
						&& !listModel.collapsedAncestorByLine.has(candidate.lineNumber)
					) {
						lines.add(candidate.lineNumber);
					}
				}
			}
		}

		return lines;
	}

	function activeHeadingControlLineNumbers(state: EditorState, headingModel: MarkdownHeadingModel) {
		const lines = new Set<number>();

		for (const range of state.selection.ranges) {
			const endPosition = range.empty ? range.head : Math.max(range.from, range.to - 1);
			const startLine = state.doc.lineAt(range.from).number;
			const endLine = state.doc.lineAt(endPosition).number;

			for (const heading of headingModel.items.values()) {
				if (
					heading.blockEnd <= heading.lineNumber
					|| heading.blockEnd < startLine
					|| heading.lineNumber > endLine
					|| headingModel.collapsedAncestorByLine.has(heading.lineNumber)
				) {
					continue;
				}

				lines.add(heading.lineNumber);
			}
		}

		return lines;
	}

	function rootMarkdownListItem(item: MarkdownListItem, listModel: MarkdownListModel) {
		let root = item;

		while (root.parentLine !== null) {
			const parent = listModel.items.get(root.parentLine);

			if (!parent) break;

			root = parent;
		}

		return root;
	}

	function activeSourceClass(block: SourceBlock, lineNumber: number) {
		const listSubtree = typeof block.listEditBaseVisualIndent === 'number'
			? ' cm-active-list-subtree-line'
			: '';

		if (block.start === block.end) return `cm-active-source-line${listSubtree}`;

		const edge = lineNumber === block.start
			? 'cm-active-block-start'
			: lineNumber === block.end ? 'cm-active-block-end' : 'cm-active-block-middle';

		return `cm-active-source-line cm-active-block-line ${edge}${listSubtree}`;
	}

	function activeSourceLineAttributes(block: SourceBlock) {
		if (typeof block.listEditBaseVisualIndent !== 'number') return undefined;

		return {
			style: `--active-list-base-indent: ${block.listEditBaseVisualIndent}px;`
		};
	}

	function addActiveListBaseIndentHider(ranges: Range<Decoration>[], line: Line, block: SourceBlock) {
		if (typeof block.listEditBaseSourceIndent !== 'number') return;

		const length = sourceMarkdownIndentLengthForWidth(line.text, block.listEditBaseSourceIndent);

		if (length <= 0) return;

		ranges.push(Decoration.mark({
			class: 'cm-active-list-base-indent'
		}).range(line.from, line.from + length));
	}

	function addSourceIndentGuides(ranges: Range<Decoration>[], line: Line, block: SourceBlock) {
		const baseIndent = block.listEditBaseSourceIndent ?? 0;

		for (const offset of sourceIndentGuideOffsets(line.text, baseIndent)) {
			ranges.push(Decoration.widget({
				widget: new SourceIndentGuideWidget(),
				side: -1
			}).range(line.from + offset));
		}
	}

	function sourceIndentGuideOffsets(text: string, baseIndent = 0) {
		const offsets: number[] = [];
		let width = 0;

		for (let index = 0; index < text.length; index += 1) {
			const character = text[index];

			if (character !== ' ' && character !== '\t') break;

			if (width >= baseIndent && (width - baseIndent) % 4 === 0) offsets.push(index);

			width += character === '\t' ? 4 : 1;
		}

		return offsets;
	}

	function lineInBlock(lineNumber: number, block: SourceBlock) {
		return lineNumber >= block.start && lineNumber <= block.end;
	}

	function blockForLine(blocks: SourceBlock[], lineNumber: number) {
		return blocks.find((block) => lineInBlock(lineNumber, block)) ?? null;
	}

	function markdownHeadingLine(text: string): MarkdownHeadingLine | null {
		const match = (/^(#{1,6})(\s+)(.*)/).exec(text);

		if (!match) return null;

		return {
			level: match[1].length,
			text: match[3].trim(),
			syntaxLength: match[1].length + match[2].length
		};
	}

	function markdownHeadingModelForState(state: EditorState) {
		return markdownHeadingModel(state, [
			...markdownFrontmatterBlocks(state),
			...fencedCodeBlocks(state),
			...markdownTableBlocks(state)
		]);
	}

	function markdownHeadingModel(state: EditorState, ignoredBlocks: SourceBlock[] = []): MarkdownHeadingModel {
		const ignoredLines = ignoredLineNumbers(ignoredBlocks);
		const headings: MarkdownHeading[] = [];
		const items = new Map<number, MarkdownHeading>();
		const collapsedAncestorByLine = new Map<number, number>();

		for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
			if (ignoredLines.has(lineNumber)) continue;

			const line = state.doc.line(lineNumber);
			const heading = markdownHeadingLine(line.text);

			if (!heading) continue;

			headings.push({
				blockEnd: state.doc.lines,
				collapseKey: markdownHeadingCollapseKey(state, lineNumber),
				level: heading.level,
				lineNumber,
				text: heading.text
			});
		}

		for (let index = 0; index < headings.length; index += 1) {
			const heading = headings[index];

			for (let nextIndex = index + 1; nextIndex < headings.length; nextIndex += 1) {
				const nextHeading = headings[nextIndex];

				if (nextHeading.level <= heading.level) {
					heading.blockEnd = nextHeading.lineNumber - 1;
					break;
				}
			}

			items.set(heading.lineNumber, heading);
		}

		for (const heading of headings) {
			if (heading.blockEnd <= heading.lineNumber || !collapsedHeadingKeys.has(heading.collapseKey)) continue;

			for (let lineNumber = heading.lineNumber + 1; lineNumber <= heading.blockEnd; lineNumber += 1) {
				if (!collapsedAncestorByLine.has(lineNumber)) {
					collapsedAncestorByLine.set(lineNumber, heading.lineNumber);
				}
			}
		}

		return { collapsedAncestorByLine, items };
	}

	function fencedCodeBlocks(state: EditorState): SourceBlock[] {
		const blocks: SourceBlock[] = [];
		let openFence: { line: number; fence: MarkdownFenceInfo } | null = null;

		for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
			const text = state.doc.line(lineNumber).text;

			if (openFence) {
				if (isClosingMarkdownFence(text, openFence.fence)) {
					blocks.push({
						start: openFence.line,
						end: lineNumber,
						kind: 'fenced-code',
						language: openFence.fence.language
					});
					openFence = null;
				}

				continue;
			}

			const fence = openingMarkdownFence(text);

			if (fence) openFence = { line: lineNumber, fence };
		}

		if (openFence) {
			blocks.push({
				start: openFence.line,
				end: state.doc.lines,
				kind: 'fenced-code',
				language: openFence.fence.language
			});
		}

		return blocks;
	}

	function markdownFrontmatterBlocks(state: EditorState): SourceBlock[] {
		if (state.doc.lines < 2) return [];

		const opening = state.doc.line(1);

		if (!isFrontmatterBoundaryLine(opening.text)) return [];

		for (let lineNumber = 2; lineNumber <= state.doc.lines; lineNumber += 1) {
			const line = state.doc.line(lineNumber);

			if (!isFrontmatterBoundaryLine(line.text) && !isFrontmatterClosingLine(line.text)) continue;

			const rawLines: string[] = [];

			for (let contentLine = 2; contentLine < lineNumber; contentLine += 1) {
				rawLines.push(state.doc.line(contentLine).text);
			}

			return [{
				start: 1,
				end: lineNumber,
				kind: 'frontmatter',
				frontmatter: parseFrontmatter(rawLines)
			}];
		}

		return [];
	}

	function blockImageLineAt(state: EditorState, lineNumber: number) {
		if (lineNumber < 1 || lineNumber > state.doc.lines) return false;

		return Boolean(markdownImageOnly(state.doc.line(lineNumber).text));
	}

	function resolveMarkdownImageSrc(src: string) {
		const safeSrc = src.trim();

		if (!safeSrc || (/^javascript:/i).test(safeSrc)) return '';
		if (isExternalImageSource(safeSrc)) return safeSrc;

		const imagePath = localImagePathForMarkdownSource(safeSrc);

		if (!imagePath) return safeSrc;

		return tauriFileSrc(imagePath);
	}

	function applyMarkdownImageSize(imageElement: HTMLImageElement, image: MarkdownImage) {
		const width = markdownImageSizeCss(image.attrs.width);
		const height = markdownImageSizeCss(image.attrs.height);

		if (width) imageElement.style.width = width;
		if (height) imageElement.style.height = height;
	}

	function isExternalImageSource(src: string) {
		return (/^(?:https?:|blob:|data:image\/)/i).test(src);
	}

	function localImagePathForMarkdownSource(src: string) {
		if (src.startsWith('file://')) return filePathFromFileUrl(new URL(src));
		if (isAbsoluteLocalPath(src)) return normalizePathSeparators(src);
		if (!nativeFilePath) return '';

		return joinLocalPath(directoryPath(nativeFilePath), src);
	}

	function tauriFileSrc(path: string) {
		const convertFileSrc = (window as TauriWindow).__TAURI__?.core?.convertFileSrc;

		if (desktopShell && convertFileSrc) return convertFileSrc(path);

		return fileUrlFromPath(path);
	}

	function fileUrlFromPath(path: string) {
		const normalized = normalizePathSeparators(path);
		const prefix = (/^[A-Za-z]:\//).test(normalized) ? 'file:///' : 'file://';

		return `${prefix}${normalized.split('/').map(encodeURIComponent).join('/')}`;
	}

	function markdownImageBoundsKey(image: MarkdownImage) {
		return image.src;
	}

	function markdownImagePlaceholderAttributes(image: MarkdownImage) {
		const bounds = markdownImageBounds.get(markdownImageBoundsKey(image));

		if (!bounds) return undefined;

		return {
			style: `--markdown-image-placeholder-width: ${bounds.width}px; --markdown-image-placeholder-height: ${bounds.height}px;`
		};
	}

	function replaceMarkdownImageSize(
		view: EditorView,
		image: MarkdownImage,
		from: number,
		to: number,
		width: number,
		height: number
	) {
		if (from < 0 || to > view.state.doc.length || from >= to) return;

		view.dispatch({
			changes: {
				from,
				to,
				insert: markdownImageWithSize(image, width, height)
			}
		});
	}

	function isHorizontalRuleLine(text: string) {
		return (/^[ \t]{0,3}(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})$/).test(text);
	}

	function markdownCodeLanguage(info: string) {
		const language = markdownCodeFenceLanguage(info);

		if (!language) return null;

		return LanguageDescription.matchLanguageName(languages, language, true);
	}

	function preloadMarkdownCodeLanguages(view: EditorView) {
		for (const block of fencedCodeBlocks(view.state)) {
			if (!block.language) continue;

			const description = markdownCodeLanguage(block.language);

			if (!description || description.support) continue;

			const key = description.name.toLowerCase();

			if (loadingMarkdownCodeLanguages.has(key)) continue;

			const loading = description.load()
				.then(() => {
					loadingMarkdownCodeLanguages.delete(key);

					if (mainEditor !== view) return;

					forceParsing(view, view.state.doc.length, 100);
					view.dispatch({ effects: refreshLivePreviewEffect.of() });
					view.requestMeasure();
					requestAnimationFrame(updateAnchorPositions);
				})
				.catch(() => {
					loadingMarkdownCodeLanguages.delete(key);
				});

			loadingMarkdownCodeLanguages.set(key, loading);
		}
	}

	function markdownTableBlocks(state: EditorState): SourceBlock[] {
		const blocks: SourceBlock[] = [];

		for (let lineNumber = 1; lineNumber < state.doc.lines; lineNumber += 1) {
			if (blockForLine(blocks, lineNumber)) continue;

			const header = markdownTableCells(state.doc.line(lineNumber).text);
			const delimiter = markdownTableCells(state.doc.line(lineNumber + 1).text);

			if (!header || !delimiter || !markdownTableDelimiterCells(delimiter)) continue;

			const columnCount = Math.max(header.length, delimiter.length);
			const rows: string[][] = [];
			let end = lineNumber + 1;

			for (let rowLine = lineNumber + 2; rowLine <= state.doc.lines; rowLine += 1) {
				const cells = markdownTableCells(state.doc.line(rowLine).text);

				if (!cells || markdownTableDelimiterCells(cells)) break;

				rows.push(padMarkdownTableCells(cells, columnCount));
				end = rowLine;
			}

			blocks.push({
				start: lineNumber,
				end,
				kind: 'table',
				table: {
					headers: padMarkdownTableCells(header, columnCount),
					alignments: padMarkdownTableAlignments(delimiter.map(markdownTableAlignment), columnCount),
					rows
				}
			});

			lineNumber = end;
		}

		return blocks;
	}

	function belongsToListContinuation(
		state: EditorState,
		startLine: number,
		endLine: number,
		info: ListInfo
	) {
		for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
			const text = state.doc.line(lineNumber).text;

			if (text.trim() && leadingMarkdownIndent(text) < info.contentIndent) return false;
		}

		return true;
	}

	function markdownListModel(
		state: EditorState,
		orderedListMarkers: Map<number, string>,
		ignoredBlocks: SourceBlock[] = []
	): MarkdownListModel {
		const ignoredLines = ignoredLineNumbers(ignoredBlocks);
		const items = new Map<number, MarkdownListItem>();
		const ownerByLine = new Map<number, MarkdownListItem>();
		const collapsedAncestorByLine = new Map<number, number>();
		const stack: MarkdownListItem[] = [];

		for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
			const line = state.doc.line(lineNumber);
			const info = ignoredLines.has(lineNumber) ? null : listInfo(line.text);

			if (!info) {
				if (line.text.trim()) {
					const sourceIndent = leadingMarkdownIndent(line.text);

					while (stack.length && sourceIndent < stack[stack.length - 1].info.contentIndent) {
						stack.pop();
					}
				}

				continue;
			}

			while (
				stack.length
				&& (
					stack[stack.length - 1].info.indent >= info.indent
					|| !belongsToListContinuation(state, stack[stack.length - 1].lineNumber + 1, lineNumber, stack[stack.length - 1].info)
				)
			) {
				stack.pop();
			}

			const parent = stack[stack.length - 1] ?? null;
			const displayMarker = orderedListMarkers.get(lineNumber) ?? info.marker;
			const item: MarkdownListItem = {
				blockEnd: lineNumber,
				childLines: [],
				collapseKey: markdownListCollapseKey(state, lineNumber),
				info,
				layout: markdownListLayoutForItem(info, parent?.layout ?? null, displayMarker),
				lineNumber,
				parentLine: parent?.lineNumber ?? null
			};

			items.set(lineNumber, item);
			parent?.childLines.push(lineNumber);
			stack.push(item);
		}

		for (const item of items.values()) {
			item.blockEnd = markdownListBlockEndForItem(state, item);
		}

		for (const item of items.values()) {
			for (let lineNumber = item.lineNumber; lineNumber <= item.blockEnd; lineNumber += 1) {
				const owner = ownerByLine.get(lineNumber);

				if (!owner || item.info.indent >= owner.info.indent) {
					ownerByLine.set(lineNumber, item);
				}
			}
		}

		for (const item of items.values()) {
			if (item.childLines.length === 0 || !collapsedListItemKeys.has(item.collapseKey)) continue;

			for (let lineNumber = item.lineNumber + 1; lineNumber <= item.blockEnd; lineNumber += 1) {
				if (!collapsedAncestorByLine.has(lineNumber)) {
					collapsedAncestorByLine.set(lineNumber, item.lineNumber);
				}
			}
		}

		return { collapsedAncestorByLine, items, ownerByLine };
	}

	function ignoredLineNumbers(blocks: SourceBlock[]) {
		const lines = new Set<number>();

		for (const block of blocks) {
			for (let lineNumber = block.start; lineNumber <= block.end; lineNumber += 1) {
				lines.add(lineNumber);
			}
		}

		return lines;
	}

	function markdownListBlockEndForItem(state: EditorState, item: MarkdownListItem) {
		let end = item.lineNumber;

		for (let nextLine = item.lineNumber + 1; nextLine <= state.doc.lines; nextLine += 1) {
			const text = state.doc.line(nextLine).text;

			if (!text.trim() || leadingMarkdownIndent(text) >= item.info.contentIndent) {
				end = nextLine;

				continue;
			}

			break;
		}

		return end;
	}

	function listInfo(text: string): ListInfo | null {
		const match = (/^(\s*)((?:[-*+])|(?:\d+[.)]))(\s+)(?:\[([ xX])\]\s+)?/).exec(text);

		if (!match) return null;

		const indent = markdownIndentWidth(match[1]);

		return {
			indent,
			contentIndent: indent + markdownIndentWidth(match[2] + match[3]),
			marker: match[2],
			task: Boolean(match[4])
		};
	}

	function markdownListCollapseKey(state: EditorState, lineNumber: number) {
		return `${documentSessionKey}:${lineNumber}:${state.doc.line(lineNumber).text}`;
	}

	function markdownHeadingCollapseKey(state: EditorState, lineNumber: number) {
		return `${documentSessionKey}:${lineNumber}:${state.doc.line(lineNumber).text}`;
	}

	function toggleMarkdownHeadingCollapse(view: EditorView, key: string, lineNumber: number) {
		const next = new Set(collapsedHeadingKeys);
		const collapsing = !next.has(key);
		const selection = collapsing ? selectionOutsideCollapsingHeadingSection(view.state, lineNumber) : null;

		if (collapsing) {
			next.add(key);
		} else {
			next.delete(key);
		}

		collapsedHeadingKeys = next;
		view.dispatch({
			effects: refreshLivePreviewEffect.of(),
			selection: selection ?? undefined
		});
		requestAnimationFrame(updateAnchorPositions);
	}

	function selectionOutsideCollapsingHeadingSection(state: EditorState, lineNumber: number) {
		const headingModel = markdownHeadingModelForState(state);
		const item = headingModel.items.get(lineNumber);

		if (!item || item.blockEnd <= lineNumber) return null;

		const headLine = state.doc.lineAt(state.selection.main.head).number;

		if (headLine <= lineNumber || headLine > item.blockEnd) return null;

		const headingLine = state.doc.line(lineNumber);

		return { anchor: markdownHeadingContentPosition(headingLine) };
	}

	function markdownHeadingContentPosition(line: Line) {
		return line.from + (markdownHeadingLine(line.text)?.syntaxLength ?? 0);
	}

	function toggleMarkdownListCollapse(view: EditorView, key: string, lineNumber: number) {
		const next = new Set(collapsedListItemKeys);
		const collapsing = !next.has(key);
		const selection = collapsing ? selectionOutsideCollapsingListSubtree(view.state, lineNumber) : null;

		if (collapsing) {
			next.add(key);
		} else {
			next.delete(key);
		}

		collapsedListItemKeys = next;
		view.dispatch({
			effects: refreshLivePreviewEffect.of(),
			selection: selection ?? undefined
		});
		requestAnimationFrame(updateAnchorPositions);
	}

	function selectionOutsideCollapsingListSubtree(state: EditorState, lineNumber: number) {
		const listModel = markdownListModelForState(state);
		const item = listModel.items.get(lineNumber);

		if (!item || item.blockEnd <= lineNumber) return null;

		const headLine = state.doc.lineAt(state.selection.main.head).number;

		if (headLine <= lineNumber || headLine > item.blockEnd) return null;

		const parentLine = state.doc.line(lineNumber);

		return { anchor: markdownListContentPosition(parentLine) };
	}

	function markdownListContentPosition(line: Line) {
		const match = (/^(\s*)((?:[-*+])|(?:\d+[.)]))(\s+)(?:\[([ xX])\]\s+)?/).exec(line.text);

		return line.from + (match?.[0].length ?? 0);
	}

	function markdownListContinuationInfo(
		state: EditorState,
		lineNumber: number,
		listModel: MarkdownListModel
	): ListContinuationInfo | null {
		const line = state.doc.line(lineNumber);

		if (!line.text.trim() || listInfo(line.text)) return null;

		const context = markdownNearestListContainer(state, lineNumber, listModel);

		if (!context || context.sourceIndent >= context.info.contentIndent + 4) return null;

		return {
			sourceIndentLength: leadingMarkdownWhitespaceLength(line.text),
			sourceIndentWidth: context.sourceIndent,
			visualIndent: context.visualIndent
		};
	}

	function markdownNearestListContainer(
		state: EditorState,
		lineNumber: number,
		listModel: MarkdownListModel
	): ListContainerContext | null {
		const line = state.doc.line(lineNumber);
		const sourceIndent = leadingMarkdownIndent(line.text);
		const item = listModel.ownerByLine.get(lineNumber);

		if (!item || lineNumber === item.lineNumber || sourceIndent < item.info.contentIndent) return null;

		return {
			info: item.info,
			sourceIndent,
			visualIndent: item.layout.textX
		};
	}

	function markdownIndentedCodeInfo(
		state: EditorState,
		lineNumber: number,
		listModel: MarkdownListModel
	): ListContinuationInfo | null {
		const line = state.doc.line(lineNumber);

		if (!line.text.trim()) return null;

		const listCode = markdownListIndentedCodeInfo(state, lineNumber, listModel);

		if (listCode) return listCode;
		if (leadingMarkdownIndent(line.text) < 4 || listModel.ownerByLine.has(lineNumber)) return null;

		return {
			sourceIndentLength: sourceMarkdownIndentLengthForWidth(line.text, 4),
			sourceIndentWidth: 4,
			visualIndent: 0
		};
	}

	function markdownListIndentedCodeInfo(
		state: EditorState,
		lineNumber: number,
		listModel: MarkdownListModel
	): ListContinuationInfo | null {
		const line = state.doc.line(lineNumber);
		const context = markdownNearestListContainer(state, lineNumber, listModel);

		if (!context) return null;

		const codeIndent = context.info.contentIndent + 4;

		if (context.sourceIndent < codeIndent) return null;

		return {
			sourceIndentLength: sourceMarkdownIndentLengthForWidth(line.text, codeIndent),
			sourceIndentWidth: codeIndent,
			visualIndent: context.visualIndent
		};
	}

	function markdownListContainerInfo(
		state: EditorState,
		lineNumber: number,
		listModel: MarkdownListModel
	): ListContinuationInfo | null {
		const line = state.doc.line(lineNumber);
		const context = markdownNearestListContainer(state, lineNumber, listModel);

		if (!context) return null;

		return {
			sourceIndentLength: sourceMarkdownIndentLengthForWidth(line.text, context.info.contentIndent),
			sourceIndentWidth: context.info.contentIndent,
			visualIndent: context.visualIndent
		};
	}

	function markdownListLineClass(layout: MarkdownListLayout) {
		const depth = Math.min(2, layout.depth % 3);
		const kind = isOrderedListMarker(layout.marker) ? 'ordered' : 'unordered';

		return `cm-live-list-line cm-live-list-${kind} cm-live-list-depth-${depth}`;
	}

	function markdownListLineAttributes(layout: MarkdownListLayout) {
		const attributes: Record<string, string> = {
			style: `--list-indent: ${layout.markerX}px; --list-marker-offset: ${layout.markerOffset}px;`
		};

		if (isOrderedListMarker(layout.marker)) attributes['data-list-marker'] = layout.marker;

		return attributes;
	}

	function markdownListContinuationAttributes(info: ListContinuationInfo) {
		return {
			style: `--list-continuation-indent: ${info.visualIndent}px;`
		};
	}

	function markdownCodeBlockAttributes(info: ListContinuationInfo) {
		return {
			style: `--codeblock-indent: ${info.visualIndent}px;`
		};
	}

	function mergeDecorationAttributes(
		...attributes: Array<Record<string, string> | undefined>
	): Record<string, string> | undefined {
		const merged: Record<string, string> = {};
		const styles: string[] = [];

		for (const item of attributes) {
			if (!item) continue;

			for (const [key, value] of Object.entries(item)) {
				if (key === 'style') {
					styles.push(value.trim().replace(/;?$/, ';'));
				} else {
					merged[key] = value;
				}
			}
		}

		if (styles.length > 0) merged.style = styles.join(' ');

		return Object.keys(merged).length > 0 ? merged : undefined;
	}

	function markdownListMarkerOffset(info: ListInfo, displayMarker = info.marker) {
		if (info.task) return 30;
		if (isOrderedListMarker(displayMarker)) return Math.max(22, displayMarker.length * 9 + 5);

		return 12;
	}

	function markdownListInfoFallback(indent: string, marker: string): ListInfo {
		const indentWidthValue = markdownIndentWidth(indent);

		return {
			indent: indentWidthValue,
			contentIndent: indentWidthValue + markdownIndentWidth(`${marker} `),
			marker,
			task: false
		};
	}

	function markdownListLayoutForItem(
		info: ListInfo,
		parentLayout: MarkdownListLayout | null,
		displayMarker = info.marker
	): MarkdownListLayout {
		const marker = isOrderedListMarker(info.marker) ? displayMarker : info.marker;
		const markerX = parentLayout?.textX ?? 0;
		const markerOffset = markdownListMarkerOffset(info, marker);

		return {
			depth: parentLayout ? parentLayout.depth + 1 : 0,
			marker,
			markerOffset,
			markerX,
			textX: markerX + markerOffset
		};
	}

	function isOrderedListMarker(marker: string) {
		return (/^\d+[.)]$/).test(marker);
	}

	function markdownListModelForState(state: EditorState) {
		const ignoredBlocks = [
			...markdownFrontmatterBlocks(state),
			...fencedCodeBlocks(state),
			...markdownTableBlocks(state)
		];
		const orderedListMarkers = markdownOrderedListMarkers(state, ignoredBlocks);

		return markdownListModel(state, orderedListMarkers, ignoredBlocks);
	}

	function markdownOrderedListMarkers(state: EditorState, ignoredBlocks: SourceBlock[]) {
		const lines: string[] = [];
		const ignoredLines = new Set<number>();

		for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
			lines.push(state.doc.line(lineNumber).text);
		}

		for (const block of ignoredBlocks) {
			for (let lineNumber = block.start; lineNumber <= block.end; lineNumber += 1) {
				ignoredLines.add(lineNumber);
			}
		}

		return orderedListMarkersForLines(lines, ignoredLines);
	}

	function markdownMathBlocks(state: EditorState, ignoredBlocks: SourceBlock[] = []): SourceBlock[] {
		const lines: string[] = [];
		const ignoredLines = ignoredLineNumbers(ignoredBlocks);

		for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
			lines.push(state.doc.line(lineNumber).text);
		}

		return markdownMathBlocksForLines(lines, ignoredLines).map((block) => ({
			start: block.start,
			end: block.end,
			kind: 'math',
			math: block
		}));
	}

	function indentedBlockForLine(state: EditorState, lineNumber: number): SourceBlock | null {
		const line = state.doc.line(lineNumber);

		if (!line.text.trim() || leadingMarkdownIndent(line.text) < 4) return null;

		let start = lineNumber;
		let end = lineNumber;

		for (let previous = lineNumber - 1; previous >= 1; previous -= 1) {
			const text = state.doc.line(previous).text;

			if (text.trim() && leadingMarkdownIndent(text) < 4) break;

			start = previous;
		}

		for (let next = lineNumber + 1; next <= state.doc.lines; next += 1) {
			const text = state.doc.line(next).text;

			if (text.trim() && leadingMarkdownIndent(text) < 4) break;

			end = next;
		}

		return { start, end, kind: 'indented' };
	}

	function addInlineMarkdownPreview(ranges: Range<Decoration>[], line: Line, contentOffset = 0) {
		const text = line.text;
		const occupied: Array<{ from: number; to: number }> = [];
		const overlaps = (from: number, to: number) => occupied.some((range) => from < range.to && to > range.from);

		const claim = (from: number, to: number) => {
			if (from < contentOffset || from >= to || overlaps(from, to)) return false;

			occupied.push({ from, to });

			return true;
		};

		const addMark = (from: number, to: number, className: string, attributes?: Record<string, string>) => {
			if (from >= to) return;

			ranges.push(Decoration.mark({ class: className, attributes }).range(line.from + from, line.from + to));
		};

		const hide = (from: number, to: number) => addMark(from, to, 'cm-markdown-syntax-hidden');

		for (const match of text.matchAll(/`([^`\n]+)`/g)) {
			const from = match.index ?? 0;
			const to = from + match[0].length;

			if (!claim(from, to)) continue;

			hide(from, from + 1);
			addMark(from + 1, to - 1, 'cm-live-code');
			hide(to - 1, to);
		}

		for (const match of text.matchAll(markdownImagePattern())) {
			const image = markdownImageFromMatch(match);
			const from = match.index ?? 0;
			const to = from + match[0].length;

			if (!image || !claim(from, to)) continue;

			ranges.push(Decoration.replace({
				widget: new MarkdownImageWidget(image, line.number, line.from + from, line.from + to),
				inclusive: false
			}).range(line.from + from, line.from + to));
		}

		for (const match of text.matchAll(/\[([^\]\n]+)\]\(([^)\n]+)\)/g)) {
			const from = match.index ?? 0;
			const to = from + match[0].length;
			const labelStart = from + 1;
			const labelEnd = labelStart + match[1].length;

			if (!claim(from, to)) continue;

			hide(from, labelStart);
			addMark(labelStart, labelEnd, 'cm-live-link');
			hide(labelEnd, to);
		}

		for (const match of text.matchAll(/\[\^([^\]\s]+)\]/g)) {
			const from = match.index ?? 0;
			const to = from + match[0].length;
			const labelStart = from + 2;
			const labelEnd = labelStart + match[1].length;

			if (!claim(from, to)) continue;

			hide(from, labelStart);
			addMark(labelStart, labelEnd, 'cm-live-footnote-ref', footnoteReferenceAttributes(match[1]));
			hide(labelEnd, to);
		}

		for (const math of inlineMarkdownMathSpans(text, contentOffset)) {
			if (!claim(math.from, math.to)) continue;

			ranges.push(Decoration.replace({
				widget: new MarkdownMathWidget(math.source, math.displayMode, line.number, line.from + math.from),
				inclusive: false
			}).range(line.from + math.from, line.from + math.to));
		}

		for (const match of text.matchAll(/~~([^~\n]+)~~/g)) {
			const from = match.index ?? 0;
			const to = from + match[0].length;

			if (!claim(from, to)) continue;

			hide(from, from + 2);
			addMark(from + 2, to - 2, 'cm-live-strikethrough');
			hide(to - 2, to);
		}

		for (const match of text.matchAll(/\*\*([^*\n]+)\*\*/g)) {
			const from = match.index ?? 0;
			const to = from + match[0].length;

			if (!claim(from, to)) continue;

			hide(from, from + 2);
			addMark(from + 2, to - 2, 'cm-live-bold');
			hide(to - 2, to);
		}

		for (const match of text.matchAll(/(^|[\s(])\*([^*\n]+)\*/g)) {
			const prefixLength = match[1].length;
			const from = (match.index ?? 0) + prefixLength;
			const to = from + match[0].length - prefixLength;

			if (!claim(from, to)) continue;

			hide(from, from + 1);
			addMark(from + 1, to - 1, 'cm-live-italic');
			hide(to - 1, to);
		}

		for (const match of text.matchAll(/(^|[\s(])_([^_\n]+)_/g)) {
			const prefixLength = match[1].length;
			const from = (match.index ?? 0) + prefixLength;
			const to = from + match[0].length - prefixLength;

			if (!claim(from, to)) continue;

			hide(from, from + 1);
			addMark(from + 1, to - 1, 'cm-live-italic');
			hide(to - 1, to);
		}
	}

	function addInlineMarkdownSourceSyntax(ranges: Range<Decoration>[], line: Line, contentOffset = 0) {
		const text = line.text;
		const occupied: Array<{ from: number; to: number }> = [];
		const overlaps = (from: number, to: number) => occupied.some((range) => from < range.to && to > range.from);

		const claim = (from: number, to: number) => {
			if (from < contentOffset || from >= to || overlaps(from, to)) return false;

			occupied.push({ from, to });

			return true;
		};

		const addSyntaxMark = (from: number, to: number) => {
			if (from >= to) return;

			ranges.push(Decoration.mark({
				class: 'cm-markdown-source-syntax cm-markdown-inline-syntax'
			}).range(line.from + from, line.from + to));
		};

		const referenceDefinition = (/^([ \t]{0,3})\[([^\]\n]+)\]:(\s*)/).exec(text);

		if (referenceDefinition) {
			const from = referenceDefinition[1].length;
			const idEnd = from + 1 + referenceDefinition[2].length;
			const to = idEnd + 2 + referenceDefinition[3].length;

			if (claim(from, to)) {
				addSyntaxMark(from, from + 1);
				addSyntaxMark(idEnd, idEnd + 2);
			}
		}

		for (const match of text.matchAll(/`([^`\n]+)`/g)) {
			const from = match.index ?? 0;
			const to = from + match[0].length;

			if (!claim(from, to)) continue;

			addSyntaxMark(from, from + 1);
			addSyntaxMark(to - 1, to);
		}

		for (const match of text.matchAll(markdownImagePattern())) {
			const from = match.index ?? 0;
			const to = from + match[0].length;

			if (!claim(from, to)) continue;

			addImageSourceSyntax(ranges, line, match, from);
		}

		for (const match of text.matchAll(/\[([^\]\n]+)\]\(([^)\n]+)\)/g)) {
			const from = match.index ?? 0;
			const to = from + match[0].length;

			if (!claim(from, to)) continue;

			const labelEnd = from + 1 + match[1].length;

			addSyntaxMark(from, from + 1);
			addSyntaxMark(labelEnd, labelEnd + 2);
			addSyntaxMark(to - 1, to);
		}

		for (const match of text.matchAll(/\[\^([^\]\s]+)\]/g)) {
			const from = match.index ?? 0;
			const to = from + match[0].length;

			if (!claim(from, to)) continue;

			addSyntaxMark(from, from + 2);
			addSyntaxMark(to - 1, to);
		}

		for (const match of text.matchAll(/\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
			const from = match.index ?? 0;
			const to = from + match[0].length;

			if (!claim(from, to)) continue;

			const labelEnd = from + 1 + match[1].length;

			addSyntaxMark(from, from + 1);
			addSyntaxMark(labelEnd, labelEnd + 2);
			addSyntaxMark(to - 1, to);
		}

		for (const math of inlineMarkdownMathSpans(text, contentOffset)) {
			if (!claim(math.from, math.to)) continue;

			addSyntaxMark(math.from, math.from + 1);
			addSyntaxMark(math.to - 1, math.to);
		}

		for (const match of text.matchAll(/~~([^~\n]+)~~/g)) {
			const from = match.index ?? 0;
			const to = from + match[0].length;

			if (!claim(from, to)) continue;

			addSyntaxMark(from, from + 2);
			addSyntaxMark(to - 2, to);
		}

		for (const match of text.matchAll(/\*\*([^*\n]+)\*\*/g)) {
			const from = match.index ?? 0;
			const to = from + match[0].length;

			if (!claim(from, to)) continue;

			addSyntaxMark(from, from + 2);
			addSyntaxMark(to - 2, to);
		}

		for (const match of text.matchAll(/(^|[\s(])\*([^*\n]+)\*/g)) {
			const prefixLength = match[1].length;
			const from = (match.index ?? 0) + prefixLength;
			const to = from + match[0].length - prefixLength;

			if (!claim(from, to)) continue;

			addSyntaxMark(from, from + 1);
			addSyntaxMark(to - 1, to);
		}

		for (const match of text.matchAll(/(^|[\s(])_([^_\n]+)_/g)) {
			const prefixLength = match[1].length;
			const from = (match.index ?? 0) + prefixLength;
			const to = from + match[0].length - prefixLength;

			if (!claim(from, to)) continue;

			addSyntaxMark(from, from + 1);
			addSyntaxMark(to - 1, to);
		}
	}

	function addImageSourceSyntax(ranges: Range<Decoration>[], line: Line, match: RegExpMatchArray, from: number) {
		const alt = match[1] ?? '';
		const destination = match[2] ?? '';
		const altEnd = from + 2 + alt.length;
		const destinationEnd = altEnd + 2 + destination.length;
		const to = from + match[0].length;

		addLineSourceSyntaxMark(ranges, line, from, from + 2);
		addLineSourceSyntaxMark(ranges, line, altEnd, altEnd + 2);
		addLineSourceSyntaxMark(ranges, line, destinationEnd, destinationEnd + 1);

		if (match[3] !== undefined) {
			addLineSourceSyntaxMark(ranges, line, destinationEnd + 1, destinationEnd + 2);
			addLineSourceSyntaxMark(ranges, line, to - 1, to);
		}
	}

	function addCodeFenceSourceSyntax(ranges: Range<Decoration>[], line: Line) {
		const fence = (/^([ \t]*)(`{3,}|~{3,})/).exec(line.text);

		if (!fence) return;

		const from = fence[1].length;

		addLineSourceSyntaxMark(ranges, line, from, from + fence[2].length);
	}

	function addFrontmatterFenceSourceSyntax(ranges: Range<Decoration>[], line: Line) {
		const fence = (/^([ \t]*)(---|\.\.\.)([ \t]*)$/).exec(line.text);

		if (!fence) return;

		const from = fence[1].length;

		addLineSourceSyntaxMark(ranges, line, from, from + fence[2].length);
	}

	function addTableSourceSyntax(ranges: Range<Decoration>[], line: Line, delimiterLine: boolean) {
		let escaped = false;

		for (let index = 0; index < line.text.length; index += 1) {
			const character = line.text[index];

			if (escaped) {
				escaped = false;
				continue;
			}

			if (character === '\\') {
				escaped = true;
				continue;
			}

			if (character === '|') {
				addLineSourceSyntaxMark(ranges, line, index, index + 1);
			}
		}

		if (!delimiterLine) return;

		for (const match of line.text.matchAll(/[:\-]+/g)) {
			const from = match.index ?? 0;

			addLineSourceSyntaxMark(ranges, line, from, from + match[0].length);
		}
	}

	function addDisplayMathSourceSyntax(ranges: Range<Decoration>[], line: Line) {
		const opening = (/^([ \t]{0,3})\$\$/).exec(line.text);

		if (opening) {
			const from = opening[1].length;

			addLineSourceSyntaxMark(ranges, line, from, from + 2);
		}

		const closing = (/\$\$[ \t]*$/).exec(line.text);
		const openingIndex = opening ? opening[1].length : -1;

		if (!closing || closing.index === openingIndex) return;

		addLineSourceSyntaxMark(ranges, line, closing.index, closing.index + 2);
	}

	function addLineSourceSyntaxMark(ranges: Range<Decoration>[], line: Line, from: number, to: number) {
		if (from >= to) return;

		ranges.push(Decoration.mark({
			class: 'cm-markdown-source-syntax cm-markdown-inline-syntax'
		}).range(line.from + from, line.from + to));
	}

	function threadRangeInState(state: EditorState, thread: ThreadView): ThreadRangeMatch | null {
		const candidates = thread.kind === 'suggestion'
			? suggestionRangeCandidates(thread)
			: [{ value: thread.quote, matched: 'quote' as const }];

		const usableCandidates = candidates.filter((candidate) => candidate.value.trim().length > 0);
		const deletionOnly = thread.kind === 'suggestion' && thread.status !== 'rejected' && suggestionSurfaceKind(thread) === 'remove';
		const lineRange = currentLineRangeForThread(thread);
		const rangeMatch = rangeForCandidates(state, lineRange.start, lineRange.end, usableCandidates);

		if (rangeMatch) return rangeMatch;

		if (thread.pending && thread.currentLine) {
			return deletionOnly ? deletionAnchorInState(state, thread) : null;
		}

		const doc = state.doc.toString();

		for (const candidate of usableCandidates) {
			const index = doc.indexOf(candidate.value);

			if (index >= 0) {
				return {
					from: index,
					to: index + candidate.value.length,
					matched: candidate.matched
				};
			}
		}

		if (deletionOnly) return deletionAnchorInState(state, thread);

		return null;
	}

	function commentAnchorRangeInState(state: EditorState, anchor: CommentSelectionAnchor): ThreadRangeMatch | null {
		const candidates = [
			{ value: anchor.markdownQuote, matched: 'quote' as const },
			{ value: anchor.quote, matched: 'quote' as const }
		].filter((candidate, index, items) => (
			candidate.value.trim().length > 0 &&
			items.findIndex((item) => item.value === candidate.value) === index
		));
		const rangeMatch = rangeForCandidates(state, anchor.startLine, anchor.endLine, candidates);

		if (rangeMatch) return rangeMatch;

		const doc = state.doc.toString();

		for (const candidate of candidates) {
			const index = doc.indexOf(candidate.value);

			if (index >= 0) {
				return {
					from: index,
					to: index + candidate.value.length,
					matched: candidate.matched
				};
			}
		}

		return null;
	}

	function deletionAnchorInState(state: EditorState, thread: ThreadView): ThreadRangeMatch {
		const lineNumber = thread.currentLine ?? thread.line;

		if (lineNumber > state.doc.lines) {
			return {
				from: state.doc.length,
				to: state.doc.length,
				matched: 'deletion'
			};
		}

		const line = state.doc.line(Math.max(1, lineNumber));

		return { from: line.from, to: line.from, matched: 'deletion' };
	}

	function currentLineRangeForThread(thread: ThreadView) {
		return {
			start: Math.max(1, thread.currentLine ?? thread.line),
			end: Math.max(thread.currentLine ?? thread.line, thread.currentEndLine ?? thread.endLine)
		};
	}

	function rangeForCandidates(
		state: EditorState,
		startLine: number,
		endLine: number,
		candidates: Array<{ value: string; matched: 'body' | 'quote' }>
	) {
		if (startLine > state.doc.lines) return null;

		const start = state.doc.line(startLine);
		const end = state.doc.line(Math.min(Math.max(startLine, endLine), state.doc.lines));
		const text = state.sliceDoc(start.from, end.to);

		for (const candidate of candidates) {
			const index = text.indexOf(candidate.value);

			if (index >= 0) {
				return {
					from: start.from + index,
					to: start.from + index + candidate.value.length,
					matched: candidate.matched
				};
			}
		}

		return null;
	}

	function suggestionRangeCandidates(thread: ThreadView) {
		if (thread.status === 'rejected') {
			return [
				{
					value: thread.diffQuote ?? thread.quote,
					matched: 'quote' as const
				},
				{ value: thread.quote, matched: 'quote' as const }
			];
		}

		return [
			{
				value: thread.diffBody ?? thread.body,
				matched: 'body' as const
			},
			{ value: thread.body, matched: 'body' as const },
			{
				value: thread.diffQuote ?? thread.quote,
				matched: 'quote' as const
			},
			{ value: thread.quote, matched: 'quote' as const }
		];
	}

	function codeMirrorLiveEditor(
		node: HTMLElement,
		options: { value: string; threads: ThreadView[]; documentKey: string }
	) {
		let lastExternalValue = options.value;
		let lastDocumentKey = options.documentKey;
		let applyingExternalValue = false;

		const view = new EditorView({
			parent: node,
			state: EditorState.create({ doc: options.value, extensions: livePreviewExtensions() })
		});

		mainEditor = view;
		view.dispatch({ effects: setThreadsEffect.of(options.threads) });
		preloadMarkdownCodeLanguages(view);
		updateSelectionFromEditor(view);
		requestAnimationFrame(updateAnchorPositions);

		return {
			update(next: typeof options) {
				view.dispatch({ effects: setThreadsEffect.of(next.threads) });

				const currentDoc = view.state.doc.toString();
				const documentChanged = next.documentKey !== lastDocumentKey;

				if (documentChanged || next.value !== currentDoc && currentDoc === lastExternalValue) {
					applyingExternalValue = true;

					view.dispatch({
						changes: { from: 0, to: currentDoc.length, insert: next.value }
					});

					applyingExternalValue = false;
				}

				lastExternalValue = next.value;
				lastDocumentKey = next.documentKey;
			},

			destroy() {
				if (mainEditor === view) mainEditor = null;

				view.destroy();
			}
		};

		function livePreviewExtensions(): Extension[] {
			return [
				history(),
				EditorState.tabSize.of(4),
				indentUnit.of('    '),
				markdown({ codeLanguages: markdownCodeLanguage }),
				marginDropCursor,
				syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
				syntaxHighlighting(marginHighlightStyle),
				search({ top: true, createPanel: marginSearchPanel }),
				livePreviewField,
				Prec.highest(keymap.of([
					{ key: 'Enter', run: smartMarkdownEnter },
					{ key: 'Backspace', run: smartMarkdownBackspace }
				])),
				keymap.of([
					{
						key: 'Mod-Enter',
						run() {
							saveLocalMarkdown();

							return true;
						}
					},

					{
						key: 'Mod-s',
						run() {
							if (!shouldHandleWebNativeShortcut()) return false;

							saveLocalMarkdown();

							return true;
						}
					},

					{
						key: 'Mod-p',
						run() {
							requestPrintDocument();

							return true;
						}
					},

					{
						key: 'Mod-n',
						run() {
							if (!shouldHandleWebNativeShortcut()) return false;

							createNewDocument();

							return true;
						}
					},

					{
						key: 'Mod-o',
						run() {
							if (!shouldHandleWebNativeShortcut()) return false;

							openLocalMarkdown();

							return true;
						}
					},

					{
						key: 'Mod-Shift-o',
						run() {
							if (!shouldHandleWebNativeShortcut()) return false;

							openLocalFolder();

							return true;
						}
					},

					{
						key: 'Mod-w',
						run() {
							if (!shouldHandleWebNativeShortcut()) return false;

							closeActiveDocumentTab();

							return true;
						}
					},

					{
						key: 'Mod-Shift-[',
						run() {
							if (!shouldHandleWebNativeShortcut()) return false;

							activateAdjacentDocumentTab(-1);

							return true;
						}
					},

					{
						key: 'Mod-Shift-]',
						run() {
							if (!shouldHandleWebNativeShortcut()) return false;

							activateAdjacentDocumentTab(1);

							return true;
						}
					},

					{
						key: 'Mod-Alt-m',
						run(view) {
							return openCommentComposerForSelection(view);
						}
					},

					{
						key: 'Mod-,',
						run() {
							if (!shouldHandleWebNativeShortcut()) return false;

							openSettingsDialog();

							return true;
						}
					},
					{
						key: 'ArrowUp',
						run: (view) => moveAcrossMarkdownBlockWidgetLine(view, -1),
						shift: (view) => moveAcrossMarkdownBlockWidgetLine(view, -1, true)
					},
					{
						key: 'ArrowDown',
						run: (view) => moveAcrossMarkdownBlockWidgetLine(view, 1),
						shift: (view) => moveAcrossMarkdownBlockWidgetLine(view, 1, true)
					},
					{ key: 'Tab', run: indentMore },
					{ key: 'Shift-Tab', run: indentLess },
					{
						key: 'Mod-f',
						run(view) {
							openFindPanel(view);

							return true;
						}
					},
					...searchKeymap,
					...defaultKeymap,
					...historyKeymap
				]),
				EditorView.lineWrapping,
				EditorView.updateListener.of((update: ViewUpdate) => {
					if (update.selectionSet || update.focusChanged) updateSelectionFromEditor(update.view);

					if (update.docChanged) {
						editorMarkdown = update.state.doc.toString();
						preloadMarkdownCodeLanguages(update.view);

						if (!applyingExternalValue) {
							localEditRevision += 1;
						}

						if (localFileMode && !applyingExternalValue) {
							refreshLocalSaveState(editorMarkdown);
							scheduleLocalAutosave();
						}

						if (applyingExternalValue) {
							resetSuggestionDraftState(editorMarkdown);
						} else if (editMode === 'suggest') {
							draftChanges = composeDraftChanges(draftChanges, update);
							pendingEditThreads = draftMarkdownSuggestions(draftChanges, draftBaseMarkdown, editorMarkdown, persistedThreads, { author: localAuthor, syncedKeys: syncedEditKeys });
						} else {
							resetSuggestionDraftState(editorMarkdown);
						}
					}

					if (update.docChanged || update.selectionSet || update.viewportChanged) {
						requestAnimationFrame(updateAnchorPositions);
					}
				}),

				EditorView.domEventHandlers({
					mousedown(event, view) {
						return maybeJumpToFootnote(event, view);
					},

					keydown(event, view) {
						updateFootnoteJumpArmed(view, footnoteJumpModifierActive(event));

						return false;
					},

					keyup(event, view) {
						updateFootnoteJumpArmed(view, footnoteJumpModifierActive(event));

						return false;
					},

					mousemove(event, view) {
						updateFootnoteJumpArmed(view, footnoteJumpModifierActive(event));

						const threadId = threadAnchorFromEvent(event);

						if (activeThreadId !== threadId) activeThreadId = threadId;
					},

					mouseleave(event, view) {
						updateFootnoteJumpArmed(view, false);

						if (activeThreadId) activeThreadId = '';
					},

					dragover(event) {
						if (!editorDropHasImages(event.dataTransfer)) return false;

						event.preventDefault();
						if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';

						return true;
					},

					drop(event, view) {
						return handleEditorImageDrop(event, view);
					},

					contextmenu(event, view) {
						return openCommentContextMenu(event, view);
					},

					blur(event, view) {
						updateFootnoteJumpArmed(view, false);
					},

					focus() {
						updateSelectionFromEditor(view);
					}
				})
			];
		}
	}

	function marginSearchPanel(view: EditorView): Panel {
		let query = getSearchQuery(view.state);
		let mode = findPanelMode;
		let position = findPanelPosition;
		let dragging: {
			startX: number;
			startY: number;
			startLeft: number;
			startTop: number;
			width: number;
			height: number;
		} | null = null;
		const dom = document.createElement('div');
		dom.className = 'cm-search margin-find-panel';
		dom.setAttribute('role', 'dialog');
		dom.setAttribute('aria-label', 'Find and replace');
		dom.setAttribute('aria-modal', 'false');

		const searchInput = findPanelTextInput('search', 'Find', query.search, true);
		const replaceInput = findPanelTextInput('replace', 'Replace', query.replace, false);
		const caseInput = findPanelCheckbox('case', query.caseSensitive);
		const wordInput = findPanelCheckbox('word', query.wholeWord);
		const regexInput = findPanelCheckbox('regex', query.regexp);
		const status = document.createElement('span');
		const commandButtons: HTMLButtonElement[] = [];
		const replaceButtons: HTMLButtonElement[] = [];

		status.className = 'margin-find-status';
		status.setAttribute('aria-live', 'polite');

		const titleBar = document.createElement('div');
		titleBar.className = 'margin-find-titlebar expanded-only';

		const titleDragHandle = document.createElement('div');
		titleDragHandle.className = 'margin-find-title-drag';

		const title = document.createElement('span');
		title.className = 'margin-find-title';
		title.textContent = 'Find and replace';

		titleDragHandle.append(title);
		titleBar.append(
			titleDragHandle,
			findPanelButton('compact', 'Compact', 'Show compact find', () => {
				setPanelMode('compact');

				return true;
			}, undefined, 'scaling-contract'),
			findPanelButton('close-expanded', 'x', 'Close find and replace', () => closeSearchPanel(view))
		);
		titleBar.addEventListener('pointerdown', startFindPanelDrag);

		const topRow = document.createElement('div');
		topRow.className = 'margin-find-row find-primary';
		topRow.append(
			findPanelField(searchInput),
			findPanelButton('previous', 'Prev', 'Previous match', () => findPrevious(view), commandButtons, 'up'),
			findPanelButton('next', 'Next', 'Next match', () => findNext(view), commandButtons, 'down'),
			status,
			findPanelButton('more', 'More', 'Show more options', () => {
				setPanelMode('expanded', { resetPosition: true });

				return true;
			}, undefined, 'scaling'),
			findPanelButton('close-compact', 'x', 'Close find and replace', () => closeSearchPanel(view))
		);

		const replaceRow = document.createElement('div');
		replaceRow.className = 'margin-find-row replace';
		replaceRow.append(
			findPanelField(replaceInput),
			findPanelButton('replace', 'Replace', 'Replace current match', () => replaceNext(view), replaceButtons),
			findPanelButton('replaceAll', 'All', 'Replace all matches', () => replaceAll(view), replaceButtons)
		);

		const optionsRow = document.createElement('div');
		optionsRow.className = 'margin-find-row options';
		optionsRow.append(
			findPanelOption('Case', caseInput),
			findPanelOption('Word', wordInput),
			findPanelOption('Regex', regexInput)
		);

		dom.append(titleBar, topRow, replaceRow, optionsRow);
		dom.addEventListener('keydown', handleFindPanelKeydown);

		searchInput.addEventListener('input', commit);
		replaceInput.addEventListener('input', commit);
		caseInput.addEventListener('change', commit);
		wordInput.addEventListener('change', commit);
		regexInput.addEventListener('change', commit);
		applyPanelMode();
		refreshFindPanelControls();

		const handle: FindPanelHandle = {
			setMode: setPanelMode,
			focus: focusFindInput
		};

		activeFindPanel = handle;

		return {
			dom,
			top: true,
			mount() {
				focusFindInput();
			},
			update(update) {
				const nextQuery = getSearchQuery(update.state);

				if (!nextQuery.eq(query)) {
					query = nextQuery;
					searchInput.value = query.search;
					replaceInput.value = query.replace;
					caseInput.checked = query.caseSensitive;
					wordInput.checked = query.wholeWord;
					regexInput.checked = query.regexp;
					refreshFindPanelControls();
				} else if (update.docChanged || update.selectionSet) {
					refreshFindPanelControls();
				}
			},
			destroy() {
				stopFindPanelDrag();
				if (activeFindPanel === handle) activeFindPanel = null;
			}
		};

		function setPanelMode(nextMode: FindPanelMode, options: FindPanelModeOptions = {}) {
			mode = nextMode;
			findPanelMode = nextMode;

			if (nextMode === 'compact' || options.resetPosition) {
				position = null;
				findPanelPosition = null;
			}

			applyPanelMode();
			focusFindInput();
		}

		function applyPanelMode() {
			dom.classList.toggle('is-compact', mode === 'compact');
			dom.classList.toggle('is-expanded', mode === 'expanded');
			dom.classList.toggle('is-dragged', mode === 'expanded' && Boolean(position));

			if (mode === 'expanded' && position) {
				dom.style.left = `${position.left}px`;
				dom.style.top = `${position.top}px`;
				dom.style.right = 'auto';
				dom.style.transform = 'none';
			} else {
				dom.style.left = '';
				dom.style.top = '';
				dom.style.right = '';
				dom.style.transform = '';
			}
		}

		function focusFindInput() {
			searchInput.focus();
			searchInput.select();
		}

		function commit() {
			const nextQuery = new SearchQuery({
				search: searchInput.value,
				replace: replaceInput.value,
				caseSensitive: caseInput.checked,
				wholeWord: wordInput.checked,
				regexp: regexInput.checked
			});

			if (!nextQuery.eq(query)) {
				query = nextQuery;
				view.dispatch({ effects: setSearchQuery.of(query) });
			}

			refreshFindPanelControls();
		}

		function handleFindPanelKeydown(event: KeyboardEvent) {
			const mod = event.metaKey || event.ctrlKey;
			const key = event.key.toLowerCase();

			if (mod && !event.altKey && !event.shiftKey && key === 'f') {
				event.preventDefault();
				setPanelMode('compact');

				return;
			}

			if (runScopeHandlers(view, event, 'search-panel')) {
				event.preventDefault();
				return;
			}

			if (event.key === 'Enter' && event.target === searchInput) {
				event.preventDefault();
				(event.shiftKey ? findPrevious : findNext)(view);
				refreshFindPanelControls();
			}

			if (event.key === 'Enter' && event.target === replaceInput) {
				event.preventDefault();
				replaceNext(view);
				refreshFindPanelControls();
			}
		}

		function refreshFindPanelControls() {
			const canSearch = query.search.length > 0 && query.valid;
			const canReplace = canSearch && !view.state.readOnly;

			commandButtons.forEach((button) => {
				button.disabled = !canSearch;
			});
			replaceButtons.forEach((button) => {
				button.disabled = !canReplace;
			});
			status.textContent = findPanelStatus(view, query);
		}

		function startFindPanelDrag(event: PointerEvent) {
			if (mode !== 'expanded' || event.button !== 0) return;

			const target = event.target;
			if (target instanceof Element && target.closest('button, input, label')) return;

			const rect = dom.getBoundingClientRect();
			dragging = {
				startX: event.clientX,
				startY: event.clientY,
				startLeft: rect.left,
				startTop: rect.top,
				width: rect.width,
				height: rect.height
			};
			dom.classList.add('is-dragging');
			event.preventDefault();
			window.addEventListener('pointermove', dragFindPanel);
			window.addEventListener('pointerup', stopFindPanelDrag);
			window.addEventListener('pointercancel', stopFindPanelDrag);
		}

		function dragFindPanel(event: PointerEvent) {
			if (!dragging) return;

			const margin = 8;
			const nextLeft = clampNumber(
				dragging.startLeft + event.clientX - dragging.startX,
				margin,
				Math.max(margin, window.innerWidth - dragging.width - margin)
			);
			const nextTop = clampNumber(
				dragging.startTop + event.clientY - dragging.startY,
				margin,
				Math.max(margin, window.innerHeight - dragging.height - margin)
			);

			position = { left: nextLeft, top: nextTop };
			findPanelPosition = position;
			applyPanelMode();
		}

		function stopFindPanelDrag() {
			if (!dragging) return;

			dragging = null;
			dom.classList.remove('is-dragging');
			window.removeEventListener('pointermove', dragFindPanel);
			window.removeEventListener('pointerup', stopFindPanelDrag);
			window.removeEventListener('pointercancel', stopFindPanelDrag);
		}
	}

	function findPanelTextInput(name: string, label: string, value: string, main: boolean) {
		const input = document.createElement('input');
		input.type = 'text';
		input.name = name;
		input.className = 'margin-find-input';
		input.value = value;
		input.placeholder = label;
		input.autocomplete = 'off';
		input.spellcheck = false;
		input.setAttribute('aria-label', label);
		input.setAttribute('form', '');

		if (main) input.setAttribute('main-field', 'true');

		return input;
	}

	function findPanelCheckbox(name: string, checked: boolean) {
		const input = document.createElement('input');
		input.type = 'checkbox';
		input.name = name;
		input.checked = checked;
		input.setAttribute('form', '');

		return input;
	}

	function findPanelField(input: HTMLInputElement) {
		const field = document.createElement('div');

		field.className = 'margin-find-field';
		field.append(input);

		return field;
	}

	function findPanelOption(labelText: string, input: HTMLInputElement) {
		const label = document.createElement('label');
		const text = document.createElement('span');

		label.className = 'margin-find-option';
		text.textContent = labelText;
		label.append(input, text);

		return label;
	}

	function findPanelButton(
		name: string,
		label: string,
		ariaLabel: string,
		run: () => boolean,
		group?: HTMLButtonElement[],
		icon?: FindPanelIconName
	) {
		const button = document.createElement('button');
		const text = document.createElement('span');

		button.type = 'button';
		button.name = name;
		button.className = `margin-find-button ${name}`;
		button.setAttribute('aria-label', ariaLabel);
		text.className = 'margin-find-button-label';
		text.textContent = label;
		if (icon) button.append(findPanelIcon(icon));
		button.append(text);
		button.addEventListener('mousedown', (event) => event.preventDefault());
		button.addEventListener('click', () => run());
		group?.push(button);

		return button;
	}

	function findPanelIcon(name: FindPanelIconName) {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', `margin-find-button-icon icon-${name}`);
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('aria-hidden', 'true');

		const paths: Record<FindPanelIconName, string[]> = {
			up: ['M6 15l6-6 6 6'],
			down: ['M6 9l6 6 6-6'],
			scaling: [
				'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7',
				'M14 15H9v-5',
				'M16 3h5v5',
				'M21 3 9 15'
			],
			'scaling-contract': [
				'M12 21h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7',
				'M10 9h5v5',
				'M8 21H3v-5',
				'M3 21 15 9'
			]
		};

		for (const d of paths[name]) {
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', d);
			svg.append(path);
		}

		return svg;
	}

	function clampNumber(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}

	function findPanelStatus(view: EditorView, query: SearchQuery) {
		if (!query.search) return '';
		if (!query.valid) return 'Invalid pattern';

		const selection = view.state.selection.main;
		const cursor = query.getCursor(view.state);
		let count = 0;
		let selectedIndex = 0;

		for (let next = cursor.next(); !next.done; next = cursor.next()) {
			const match = next.value;
			count += 1;

			if (match.from === selection.from && match.to === selection.to) {
				selectedIndex = count;
			}

			if (count > 9999) return '9999+ matches';
		}

		if (count === 0) return 'No matches';
		if (selectedIndex > 0) return `${selectedIndex} of ${count}`;

		return count === 1 ? '1 match' : `${count} matches`;
	}

	function updateFootnoteJumpArmed(view: EditorView, armed: boolean) {
		view.dom.classList.toggle('cm-footnote-jump-armed', armed);
	}

	function footnoteJumpModifierActive(event: MouseEvent | KeyboardEvent) {
		return event.metaKey || event.ctrlKey;
	}

	function maybeJumpToFootnote(event: MouseEvent, view: EditorView) {
		if (!event.metaKey && !event.ctrlKey) return false;

		const footnoteId = footnoteIdFromEvent(event);

		if (!footnoteId) return false;

		const line = footnoteDefinitionLine(view.state, footnoteId);

		if (!line) return false;

		event.preventDefault();
		event.stopPropagation();

		view.dispatch({
			selection: { anchor: line.from },
			effects: EditorView.scrollIntoView(line.from, { y: 'center' })
		});
		view.focus();

		return true;
	}

	function footnoteIdFromEvent(event: MouseEvent) {
		const target = event.target;

		if (!(target instanceof Element)) return '';

		return target.closest<HTMLElement>('[data-footnote-id]')?.dataset.footnoteId ?? '';
	}

	function footnoteDefinitionLine(state: EditorState, footnoteId: string) {
		for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
			const line = state.doc.line(lineNumber);
			const definition = footnoteDefinitionMatch(line.text);

			if (definition?.[2] === footnoteId) return line;
		}

		return null;
	}

	function footnoteDefinitionMatch(text: string) {
		return (/^([ \t]{0,3})\[\^([^\]\s]+)\]:(\s*)(.*)/).exec(text);
	}

	function footnoteReferenceAttributes(footnoteId: string) {
		return {
			'data-footnote-id': footnoteId,
			title: 'Cmd-click to jump to footnote'
		};
	}

	function threadAnchorFromEvent(event: MouseEvent) {
		const target = event.target;

		if (!(target instanceof HTMLElement)) return '';

		return target.closest<HTMLElement>('[data-thread-anchor]')?.dataset.threadAnchor ?? '';
	}

	function updateSelectionFromEditor(view: EditorView) {
		const anchor = commentAnchorForSelection(view);

		if (!anchor) {
			selectionQuote = '';
			selectionCommentAnchor = null;
			return;
		}

		selectionQuote = anchor.quote;
		selectionLineTop = anchor.lineTop;
		selectionCommentAnchor = anchor;
	}

	function commentAnchorForSelection(view: EditorView | null = mainEditor) {
		if (!view || !documentSurface) return null;

		const selection = view.state.selection.main;

		if (selection.empty) return null;

		const quote = view.state.sliceDoc(selection.from, selection.to).trim();
		const fromRect = view.coordsAtPos(selection.from);

		if (!quote || !fromRect) return null;

		const documentRect = documentSurface.getBoundingClientRect();
		const startLine = view.state.doc.lineAt(Math.min(selection.from, selection.to)).number;
		const endLine = view.state.doc.lineAt(Math.max(selection.from, selection.to) - 1).number;

		return {
			quote: displayTextForMarkdownLine(quote),
			markdownQuote: quote,
			lineTop: Math.max(0, fromRect.top - documentRect.top + (fromRect.bottom - fromRect.top) / 2),
			startLine,
			endLine
		};
	}

	function storedSelectionAnchor() {
		return selectionCommentAnchor;
	}

	function openCommentComposerForSelection(view: EditorView | null = mainEditor) {
		if (selectedQuote.trim()) {
			refocusActiveCommentComposer();

			return true;
		}

		const anchor = commentAnchorForSelection(view) ?? storedSelectionAnchor();

		if (!annotations || !anchor) return false;

		selectedQuote = anchor.quote;
		selectedCommentAnchor = anchor;
		selectedLineTop = anchor.lineTop;
		commentBody = '';
		clearCommentComposerAttention();

		requestAnimationFrame(updateAnchorPositions);
		focusCommentTextarea();

		return true;
	}

	function refocusActiveCommentComposer() {
		focusCommentTextarea();
		pulseCommentComposer();
		requestAnimationFrame(updateAnchorPositions);
	}

	function focusCommentTextarea() {
		void tick().then(() => {
			if (!commentTextarea) return;

			// Keep composer shortcuts on the real textarea: section-level keyboard handlers trigger
			// Svelte a11y warnings, and relying on Textarea event forwarding proved unreliable.
			// Remove before adding so repeated composer opens keep exactly one listener attached.
			commentTextarea.removeEventListener('keydown', handleCommentComposerKeydown);
			commentTextarea.addEventListener('keydown', handleCommentComposerKeydown);
			commentTextarea.focus();
		});
	}

	function pulseCommentComposer() {
		clearCommentComposerAttention();

		void tick().then(() => {
			if (!selectedQuote.trim()) return;
			if (commentComposerAttentionTimer) clearTimeout(commentComposerAttentionTimer);

			commentComposerAttention = true;
			commentComposerAttentionTimer = setTimeout(() => {
				commentComposerAttention = false;
				commentComposerAttentionTimer = null;
			}, 700);
		});
	}

	function clearCommentComposerAttention() {
		if (commentComposerAttentionTimer) {
			clearTimeout(commentComposerAttentionTimer);
			commentComposerAttentionTimer = null;
		}

		commentComposerAttention = false;
	}

	function handleCommentComposerKeydown(event: KeyboardEvent) {
		if (event.target !== commentTextarea) return;

		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			event.stopPropagation();
			void submitComment();

			return;
		}

		if (event.key !== 'Escape' || commentBody.length > 0) return;

		event.preventDefault();
		event.stopPropagation();
		clearSelection();
	}

	function openCommentContextMenu(event: MouseEvent, view: EditorView) {
		const anchor = commentAnchorForSelection(view);

		if (!annotations || !anchor || !desktopShell) return false;

		event.preventDefault();
		event.stopPropagation();

		selectionQuote = anchor.quote;
		selectionLineTop = anchor.lineTop;
		tauriInvoke<void>('show_comment_context_menu', {
			x: event.clientX,
			y: event.clientY
		})?.catch((err) => {
			console.warn('Unable to show native comment menu', err);
		});

		return true;
	}

	function updateAnchorPositions() {
		if (!documentSurface) return;

		const nextLineTops: Record<number, number> = {};

		if (mainEditor) {
			const documentRect = documentSurface.getBoundingClientRect();

			for (let lineNumber = 1; lineNumber <= mainEditor.state.doc.lines; lineNumber += 1) {
				const line = mainEditor.state.doc.line(lineNumber);
				const coords = mainEditor.coordsAtPos(line.from);

				if (coords) nextLineTops[lineNumber] = Math.max(0, coords.top - documentRect.top);
			}
		}

		lineTops = nextLineTops;

		const nextAnnotationTops: Record<string, number> = {};

		for (const element of documentSurface.querySelectorAll<HTMLElement>('[data-thread-anchor]')) {
			const id = element.dataset.threadAnchor;

			if (id) nextAnnotationTops[id] = annotationTop(element);
		}

		annotationTops = nextAnnotationTops;
		documentHeight = Math.max(documentSurface.offsetHeight, mainEditor?.dom.offsetHeight ?? 0);
	}

	function annotationTop(element: HTMLElement) {
		const documentRect = documentSurface.getBoundingClientRect();
		const rect = element.getBoundingClientRect();

		return Math.max(0, rect.top - documentRect.top + rect.height / 2);
	}

	function composeDraftChanges(currentDraftChanges: ChangeSet, update: ViewUpdate) {
		const draftIsAligned = currentDraftChanges.length === draftBaseMarkdown.length && currentDraftChanges.newLength === update.startState.doc.length;

		if (!draftIsAligned) {
			const startDoc = update.startState.doc.toString();

			return ChangeSet.of({ from: 0, to: draftBaseMarkdown.length, insert: startDoc }, draftBaseMarkdown.length).compose(update.changes);
		}

		return currentDraftChanges.compose(update.changes);
	}

	function moveAcrossMarkdownBlockWidgetLine(view: EditorView, direction: -1 | 1, extend = false) {
		const selection = view.state.selection.main;

		if (!selection.empty && !extend) return false;
		if (!shouldMoveAcrossMarkdownBlockWidgetLine(view.state, selection.head, direction)) return false;

		const target = adjacentSourceLinePosition(view.state, selection.head, direction);

		if (target === null) return false;

		view.dispatch({
			selection: extend
				? { anchor: selection.anchor, head: target }
				: { anchor: target },
			effects: EditorView.scrollIntoView(target)
		});

		return true;
	}

	function shouldMoveAcrossMarkdownBlockWidgetLine(state: EditorState, position: number, direction: -1 | 1) {
		const currentLine = state.doc.lineAt(position);
		const targetLineNumber = currentLine.number + direction;

		if (targetLineNumber < 1 || targetLineNumber > state.doc.lines) return false;

		return isNearMarkdownBlockWidgetLine(state, currentLine.number)
			|| isNearMarkdownBlockWidgetLine(state, targetLineNumber);
	}

	function adjacentSourceLinePosition(state: EditorState, position: number, direction: -1 | 1) {
		const currentLine = state.doc.lineAt(position);
		const targetLineNumber = currentLine.number + direction;

		if (targetLineNumber < 1 || targetLineNumber > state.doc.lines) return null;

		const targetLine = state.doc.line(targetLineNumber);
		const column = Math.max(0, position - currentLine.from);

		return targetLine.from + Math.min(column, targetLine.length);
	}

	function isMarkdownImageOnlyLine(state: EditorState, lineNumber: number) {
		return Boolean(markdownImageOnly(state.doc.line(lineNumber).text));
	}

	function isNearMarkdownBlockWidgetLine(state: EditorState, lineNumber: number) {
		for (const block of markdownBlockWidgetBlocks(state)) {
			if (
				lineNumber >= block.start - markdownBlockWidgetNavigationRadius
				&& lineNumber <= block.end + markdownBlockWidgetNavigationRadius
			) return true;
		}

		return false;
	}

	function markdownBlockWidgetBlocks(state: EditorState): SourceBlock[] {
		const imageBlocks: SourceBlock[] = [];
		const ignoredBlocks = [
			...markdownFrontmatterBlocks(state),
			...fencedCodeBlocks(state),
			...markdownTableBlocks(state)
		];

		for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
			if (isMarkdownImageOnlyLine(state, lineNumber)) {
				imageBlocks.push({ start: lineNumber, end: lineNumber, kind: 'line' });
			}
		}

		return [
			...imageBlocks,
			...markdownMathBlocks(state, ignoredBlocks)
		];
	}

	function smartMarkdownEnter(view: EditorView) {
		const selection = view.state.selection.main;

		if (!selection.empty) return insertNewlineAndIndent(view);

		const line = view.state.doc.lineAt(selection.head);
		const cursorOffset = selection.head - line.from;
		const blockquote = (/^([ \t]{0,3}(?:>[ \t]?)+)(.*)$/).exec(line.text);

		if (blockquote) {
			const prefix = blockquote[1];
			const indent = (/^[ \t]*/).exec(prefix)?.[0] ?? '';

			if (cursorOffset < prefix.length) return insertNewlineAndIndent(view);

			if (!blockquote[2].trim() && cursorOffset === line.length) {
				view.dispatch({
					changes: {
						from: line.from,
						to: line.from + prefix.length,
						insert: indent
					},
					selection: { anchor: line.from + indent.length }
				});

				return true;
			}

			const insert = `\n${continuedBlockquotePrefix(prefix)}`;

			view.dispatch({
				changes: {
					from: selection.head,
					insert
				},
				selection: { anchor: selection.head + insert.length }
			});

			return true;
		}

		if (!line.text.trim() && cursorOffset === line.length) {
			const outdentedIndent = outdentedBlankListContinuationIndent(view.state, line.number, line.text);

			if (outdentedIndent !== null) {
				view.dispatch({
					changes: {
						from: line.from,
						to: line.to,
						insert: outdentedIndent
					},
					selection: { anchor: line.from + outdentedIndent.length }
				});

				return true;
			}
		}

		const list = (/^(\s*)((?:[-*+]|\d+[.)]))(\s+)((?:\[[ xX]\]\s+)?)(.*)$/).exec(line.text);

		if (!list) return insertNewlineAndIndent(view);

		const prefix = `${list[1]}${list[2]}${list[3]}${list[4]}`;

		if (cursorOffset < prefix.length) return insertNewlineAndIndent(view);

		if (!list[5].trim() && cursorOffset === line.length) {
			const insert = outdentedEmptyListPrefix(view.state, line.number, list[1], list[2], list[3], list[4]);

			view.dispatch({
				changes: {
					from: line.from,
					to: line.from + prefix.length,
					insert
				},
				selection: { anchor: line.from + insert.length }
			});

			return true;
		}

		const insert = `\n${list[1]}${nextListMarker(list[2])}${list[3]}${nextTaskMarker(list[4])}`;

		view.dispatch({
			changes: {
				from: selection.head,
				insert
			},
			selection: { anchor: selection.head + insert.length }
		});

		return true;
	}

	function smartMarkdownBackspace(view: EditorView) {
		const selection = view.state.selection.main;

		if (!selection.empty) return false;

		const line = view.state.doc.lineAt(selection.head);
		const list = (/^(\s*)((?:[-*+]|\d+[.)]))(\s+)(.*)$/).exec(line.text);

		if (!list || list[4].length > 0) return false;

		const prefix = `${list[1]}${list[2]}${list[3]}`;

		if (selection.head - line.from !== prefix.length) return false;

		view.dispatch({
			changes: {
				from: line.from,
				to: line.from + prefix.length,
				insert: list[1]
			},
			selection: { anchor: line.from + list[1].length }
		});

		return true;
	}

	function nextListMarker(marker: string) {
		const ordered = (/^(\d+)([.)])$/).exec(marker);

		if (!ordered) return marker;

		return `${Number(ordered[1]) + 1}${ordered[2]}`;
	}

	function nextTaskMarker(marker: string) {
		return marker ? '[ ] ' : '';
	}

	function outdentedEmptyListPrefix(
		state: EditorState,
		lineNumber: number,
		indent: string,
		marker: string,
		spacing: string,
		taskMarker: string
	) {
		const currentIndentWidth = indentWidth(indent);

		if (currentIndentWidth <= 0) return '';

		let targetIndentWidth = emptyListOutdentTargetWidth(state, lineNumber, currentIndentWidth);

		if (targetIndentWidth >= currentIndentWidth) {
			targetIndentWidth = Math.max(0, currentIndentWidth - 2);
		}

		return `${indentStringForWidth(indent, targetIndentWidth)}${marker}${spacing}${taskMarker}`;
	}

	function outdentedBlankListContinuationIndent(state: EditorState, lineNumber: number, text: string) {
		const currentIndentWidth = leadingIndent(text);

		if (currentIndentWidth <= 0) return null;

		const listModel = listModelForEnterState(state);
		const owner = listModel.ownerByLine.get(lineNumber);
		const parent = owner?.parentLine ? listModel.items.get(owner.parentLine) : null;

		if (!owner || !parent) return null;

		const targetIndentWidth = parent.info.indent;

		if (targetIndentWidth >= currentIndentWidth) return null;

		return indentStringForWidth(text, targetIndentWidth);
	}

	function emptyListOutdentTargetWidth(state: EditorState, lineNumber: number, currentIndentWidth: number) {
		const listModel = listModelForEnterState(state);
		const item = listModel.items.get(lineNumber);
		const parent = item?.parentLine ? listModel.items.get(item.parentLine) : null;

		if (parent) return parent.info.indent;

		return Math.max(0, currentIndentWidth - 2);
	}

	function listModelForEnterState(state: EditorState) {
		const frontmatterBlocks = markdownFrontmatterBlocks(state);
		const fencedBlocks = fencedCodeBlocks(state);
		const tableBlocks = markdownTableBlocks(state);
		const ignoredBlocks = [
			...frontmatterBlocks,
			...fencedBlocks,
			...tableBlocks,
			...markdownMathBlocks(state, [
				...frontmatterBlocks,
				...fencedBlocks,
				...tableBlocks
			])
		];

		return markdownListModel(
			state,
			markdownOrderedListMarkers(state, ignoredBlocks),
			ignoredBlocks
		);
	}

	function indentStringForWidth(sourceIndent: string, targetWidth: number) {
		if (targetWidth <= 0) return '';

		let width = 0;
		let result = '';

		for (const character of sourceIndent) {
			const characterWidth = character === '\t' ? 4 : 1;

			if (width + characterWidth > targetWidth) break;

			result += character;
			width += characterWidth;

			if (width === targetWidth) return result;
		}

		return `${result}${' '.repeat(targetWidth - width)}`;
	}

	function continuedBlockquotePrefix(prefix: string) {
		return /[ \t]$/.test(prefix) ? prefix : `${prefix} `;
	}

	function displayTextForMarkdownLine(line: string) {
		const trimmed = line.trim();

		if (!trimmed) return '';

		const heading = (/^#{1,6}\s+(.+)$/).exec(trimmed);

		if (heading) return heading[1].trim();

		const task = (/^(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+(.+)$/).exec(trimmed);

		if (task) return task[1].trim();

		const list = (/^(?:[-*+]|\d+[.)])\s+(.+)$/).exec(trimmed);

		if (list) return list[1].trim();

		return trimmed;
	}

	function anchorLineForThread(thread: ThreadView) {
		return thread.pending ? thread.currentLine ?? thread.line : thread.line;
	}

	function diffLines(value: string) {
		return value.split('\n');
	}

	function diffQuote(thread: ThreadView) {
		return thread.diffQuote ?? thread.quote;
	}

	function diffBody(thread: ThreadView) {
		return thread.diffBody ?? thread.body;
	}

	function suggestionStatusLabel(thread: ThreadView) {
		if (thread.pending) return 'Draft change';
		if (thread.status === 'resolved') return 'Resolved';
		if (thread.status === 'rejected') return 'Rejected';

		return 'Accepted';
	}

	function countLabel(count: number, singular: string, plural = `${singular}s`) {
		return `${count} ${count === 1 ? singular : plural}`;
	}

	function suggestionSurfaceKind(thread: ThreadView): SuggestionSurfaceKind {
		const removed = diffQuote(thread).trim().length > 0;
		const added = diffBody(thread).trim().length > 0;

		if (removed && !added) return 'remove';
		if (!removed && added) return 'add';

		return 'replace';
	}

	function suggestionAffordanceLabel(thread: ThreadView) {
		const kind = suggestionSurfaceKind(thread);

		if (kind === 'remove') return 'deleted';
		if (kind === 'add') return 'add';

		return 'edit';
	}

	function layoutMarginItems(
		items: ThreadView[],
		activeQuote: string,
		activeLineTop: number,
		anchorTops: Record<number, number>,
		annotationAnchors: Record<string, number>,
		measuredHeights: Record<string, number>
	): MarginItem[] {
		const rawItems: Array<Omit<MarginItem, 'top'>> = items.map((thread) => ({
			type: 'thread' as const,
			id: thread.id,
			anchorTop: annotationAnchors[thread.id] ?? anchorTops[anchorLineForThread(thread)] ?? gutterReservedTop,
			height: measuredHeights[thread.id] ?? estimateThreadHeight(thread),
			connectorKind: thread.kind,
			thread
		}));

		if (activeQuote) {
			rawItems.push({
				type: 'composer',
				id: 'composer',
				anchorTop: activeLineTop,
				height: measuredHeights.composer ?? estimateComposerHeight(activeQuote),
				connectorKind: 'comment'
			});
		}

		return rawItems.sort((a, b) => a.anchorTop - b.anchorTop || (a.type === 'composer' ? -1 : 1)).reduce<MarginItem[]>(
			(laidOut, item) => {
				const previous = laidOut.at(-1);

				const top = Math.max(gutterReservedTop, item.anchorTop - 18, previous
					? previous.top + previous.height + gutterCardGap
					: gutterReservedTop);

				laidOut.push({ ...item, top } as MarginItem);

				return laidOut;
			},
			[]
		);
	}

	function estimateThreadHeight(thread: ThreadView) {
		const quoteLines = Math.min(4, Math.ceil(thread.quote.length / 48));
		const bodyLines = Math.min(5, Math.ceil(thread.body.length / 52));
		const suggestionExtra = thread.kind === 'suggestion' ? 18 : 0;
		const pendingExtra = thread.pending ? 18 : 0;

		return 104 + quoteLines * 18 + bodyLines * 19 + suggestionExtra + pendingExtra;
	}

	function estimateComposerHeight(quote: string) {
		const quoteLines = Math.min(4, Math.ceil(quote.length / 48));

		return 214 + quoteLines * 18;
	}

	function connectorPath(anchorTop: number, cardTop: number) {
		const anchorY = Math.max(12, anchorTop);
		const cardY = cardTop + 24;

		return `M 0 ${anchorY} C 12 ${anchorY}, 14 ${cardY}, 38 ${cardY}`;
	}

	function measureHeight(node: HTMLElement, id: string) {
		const updateHeight = () => {
			const height = Math.ceil(node.offsetHeight);

			if (height > 0 && cardHeights[id] !== height) {
				cardHeights = { ...cardHeights, [id]: height };
			}
		};

		const observer = new ResizeObserver(updateHeight);

		observer.observe(node);
		updateHeight();

		return {
			update(nextId: string) {
				id = nextId;
				updateHeight();
			},

			destroy() {
				observer.disconnect();
			}
		};
	}

	function clearSelection() {
		selectedQuote = '';
		selectionQuote = '';
		selectedCommentAnchor = null;
		selectionCommentAnchor = null;
		commentBody = '';
		commentTextarea?.removeEventListener('keydown', handleCommentComposerKeydown);
		clearCommentComposerAttention();
		mainEditor?.dispatch({ selection: { anchor: mainEditor.state.selection.main.head } });
	}

	function startEditingComment(thread: ThreadView) {
		if (thread.kind !== 'comment') return;

		clearSelection();
		activeThreadId = thread.id;
		editingCommentId = thread.id;
		editingCommentBody = thread.body;
		focusCommentEditTextarea();
	}

	function focusCommentEditTextarea() {
		void tick().then(() => {
			if (!editingCommentTextarea) return;

			editingCommentTextarea.removeEventListener('keydown', handleCommentEditKeydown);
			editingCommentTextarea.addEventListener('keydown', handleCommentEditKeydown);
			editingCommentTextarea.removeEventListener('click', stopCommentEditEvent);
			editingCommentTextarea.addEventListener('click', stopCommentEditEvent);
			editingCommentTextarea.removeEventListener('mousedown', stopCommentEditEvent);
			editingCommentTextarea.addEventListener('mousedown', stopCommentEditEvent);
			editingCommentTextarea.focus();

			if (editingCommentTextarea instanceof HTMLTextAreaElement) {
				const cursor = editingCommentTextarea.value.length;

				editingCommentTextarea.setSelectionRange(cursor, cursor);
			}
		});
	}

	function stopCommentEditEvent(event: Event) {
		event.stopPropagation();
	}

	function handleCommentEditKeydown(event: KeyboardEvent) {
		if (event.target !== editingCommentTextarea) return;

		event.stopPropagation();

		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void saveEditedComment(editingCommentId);

			return;
		}

		if (event.key !== 'Escape') return;

		event.preventDefault();
		cancelCommentEdit();
	}

	function cancelCommentEdit() {
		clearCommentEdit();
		requestAnimationFrame(updateAnchorPositions);
	}

	function clearCommentEdit() {
		editingCommentTextarea?.removeEventListener('keydown', handleCommentEditKeydown);
		editingCommentTextarea?.removeEventListener('click', stopCommentEditEvent);
		editingCommentTextarea?.removeEventListener('mousedown', stopCommentEditEvent);
		editingCommentTextarea = null;
		editingCommentId = '';
		editingCommentBody = '';
	}

	function settleEditorSelection() {
		clearSelection();
		mainEditor?.contentDOM.blur();
	}

	function isInsertBlockKind(value: unknown): value is InsertBlockKind {
		return value === 'table' || value === 'tasks' || value === 'bullets' || value === 'numbers';
	}

	async function setupNativeDesktopListeners() {
		const tauri = (window as TauriWindow).__TAURI__;
		const listen = tauri?.event?.listen;

		if (!listen) return;

		try {
			unlistenNativeNewMenu = await listen('margin://new-document', () => {
				createNewDocument();
			});

			unlistenNativeOpenUrls = await listen<string[]>('margin://open-urls', (event) => {
				handleNativeOpenUrls(event.payload);
			});

			unlistenNativeDocumentChanged = await listen<NativeMarkdownDocumentChange>('margin://document-changed', (event) => {
				handleNativeDocumentChanged(event.payload);
			});

			unlistenNativeOpenMenu = await listen('margin://open-document', () => {
				openLocalMarkdown();
			});

			unlistenNativeOpenFolderMenu = await listen('margin://open-folder', () => {
				openLocalFolder();
			});

			unlistenNativeOpenRecentMenu = await listen<number>('margin://open-recent-document', (event) => {
				openRecentDocument(event.payload);
			});

			unlistenNativeClearRecentMenu = await listen('margin://clear-recent-documents', () => {
				clearRecentDocuments();
			});

			unlistenNativeSaveMenu = await listen('margin://save-document', () => {
				saveLocalMarkdown();
			});

			unlistenNativeSaveAsMenu = await listen('margin://save-document-as', () => {
				saveLocalMarkdownAs();
			});

			unlistenNativePrintMenu = await listen('margin://print-document', () => {
				requestPrintDocument();
			});

			unlistenNativeCloseTabMenu = await listen('margin://close-tab', () => {
				closeActiveDocumentTab();
			});

			unlistenNativePreviousTabMenu = await listen('margin://previous-tab', () => {
				activateAdjacentDocumentTab(-1);
			});

			unlistenNativeNextTabMenu = await listen('margin://next-tab', () => {
				activateAdjacentDocumentTab(1);
			});

			unlistenNativeSettingsMenu = await listen('margin://open-settings', () => {
				openSettingsDialog();
			});

			unlistenNativeCheckUpdatesMenu = await listen('margin://check-for-updates', () => {
				openSettingsDialog();
				checkForDesktopUpdate(true);
			});

			unlistenNativeOpenFindMenu = await listen('margin://open-find', () => {
				openFindPanel();
			});

			unlistenNativeOpenFindReplaceMenu = await listen('margin://open-find-and-replace', () => {
				openFindAndReplacePanel();
			});

			unlistenNativeFindNextMenu = await listen('margin://find-next', () => {
				findNextInEditor();
			});

			unlistenNativeFindPreviousMenu = await listen('margin://find-previous', () => {
				findPreviousInEditor();
			});

			unlistenNativeToggleFileTreeMenu = await listen('margin://toggle-file-tree', () => {
				toggleFileTreePanel();
			});

			unlistenNativeInsertMenu = await listen<InsertBlockKind>('margin://insert-block', (event) => {
				if (isInsertBlockKind(event.payload)) {
					insertMarkdownBlock(event.payload);
				}
			});

			unlistenNativeCommentMenu = await listen('margin://add-comment', () => {
				openCommentComposerForSelection();
			});

			nativeMenuBridgeReady = true;
		} catch(err) {
			nativeMenuBridgeReady = false;
			console.warn('Unable to connect native menus', err);
		}

		try {
			const webview = tauri?.webview?.getCurrentWebview?.();

			if (webview?.onDragDropEvent) {
				unlistenNativeDragDrop = await webview.onDragDropEvent((event) => {
					handleNativeDragDrop(event.payload);
				});
			}
		} catch(err) {
			console.warn('Unable to connect native file drops', err);
		}
	}

	function insertMarkdownBlock(kind: InsertBlockKind) {
		if (!mainEditor) return;

		const block = insertBlocks[kind];
		const selection = mainEditor.state.selection.main;
		const doc = mainEditor.state.doc.toString();
		const prefix = insertionPrefix(doc, selection.from);
		const suffix = insertionSuffix(doc, selection.to);
		const insert = `${prefix}${block.markdown}${suffix}`;
		const cursorOffset = block.markdown.indexOf(block.cursorText);
		const anchor = selection.from + prefix.length + Math.max(0, cursorOffset);

		selectedQuote = '';
		selectionQuote = '';
		selectedCommentAnchor = null;
		selectionCommentAnchor = null;
		commentBody = '';

		mainEditor.dispatch({
			changes: { from: selection.from, to: selection.to, insert },
			selection: { anchor }
		});

		mainEditor.focus();
	}

	function insertionPrefix(doc: string, from: number) {
		const before = doc.slice(0, from);

		if (!before || before.endsWith('\n\n')) return '';
		if (before.endsWith('\n')) return '\n';

		return '\n\n';
	}

	function insertionSuffix(doc: string, to: number) {
		const after = doc.slice(to);

		if (!after) return '\n';
		if (after.startsWith('\n\n')) return '';
		if (after.startsWith('\n')) return '\n';

		return '\n\n';
	}

	function handleEditorImageDrop(event: DragEvent, view: EditorView) {
		const images = droppedImagesFromDataTransfer(event.dataTransfer);

		if (images.length === 0) return false;

		event.preventDefault();
		insertMarkdownImages(view, images, { x: event.clientX, y: event.clientY });

		return true;
	}

	function editorDropHasImages(dataTransfer: DataTransfer | null) {
		if (!dataTransfer) return false;

		for (const item of Array.from(dataTransfer.items)) {
			if (item.kind === 'file' && (!item.type || item.type.startsWith('image/'))) return true;
		}

		return imageSourcesFromDataTransfer(dataTransfer).length > 0;
	}

	function droppedImagesFromDataTransfer(dataTransfer: DataTransfer | null) {
		if (!dataTransfer) return [];

		const images: Array<{ source: string; alt: string }> = [];

		for (const file of Array.from(dataTransfer.files)) {
			if (!isImageFile(file)) continue;

			const path = (file as File & { path?: string }).path;
			const source = path || file.name;

			images.push({ source, alt: imageAltText(source) });
		}

		for (const source of imageSourcesFromDataTransfer(dataTransfer)) {
			if (images.some((image) => image.source === source)) continue;
			images.push({ source, alt: imageAltText(source) });
		}

		return images;
	}

	function imageSourcesFromDataTransfer(dataTransfer: DataTransfer) {
		const sources: string[] = [];
		const uriList = dataTransfer.getData('text/uri-list');
		const plainText = dataTransfer.getData('text/plain').trim();

		for (const line of uriList.split(/\r?\n/)) {
			const source = line.trim();

			if (source && !source.startsWith('#')) sources.push(source);
		}

		if (plainText && !sources.includes(plainText) && isImageSourceLike(plainText)) {
			sources.push(plainText);
		}

		return sources.filter(isImageSourceLike);
	}

	function isImageFile(file: File) {
		return file.type.startsWith('image/') || isImagePathLike(file.name);
	}

	function insertMarkdownImages(
		view: EditorView,
		images: Array<{ source: string; alt: string }>,
		coordinates: { x: number; y: number } | null = null
	) {
		if (images.length === 0) return;

		const position = editorPositionFromCoordinates(view, coordinates);
		const doc = view.state.doc.toString();
		const markdown = images
			.map((image) => markdownImageReference(image.source, image.alt, nativeFilePath))
			.join('\n\n');
		const prefix = insertionPrefix(doc, position);
		const suffix = insertionSuffix(doc, position);
		const insert = `${prefix}${markdown}${suffix}`;
		const anchor = droppedImageRenderAnchor(position, doc.slice(position), insert, suffix);

		selectedQuote = '';
		selectionQuote = '';
		selectedCommentAnchor = null;
		selectionCommentAnchor = null;
		commentBody = '';
		error = '';

		view.dispatch({
			changes: { from: position, to: position, insert },
			selection: { anchor }
		});

		view.focus();
	}

	function droppedImageRenderAnchor(
		position: number,
		existingAfterInsertion: string,
		insert: string,
		suffix: string
	) {
		const insertedEnd = position + insert.length;

		if (suffix) return insertedEnd;
		if (existingAfterInsertion.startsWith('\n')) return insertedEnd + 1;

		return insertedEnd;
	}

	function editorPositionFromCoordinates(
		view: EditorView,
		coordinates: { x: number; y: number } | null,
		precise = true
	) {
		if (!coordinates) return view.state.selection.main.head;

		const position = precise
			? view.posAtCoords(coordinates)
			: view.posAtCoords(coordinates, false);

		if (position !== null) return position;

		const scale = window.devicePixelRatio || 1;
		const scaledPosition = scale === 1
			? null
			: precise
				? view.posAtCoords({ x: coordinates.x / scale, y: coordinates.y / scale })
				: view.posAtCoords({ x: coordinates.x / scale, y: coordinates.y / scale }, false);

		return scaledPosition ?? view.state.selection.main.head;
	}

	function setEditorDropCursor(view: EditorView, coordinates: { x: number; y: number } | null) {
		view.dispatch({
			effects: setMarginDropCursorEffect.of(
				coordinates ? editorPositionFromCoordinates(view, coordinates, false) : null
			)
		});
	}

	function clearEditorDropCursor(view: EditorView | null = mainEditor) {
		view?.dispatch({ effects: setMarginDropCursorEffect.of(null) });
	}

	function tauriInvoke<T>(command: string, args?: Record<string, unknown>) {
		const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;

		return invoke ? invoke<T>(command, args) : null;
	}

	function shouldHandleWebNativeShortcut() {
		return desktopShell && !nativeMenuBridgeReady;
	}

	function openFindPanel(view: EditorView | null = mainEditor) {
		openSearchDialog('compact', view);
	}

	function openFindAndReplacePanel(view: EditorView | null = mainEditor) {
		openSearchDialog('expanded', view);
	}

	function openSearchDialog(mode: FindPanelMode, view: EditorView | null = mainEditor) {
		if (!view) return;
		printOptionsDialogOpen = false;
		if (settingsDialogOpen) {
			closeSettingsDialog();
			if (settingsDialogOpen) return;
		}

		findPanelMode = mode;
		findPanelPosition = null;
		openSearchPanel(view);
		activeFindPanel?.setMode(mode, { resetPosition: true });
		activeFindPanel?.focus();
	}

	function closeFindPanel(view: EditorView | null = mainEditor) {
		if (!view) return;

		closeSearchPanel(view);
	}

	function findNextInEditor() {
		if (!mainEditor) return;

		findNext(mainEditor);
	}

	function findPreviousInEditor() {
		if (!mainEditor) return;

		findPrevious(mainEditor);
	}

	async function loadAppSettings() {
		const request = desktopShell ? tauriInvoke<AppSettings>('read_settings') : null;

		try {
			const loadedSettings = request ? await request : readBrowserSettings();

			appSettings = normalizeSettings(loadedSettings);
		} catch(err) {
			console.warn('Unable to load settings', err);
			appSettings = { theme: 'auto', localUserName: defaultLocalUserName() };
		}

		settingsDraftTheme = appSettings.theme;
		settingsDraftLocalUserName = appSettings.localUserName;
		applyTheme(appSettings.theme);
	}

	function readBrowserSettings(): Partial<AppSettings> {
		try {
			return JSON.parse(localStorage.getItem(settingsStorageKey) || '{}') as Partial<AppSettings>;
		} catch {
			return {};
		}
	}

	function normalizeSettings(settings: Partial<AppSettings> | null | undefined): AppSettings {
		return {
			theme: normalizeTheme(settings?.theme),
			localUserName: normalizeLocalUserName(settings?.localUserName, defaultLocalUserName())
		};
	}

	function normalizeTheme(theme: unknown): ThemeSetting {
		return theme === 'light' || theme === 'dark' || theme === 'auto' ? theme : 'auto';
	}

	function applyTheme(theme: ThemeSetting) {
		if (theme === 'auto') {
			document.documentElement.removeAttribute('data-theme');
		} else {
			document.documentElement.dataset.theme = theme;
		}
	}

	function clearUpdateAutoCheckTimer() {
		if (!updateAutoCheckTimer) return;

		clearTimeout(updateAutoCheckTimer);
		updateAutoCheckTimer = null;
	}

	function openSettingsDialog() {
		closeFindPanel();
		printOptionsDialogOpen = false;
		settingsDraftTheme = appSettings.theme;
		settingsDraftLocalUserName = appSettings.localUserName;
		settingsError = '';
		settingsDialogOpen = true;
	}

	function closeSettingsDialog() {
		if (settingsSaving) return;

		settingsDialogOpen = false;
		settingsDraftTheme = appSettings.theme;
		settingsDraftLocalUserName = appSettings.localUserName;
		settingsError = '';
	}

	async function saveSettings() {
		settingsSaving = true;
		settingsError = '';

		const nextSettings: AppSettings = {
			theme: settingsDraftTheme,
			localUserName: settingsDraftLocalUserName.trim()
		};

		const request = desktopShell
			? tauriInvoke<AppSettings>('write_settings', { settings: nextSettings })
			: null;

		try {
			const savedSettings = request ? await request : nextSettings;

			appSettings = normalizeSettings(savedSettings);
			settingsDraftLocalUserName = appSettings.localUserName;

			if (!request) localStorage.setItem(settingsStorageKey, JSON.stringify(appSettings));

			applyTheme(appSettings.theme);
			settingsDialogOpen = false;
		} catch(err) {
			settingsError = err instanceof Error ? err.message : 'Unable to save settings';
		} finally {
			settingsSaving = false;
		}
	}

	async function checkForDesktopUpdate(manual: boolean) {
		if (!desktopShell || updateCheckState === 'checking' || updateCheckState === 'installing') {
			return;
		}

		updateCheckState = 'checking';
		updateStatusMessage = manual ? 'Checking for updates' : '';

		const request = tauriInvoke<AppUpdateMetadata | null>('check_for_app_update');
		if (!request) {
			if (manual) {
				updateCheckState = 'error';
				updateStatusMessage = 'Unable to check for updates';
			} else {
				updateCheckState = 'idle';
			}
			return;
		}

		try {
			const update = await request;

			if (update) {
				availableAppUpdate = update;
				updateCheckState = 'available';
				updateStatusMessage = `Version ${update.version} is available`;
				updateNoticeVisible = true;
			} else {
				availableAppUpdate = null;
				updateCheckState = manual ? 'current' : 'idle';
				updateStatusMessage = manual ? 'Margin is up to date' : '';
				updateNoticeVisible = false;
			}
		} catch(err) {
			const message = updateErrorMessage(err, 'Unable to check for updates');

			if (manual) {
				updateCheckState = 'error';
				updateStatusMessage = message;
			} else {
				updateCheckState = 'idle';
				updateStatusMessage = '';
				console.warn(message, err);
			}
		}
	}

	async function installDesktopUpdate() {
		if (!desktopShell || updateCheckState === 'installing') return;

		updateCheckState = 'installing';
		updateStatusMessage = 'Installing update';
		updateNoticeVisible = true;

		const request = tauriInvoke<void>('install_app_update');
		if (!request) {
			updateCheckState = 'error';
			updateStatusMessage = 'Unable to install update';
			return;
		}

		try {
			await request;
			updateStatusMessage = 'Relaunching';
		} catch(err) {
			updateCheckState = 'error';
			updateStatusMessage = updateErrorMessage(err, 'Unable to install update');
		}
	}

	function updateErrorMessage(err: unknown, fallback: string) {
		if (err instanceof Error && err.message.trim()) return err.message;
		if (typeof err === 'string' && err.trim()) return err;
		return fallback;
	}

	async function flushPendingNativeOpenUrls() {
		if (!tauriShell) return false;

		const request = tauriInvoke<string[]>('take_pending_open_urls');

		if (!request) return false;

		try {
			const urls = await request;

			await handleNativeOpenUrls(urls);

			return urls.length > 0;
		} catch(err) {
			error = err instanceof Error ? err.message : 'Unable to open linked document';

			return false;
		}
	}

	async function handleNativeOpenUrls(urls: string[]) {
		for (const nativeUrl of urls) {
			await handleNativeOpenUrl(nativeUrl);
		}
	}

	async function handleNativeOpenUrl(nativeUrl: string) {
		let parsedUrl: URL;

		try {
			parsedUrl = new URL(nativeUrl);
		} catch {
			if (isMarkdownPathLike(nativeUrl) || isAbsoluteLocalPath(nativeUrl)) {
				await openNativePath(nativeUrl);

				return;
			}

			error = `Margin could not open ${nativeUrl}`;

			return;
		}

		if (parsedUrl.protocol === 'file:') {
			await openNativePath(filePathFromFileUrl(parsedUrl));

			return;
		}

		if (parsedUrl.protocol === 'margin:') {
			await handleMarginDeepLink(parsedUrl);

			return;
		}

		error = `Margin does not understand ${parsedUrl.protocol} links yet.`;
	}

	async function handleMarginDeepLink(url: URL) {
		const path = url.searchParams.get('path') || url.searchParams.get('file');

		if (path) {
			await openNativePath(path);

			return;
		}

		const pathSegments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
		const action = url.hostname || pathSegments[0] || 'open';

		if (action === 'open' || action === 'file') {
			const pathFromRoute = url.hostname ? url.pathname : `/${pathSegments.slice(1).join('/')}`;

			if (pathFromRoute && pathFromRoute !== '/') {
				await openNativePath(decodeURIComponent(pathFromRoute));

				return;
			}
		}

		error = `Margin link received, but no handler exists for "${action}" yet.`;
	}

	function filePathFromFileUrl(url: URL) {
		const path = decodeURIComponent(url.pathname);

		return (/^\/[A-Za-z]:\//).test(path) ? path.slice(1) : path;
	}

	async function initializeRecentDocuments() {
		recentDocuments = await loadRecentDocuments();
		await syncRecentDocumentsMenu();
	}

	async function loadRecentDocuments() {
		const browserRecentDocuments = readBrowserRecentDocuments();

		if (!desktopShell) return browserRecentDocuments;

		const request = tauriInvoke<RecentDocument[]>('read_recent_documents');

		if (!request) return browserRecentDocuments;

		try {
			const nativeRecentDocuments = normalizeRecentDocuments(await request);

			return nativeRecentDocuments.length > 0 ? nativeRecentDocuments : browserRecentDocuments;
		} catch(err) {
			console.warn('Unable to load recent documents', err);

			return browserRecentDocuments;
		}
	}

	function readBrowserRecentDocuments() {
		try {
			const raw = window.localStorage.getItem(recentDocumentsStorageKey);

			if (!raw) return [];

			const parsed = JSON.parse(raw);

			return normalizeRecentDocuments(parsed);
		} catch {
			return [];
		}
	}

	function persistRecentDocuments(nextRecentDocuments: RecentDocument[]) {
		recentDocuments = normalizeRecentDocuments(nextRecentDocuments);
		writeBrowserRecentDocuments(recentDocuments);
		void syncRecentDocumentsMenu();
	}

	function writeBrowserRecentDocuments(documents: RecentDocument[]) {
		try {
			window.localStorage.setItem(recentDocumentsStorageKey, JSON.stringify(documents));
		} catch {
			// Recent documents are a convenience; failures here should not block editing.
		}
	}

	function addRecentDocument(document: NativeMarkdownDocument) {
		if (!document.path) return;

		const nextEntry = {
			path: document.path,
			title: document.name || fileNameFromPath(document.path),
			openedAt: Date.now()
		};

		persistRecentDocuments([
			nextEntry,
			...recentDocuments.filter((entry) => entry.path !== document.path)
		]);
	}

	function clearRecentDocuments() {
		persistRecentDocuments([]);
	}

	async function syncRecentDocumentsMenu() {
		if (!desktopShell) return;

		const request = tauriInvoke<RecentDocument[]>('write_recent_documents', {
			entries: recentDocuments.map(({ path, title, openedAt }) => ({ path, title, openedAt }))
		});

		if (!request) return;

		try {
			const savedRecentDocuments = normalizeRecentDocuments(await request);

			if (savedRecentDocuments.length > 0 || recentDocuments.length === 0) {
				recentDocuments = savedRecentDocuments;
				writeBrowserRecentDocuments(recentDocuments);
			}
		} catch(err) {
			console.warn('Unable to update recent documents menu', err);
		}
	}

	async function openRecentDocument(index: number) {
		const recentDocument = recentDocuments[index];

		if (!recentDocument) return;

		await openNativeMarkdownPath(recentDocument.path, { removeRecentOnFailure: true });
	}

	async function openNativePath(path: string) {
		const request = tauriInvoke<NativeOpenPathPayload>('open_native_path', { path });

		if (!request) {
			if (isMarkdownPathLike(path)) await openNativeMarkdownPath(path);

			return;
		}

		try {
			const payload = await request;

			if (payload.kind === 'directory' && payload.directory) {
				loadNativeDirectoryTree(payload.directory);

				return;
			}

			if (payload.kind === 'document' && payload.document) {
				await loadNativeMarkdownDocument(payload.document);

				return;
			}

			error = `Margin could not open ${path}`;
		} catch(err) {
			error = err instanceof Error ? err.message : 'Unable to open path';
		}
	}

	function loadNativeDirectoryTree(directory: NativeDirectoryTree) {
		fileTreeRoot = directory;
		fileTreePanelOpen = true;
		fileTreeError = '';
		error = '';
	}

	async function openNativeMarkdownPath(
		path: string,
		options: { removeRecentOnFailure?: boolean } = {}
	) {
		const request = tauriInvoke<NativeMarkdownDocument>('open_markdown_document', { path });

		if (!request) return;

		try {
			await loadNativeMarkdownDocument(await request);
		} catch(err) {
			if (options.removeRecentOnFailure) {
				persistRecentDocuments(recentDocuments.filter((entry) => entry.path !== path));
			}

			error = err instanceof Error ? err.message : 'Unable to open recent document';
		}
	}

	async function handleNativeDragDrop(payload: TauriDragDropPayload) {
		if (payload.type === 'enter') {
			dragActive = true;
			nativeDragHasEditorImages = payload.paths.some(isImagePathLike);

			if (nativeDragHasEditorImages && mainEditor) {
				setEditorDropCursor(mainEditor, dragCoordinatesFromNativePosition(payload.position));
			}

			return;
		}

		if (payload.type === 'over') {
			dragActive = true;

			if (nativeDragHasEditorImages && mainEditor) {
				setEditorDropCursor(mainEditor, dragCoordinatesFromNativePosition(payload.position));
			}

			return;
		}

		if (payload.type === 'leave') {
			dragActive = false;
			nativeDragHasEditorImages = false;
			clearEditorDropCursor();

			return;
		}

		dragActive = false;
		nativeDragHasEditorImages = false;
		clearEditorDropCursor();

		const imagePaths = payload.paths.filter(isImagePathLike);
		const markdownPaths = payload.paths.filter(isMarkdownPathLike);
		const otherPaths = payload.paths.filter((path) => !isImagePathLike(path) && !isMarkdownPathLike(path));

		if (imagePaths.length > 0) {
			if (!mainEditor) {
				error = 'Open a Markdown document before dropping images.';

				return;
			}

			insertMarkdownImages(
				mainEditor,
				imagePaths.map((path) => ({ source: path, alt: imageAltText(path) })),
				dragCoordinatesFromNativePosition(payload.position)
			);

			return;
		}

		if (markdownPaths.length === 0 && otherPaths.length === 0) {
			error = 'Drop Markdown, text, or image files.';

			return;
		}

		error = '';

		for (const path of markdownPaths) {
			await openNativeMarkdownPath(path);
		}

		for (const path of otherPaths) {
			await openNativePath(path);
		}
	}

	function dragCoordinatesFromNativePosition(position: unknown) {
		if (!position || typeof position !== 'object') return null;

		const maybePosition = position as { x?: unknown; y?: unknown };
		const x = Number(maybePosition.x);
		const y = Number(maybePosition.y);

		if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

		return { x, y };
	}

	function fileTreeRootLabel() {
		if (!fileTreeRoot) return 'No folder open';

		return compactLocalPath(fileTreeRoot.path);
	}

	function fileTreeEntryCount(entries: NativeDirectoryEntry[]): number {
		return entries.reduce((count, entry) => count + 1 + fileTreeEntryCount(entry.children), 0);
	}

	async function openFileTreeEntry(entry: NativeDirectoryEntry) {
		if (entry.kind !== 'markdown') return;

		await openNativeMarkdownPath(entry.path);
	}

	function toggleFileTreePanel() {
		fileTreePanelOpen = !fileTreePanelOpen;
	}

	function startFileTreeResize(event: PointerEvent) {
		if (!fileTreePanelOpen) return;

		event.preventDefault();
		fileTreeResizeActive = true;

		const startX = event.clientX;
		const startWidth = fileTreePanelWidth;

		const resize = (moveEvent: PointerEvent) => {
			const nextWidth = startWidth + moveEvent.clientX - startX;

			fileTreePanelWidth = clampNumber(nextWidth, fileTreePanelMinWidth, fileTreePanelMaxWidth);
		};

		const stopResize = () => {
			fileTreeResizeActive = false;
			window.removeEventListener('pointermove', resize);
			window.removeEventListener('pointerup', stopResize);
			window.removeEventListener('pointercancel', stopResize);
		};

		window.addEventListener('pointermove', resize);
		window.addEventListener('pointerup', stopResize);
		window.addEventListener('pointercancel', stopResize);
	}

	function handleFileTreeResizeKeydown(event: KeyboardEvent) {
		if (!fileTreePanelOpen) return;

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			fileTreePanelWidth = clampNumber(fileTreePanelWidth - 20, fileTreePanelMinWidth, fileTreePanelMaxWidth);
		}

		if (event.key === 'ArrowRight') {
			event.preventDefault();
			fileTreePanelWidth = clampNumber(fileTreePanelWidth + 20, fileTreePanelMinWidth, fileTreePanelMaxWidth);
		}
	}

	function createNewDocument() {
		syncActiveDocumentTab();
		createUntitledMarkdownDocument();
	}

	function createUntitledMarkdownDocument(options: { replaceActive?: boolean } = {}) {
		const fileName = nextUntitledFileName();
		const nextDocumentSessionKey = `local:untitled:${Date.now()}`;

		clearLocalAutosaveTimer();

		if (!options.replaceActive) syncActiveDocumentTab();

		localFileMode = true;
		localFileHandle = null;
		localFileName = fileName;
		localMetadataDirty = false;
		nativeFilePath = '';
		lastPersistedSerializedMarkdown = '';
		externalChange = null;
		saveState = 'idle';
		saveMessage = 'Unsaved document';
		documentSessionKey = nextDocumentSessionKey;
		activeDocumentTabId = nextDocumentSessionKey;
		documentData = standaloneDocumentData(fileName, '');
		annotations = emptyLocalAnnotations(fileName);
		resetDraftState('');
		clearSelection();

		if (options.replaceActive) documentTabs = [];

		syncActiveDocumentTab();
		requestAnimationFrame(updateAnchorPositions);
	}

	function nextUntitledFileName() {
		syncActiveDocumentTab();

		const usedNames = new Set(documentTabs.map((tab) => tab.localFileName || tab.title));

		if (!usedNames.has('Untitled.md')) return 'Untitled.md';

		for (let index = 2; index < 1000; index += 1) {
			const candidate = `Untitled ${index}.md`;

			if (!usedNames.has(candidate)) return candidate;
		}

		return `Untitled ${Date.now()}.md`;
	}

	function standaloneDocumentData(fileName: string, markdown: string): LocalDocument {
		return {
			id: documentSessionKey,
			fileName,
			markdown
		};
	}

	async function openLocalMarkdown() {
		error = '';

		const nativeOpen = desktopShell
			? tauriInvoke<NativeMarkdownDocument | null>('choose_markdown_document')
			: null;

		if (nativeOpen) {
			try {
				const document = await nativeOpen;

				if (document) await loadNativeMarkdownDocument(document);
			} catch(err) {
				error = err instanceof Error ? err.message : 'Unable to open Markdown file';
			}

			return;
		}

		const picker = window as FilePickerWindow;

		if (picker.showOpenFilePicker) {
			try {
				const [handle] = await picker.showOpenFilePicker({ multiple: false, types: markdownFileTypes });

				if (!handle) return;

				await loadLocalMarkdownFile(await handle.getFile(), handle);
			} catch(err) {
				if (isAbortError(err)) return;

				error = err instanceof Error ? err.message : 'Unable to open Markdown file';
			}

			return;
		}

		fileInput.value = '';
		fileInput.click();
	}

	async function openLocalFolder() {
		error = '';
		fileTreeError = '';

		if (!desktopShell) {
			fileTreePanelOpen = true;
			fileTreeError = 'Folder opening is available in the desktop app.';

			return;
		}

		const nativeOpen = tauriInvoke<NativeDirectoryTree | null>('choose_directory');

		if (!nativeOpen) return;

		fileTreeLoading = true;

		try {
			const directory = await nativeOpen;

			if (directory) loadNativeDirectoryTree(directory);
		} catch(err) {
			fileTreeError = err instanceof Error ? err.message : 'Unable to open folder';
		} finally {
			fileTreeLoading = false;
		}
	}

	async function handleLocalFileSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];

		input.value = '';

		if (!file) return;

		try {
			await loadLocalMarkdownFile(file, null);
		} catch(err) {
			error = err instanceof Error ? err.message : 'Unable to open Markdown file';
		}
	}

	async function loadNativeMarkdownDocument(nativeDocument: NativeMarkdownDocument) {
		const fileName = nativeDocument.name || fileNameFromPath(nativeDocument.path);

		syncActiveDocumentTab();

		const existingTab = documentTabs.find((tab) => tab.nativeFilePath === nativeDocument.path);

		if (existingTab) {
			addRecentDocument(nativeDocument);
			await applyDocumentTab(existingTab);

			return;
		}

		const nextDocumentSessionKey = `local:${nativeDocument.path}`;

		localFileMode = true;
		localFileHandle = null;
		localFileName = fileName;
		localMetadataDirty = false;
		nativeFilePath = nativeDocument.path;
		documentSessionKey = nextDocumentSessionKey;
		activeDocumentTabId = nextDocumentSessionKey;
		hydrateNativeDocumentState(nativeDocument, 'Saved');
		addRecentDocument(nativeDocument);
		watchNativeMarkdownDocument(nativeDocument.path);
		syncActiveDocumentTab();
		await tick();
		updateAnchorPositions();
	}

	function hydrateNativeDocumentState(
		nativeDocument: NativeMarkdownDocument,
		message = 'Saved',
		options: { forceEditorReload?: boolean } = {}
	) {
		const fileName = nativeDocument.name || fileNameFromPath(nativeDocument.path);
		const splitDocument = splitMarginCommentBlock(nativeDocument.markdown);

		clearLocalAutosaveTimer();

		if (options.forceEditorReload) {
			documentSessionKey = `${activeDocumentTabId || documentSessionKey}:reload:${Date.now()}`;
		}

		localFileMode = true;
		localFileHandle = null;
		localFileName = fileName;
		localMetadataDirty = false;
		nativeFilePath = nativeDocument.path;
		lastPersistedSerializedMarkdown = nativeDocument.markdown;
		externalChange = null;
		saveState = 'saved';
		saveMessage = message;
		documentData = standaloneDocumentData(fileName, splitDocument.markdown);
		annotations = localAnnotationsFromEmbeddedBlock(fileName, splitDocument.comments);
		resetDraftState(splitDocument.markdown);
		clearSelection();
	}

	async function loadLocalMarkdownFile(file: File, handle: MarkdownFileHandle | null) {
		const serializedMarkdown = await file.text();
		const splitDocument = splitMarginCommentBlock(serializedMarkdown);
		const fileName = handle?.name || file.name || 'Untitled.md';
		const nextDocumentSessionKey = `local:${Date.now()}:${fileName}`;

		clearLocalAutosaveTimer();
		syncActiveDocumentTab();
		localFileMode = true;
		localFileHandle = handle;
		localFileName = fileName;
		localMetadataDirty = false;
		nativeFilePath = '';
		lastPersistedSerializedMarkdown = serializedMarkdown;
		externalChange = null;
		saveState = 'saved';
		saveMessage = handle?.createWritable ? 'Saved' : 'Opened read-only; use Save As';
		documentSessionKey = nextDocumentSessionKey;
		activeDocumentTabId = nextDocumentSessionKey;
		documentData = standaloneDocumentData(fileName, splitDocument.markdown);
		annotations = localAnnotationsFromEmbeddedBlock(fileName, splitDocument.comments);
		resetDraftState(splitDocument.markdown);
		clearSelection();
		syncActiveDocumentTab();
		await tick();
		updateAnchorPositions();
	}

	function hasWritableLocalSaveTarget() {
		return localFileMode && ((desktopShell && Boolean(nativeFilePath)) || Boolean(localFileHandle?.createWritable));
	}

	function shouldAutosaveLocalDocument() {
		return Boolean(documentData && hasWritableLocalSaveTarget() && !externalChange && saveMessage !== 'Save failed' && hasAutosavableLocalChanges());
	}

	function clearLocalAutosaveTimer() {
		if (!localAutosaveTimer) return;

		clearTimeout(localAutosaveTimer);
		localAutosaveTimer = null;
	}

	function clearSaveProgressTimers() {
		if (saveProgressFadeTimer) {
			clearTimeout(saveProgressFadeTimer);
			saveProgressFadeTimer = null;
		}

		if (saveProgressHideTimer) {
			clearTimeout(saveProgressHideTimer);
			saveProgressHideTimer = null;
		}
	}

	function updateSaveProgressIndicator(nextSaveState: SaveState) {
		if (nextSaveState === 'saving') {
			clearSaveProgressTimers();
			saveProgressVisible = true;
			saveProgressFading = false;
			saveProgressShownAt = Date.now();

			return;
		}

		if (!saveProgressVisible || saveProgressFading || saveProgressFadeTimer) return;

		const elapsed = Date.now() - saveProgressShownAt;
		const fadeDelay = Math.max(0, saveProgressMinVisibleMs - elapsed);

		saveProgressFadeTimer = setTimeout(() => {
			saveProgressFadeTimer = null;
			saveProgressFading = true;

			saveProgressHideTimer = setTimeout(() => {
				saveProgressHideTimer = null;
				saveProgressVisible = false;
				saveProgressFading = false;
			}, saveProgressFadeMs);
		}, fadeDelay);
	}

	function scheduleLocalAutosave() {
		clearLocalAutosaveTimer();

		if (!shouldAutosaveLocalDocument()) return;

		localAutosaveTimer = setTimeout(() => {
			localAutosaveTimer = null;
			void runLocalAutosave();
		}, localAutosaveDelayMs);
	}

	async function runLocalAutosave() {
		if (!shouldAutosaveLocalDocument()) return;

		if (localAutosaveInFlight || saveState === 'saving') {
			scheduleLocalAutosave();

			return;
		}

		localAutosaveInFlight = true;

		try {
			await saveLocalMarkdown({ promptForPath: false, autosave: true });
		} finally {
			localAutosaveInFlight = false;
			if (shouldAutosaveLocalDocument()) scheduleLocalAutosave();
		}
	}

	async function flushLocalAutosave() {
		clearLocalAutosaveTimer();

		if (!shouldAutosaveLocalDocument()) return;

		await runLocalAutosave();
	}

	async function saveLocalMarkdown(options: SaveLocalMarkdownOptions = {}) {
		if (!documentData) return;

		if (!options.autosave) clearLocalAutosaveTimer();

		if (desktopShell && nativeFilePath) {
			await saveNativeMarkdownToPath(nativeFilePath);

			return;
		}

		if (!localFileMode || !localFileHandle?.createWritable) {
			if (options.promptForPath ?? true) await saveLocalMarkdownAs();

			return;
		}

		saveState = 'saving';
		saveMessage = 'Saving...';
		error = '';

		const snapshot = persistenceSnapshot();

		try {
			const file = await localFileHandle.getFile();
			const latestSerializedMarkdown = await file.text();

			if (lastPersistedSerializedMarkdown && latestSerializedMarkdown !== lastPersistedSerializedMarkdown) {
				saveState = 'conflict';
				saveMessage = 'Changed on disk';
				error = 'This file changed outside Margin. Reopen it or use Save As to keep both versions.';
				syncActiveDocumentTab();

				return;
			}

			const writable = await localFileHandle.createWritable();

			await writable.write(snapshot.serializedMarkdown);
			await writable.close();
			markLocalFileSaved(snapshot.markdown, localFileHandle.name, 'Saved', snapshot.annotations, snapshot.serializedMarkdown, snapshot.revision, snapshot.documentSessionKey);
		} catch(err) {
			if (isAbortError(err)) return;

			saveState = 'dirty';
			saveMessage = 'Save failed';
			error = err instanceof Error ? err.message : 'Unable to save Markdown file';
		}
	}

	async function saveLocalMarkdownAs() {
		if (!documentData) return;
		if (saveDialogOpen) return;

		clearLocalAutosaveTimer();
		saveDialogOpen = true;

		try {
			error = '';

			const suggestedName = localFileName || documentData.fileName || 'document.md';

			const nativeSavePath = desktopShell
				? tauriInvoke<string | null>('choose_markdown_save_path', { suggestedName })
				: null;

			if (nativeSavePath) {
				try {
					const path = await nativeSavePath;

					if (!path) return;

					await saveNativeMarkdownToPath(path);
				} catch(err) {
					refreshLocalSaveState();
					error = err instanceof Error ? err.message : 'Unable to save Markdown file';
				}

				return;
			}

			const picker = window as FilePickerWindow;

			if (picker.showSaveFilePicker) {
				saveState = 'saving';
				saveMessage = 'Saving...';

				try {
					const handle = await picker.showSaveFilePicker({ suggestedName, types: markdownFileTypes });
					const writable = await handle.createWritable?.();

					if (!writable) throw new Error('This environment cannot write to that file directly');

					const snapshot = persistenceSnapshot();

					await writable.write(snapshot.serializedMarkdown);
					await writable.close();
					localFileMode = true;
					localFileHandle = handle;
					markLocalFileSaved(snapshot.markdown, handle.name, 'Saved', snapshot.annotations, snapshot.serializedMarkdown, snapshot.revision, snapshot.documentSessionKey);
				} catch(err) {
					if (isAbortError(err)) return;

					saveState = 'dirty';
					saveMessage = 'Save failed';
					error = err instanceof Error ? err.message : 'Unable to save Markdown file';
				}

				return;
			}

			const snapshot = persistenceSnapshot();

			downloadMarkdown(snapshot.serializedMarkdown, localFileName || documentData.fileName || 'document.md');
			localFileMode = true;
			markLocalFileSaved(snapshot.markdown, localFileName || documentData.fileName || 'document.md', 'Downloaded copy', snapshot.annotations, snapshot.serializedMarkdown, snapshot.revision, snapshot.documentSessionKey);
		} finally {
			saveDialogOpen = false;
		}
	}

	async function saveNativeMarkdownToPath(path: string) {
		if (!documentData) return;

		saveState = 'saving';
		saveMessage = 'Saving...';
		error = '';

		const snapshot = persistenceSnapshot();

		const conflictingDocument = await changedNativeDocumentBeforeSave(path);

		if (conflictingDocument) {
			externalChange = { ...conflictingDocument, detectedAt: Date.now() };
			saveState = 'conflict';
			saveMessage = 'Changed on disk';
			error = 'This file changed outside Margin. Reload it or use Save As to keep both versions.';
			syncActiveDocumentTab();

			return;
		}

		const request = tauriInvoke<NativeMarkdownDocument>('save_markdown_document', { path, markdown: snapshot.serializedMarkdown });

		if (!request) {
			await saveLocalMarkdownAs();

			return;
		}

		try {
			const document = await request;

			localFileMode = true;
			localFileHandle = null;
			nativeFilePath = document.path;
			localFileName = document.name;
			markLocalFileSaved(snapshot.markdown, document.name, 'Saved', snapshot.annotations, snapshot.serializedMarkdown, snapshot.revision, snapshot.documentSessionKey);
			addRecentDocument(document);
			watchNativeMarkdownDocument(document.path);
		} catch(err) {
			saveState = 'dirty';
			saveMessage = 'Save failed';
			error = err instanceof Error ? err.message : 'Unable to save Markdown file';
		}
	}

	async function changedNativeDocumentBeforeSave(path: string) {
		if (!desktopShell || !nativeFilePath || path !== nativeFilePath || !lastPersistedSerializedMarkdown) {
			return null;
		}

		const request = tauriInvoke<NativeMarkdownDocument>('open_markdown_document', { path });

		if (!request) return null;

		let document: NativeMarkdownDocument;

		try {
			document = await request;
		} catch(err) {
			console.warn('Unable to check native document before save', err);

			return null;
		}

		return document.markdown === lastPersistedSerializedMarkdown ? null : document;
	}

	function watchNativeMarkdownDocument(path: string) {
		if (!desktopShell || !path) return;

		const request = tauriInvoke<void>('watch_markdown_document', { path });

		if (!request) return;

		request.catch((err) => {
			console.warn('Unable to watch native document', err);
		});
	}

	async function handleNativeDocumentChanged(change: NativeMarkdownDocumentChange) {
		if (!desktopShell || !change.path || change.path !== nativeFilePath || saveState === 'saving' || fileChangeCheckInFlight) return;
		if (!lastPersistedSerializedMarkdown) return;

		fileChangeCheckInFlight = true;

		const path = change.path;
		const request = tauriInvoke<NativeMarkdownDocument>('open_markdown_document', { path });

		if (!request) {
			fileChangeCheckInFlight = false;

			return;
		}

		try {
			const document = await request;

			if (path !== nativeFilePath) return;
			if (document.markdown === lastPersistedSerializedMarkdown) return;
			if (externalChange?.path === document.path && externalChange.markdown === document.markdown) return;

			if (!hasUnsavedLocalChanges()) {
				hydrateNativeDocumentState(document, 'Reloaded from disk', { forceEditorReload: true });
				addRecentDocument(document);
				syncActiveDocumentTab();
				await tick();
				updateAnchorPositions();

				return;
			}

			externalChange = { ...document, detectedAt: Date.now() };
			saveState = 'conflict';
			saveMessage = 'Changed on disk';
			syncActiveDocumentTab();
		} catch(err) {
			console.warn('Unable to check for external document changes', err);
		} finally {
			fileChangeCheckInFlight = false;
		}
	}

	function hasUnsavedLocalChanges(markdown = activeEditorMarkdown()) {
		return markdown !== baseMarkdown || localMetadataDirty || pendingEditThreads.length > 0 || commentBody.trim().length > 0;
	}

	function hasAutosavableLocalChanges(markdown = activeEditorMarkdown()) {
		return markdown !== baseMarkdown || localMetadataDirty || pendingEditThreads.length > 0;
	}

	async function reloadExternalChange() {
		if (!externalChange) return;

		if (hasUnsavedLocalChanges() && !window.confirm('Reload this file from disk? Unsaved Margin edits in this tab will be discarded.')) {
			return;
		}

		const document = externalChange;

		hydrateNativeDocumentState(document, 'Reloaded from disk', { forceEditorReload: true });
		addRecentDocument(document);
		syncActiveDocumentTab();
		await tick();
		updateAnchorPositions();
	}

	function markLocalFileSaved(
		markdown: string,
		fileName: string,
		message = 'Saved',
		savedAnnotations = annotationsForPersistence(),
		serializedMarkdown = appendMarginCommentBlock(markdown, marginCommentBlockFromAnnotations(savedAnnotations)),
		revision = localEditRevision,
		savedDocumentSessionKey = documentSessionKey
	) {
		if (savedDocumentSessionKey !== documentSessionKey) return;

		const currentMarkdown = activeEditorMarkdown();
		const savedSnapshotStillCurrent = revision === localEditRevision && currentMarkdown === markdown;

		localFileName = fileName;
		lastPersistedSerializedMarkdown = serializedMarkdown;
		externalChange = null;

		if (documentData) {
			documentData = { ...documentData, fileName, markdown: currentMarkdown };
		}

		if (savedSnapshotStillCurrent) {
			annotations = savedAnnotations;
			localMetadataDirty = false;
			saveState = 'saved';
			saveMessage = message;
			resetDraftState(markdown);
		} else {
			editorMarkdown = currentMarkdown;
			baseMarkdown = markdown;
			saveState = 'dirty';
			saveMessage = 'Unsaved changes';
			scheduleLocalAutosave();
		}

		syncActiveDocumentTab();
	}

	function markLocalDocumentDirty(message = 'Unsaved changes') {
		if (!localFileMode) return;

		localEditRevision += 1;
		localMetadataDirty = true;
		saveState = externalChange ? 'conflict' : 'dirty';
		saveMessage = externalChange ? 'Changed on disk' : message;
		syncActiveDocumentTab();
		scheduleLocalAutosave();
	}

	function refreshLocalSaveState(markdown = activeEditorMarkdown()) {
		const dirty = markdown !== baseMarkdown || localMetadataDirty;

		if (externalChange) {
			saveState = 'conflict';
			saveMessage = 'Changed on disk';

			return;
		}

		saveState = dirty ? 'dirty' : 'saved';
		saveMessage = dirty ? 'Unsaved changes' : 'Saved';
	}

	function persistenceSnapshot(markdown = activeEditorMarkdown()) {
		const snapshotAnnotations = annotationsForPersistence();

		return {
			markdown,
			annotations: snapshotAnnotations,
			serializedMarkdown: appendMarginCommentBlock(markdown, marginCommentBlockFromAnnotations(snapshotAnnotations)),
			revision: localEditRevision,
			documentSessionKey
		};
	}

	function annotationsForPersistence(): LocalAnnotations | null {
		if (!annotations || pendingEditThreads.length === 0) return annotations;

		const existingSuggestionKeys = new Set(annotations.suggestions.map((suggestion) => suggestionKey(suggestion.anchor.start_line, suggestion.anchor.end_line, suggestion.original, suggestion.replacement)));

		const materializedSuggestions = pendingEditThreads.filter((thread) => thread.kind === 'suggestion').filter((thread) => {
			const key = suggestionKey(thread.line, thread.endLine, thread.quote, thread.body);

			if (existingSuggestionKeys.has(key)) return false;

			existingSuggestionKeys.add(key);

			return true;
		}).map(pendingThreadToSuggestion);

		if (materializedSuggestions.length === 0) return annotations;

		return {
			...annotations,
			author: localAuthor,
			suggestions: [...annotations.suggestions, ...materializedSuggestions]
		};
	}

	function pendingThreadToSuggestion(thread: ThreadView, index: number): MarginSuggestion {
		const startLine = thread.currentLine ?? thread.line;
		const endLine = thread.currentEndLine ?? thread.endLine;

		return {
			id: `local-suggestion-${Date.now()}-${index}`,
			author: thread.author,
			original: thread.quote,
			replacement: thread.body,
			applied: thread.status !== 'rejected',
			resolved: Boolean(thread.resolved),
			anchor: {
				start_line: startLine,
				end_line: endLine,
				quote: thread.quote,
				prefix: '',
				suffix: '',
				heading_path: [],
				content_hash: `local-${startLine}-${endLine}-${thread.quote.length}`
			},
			created_at: new Date().toISOString()
		};
	}

	function marginCommentBlockFromAnnotations(snapshotAnnotations: LocalAnnotations | null = annotations): MarginCommentBlock | null {
		if (!snapshotAnnotations) return null;

		return {
			schema: 'margin.markdown-comments',
			version: 1,
			annotations_id: snapshotAnnotations.id,
			author: snapshotAnnotations.author,
			comments: snapshotAnnotations.comments,
			suggestions: snapshotAnnotations.suggestions,
			updated_at: new Date().toISOString()
		};
	}

	function resetDraftState(markdown: string) {
		editorMarkdown = markdown;
		baseMarkdown = markdown;
		resetSuggestionDraftState(markdown);
		syncedEditKeys.clear();
	}

	function resetSuggestionDraftState(markdown = activeEditorMarkdown()) {
		draftBaseMarkdown = markdown;
		draftChanges = ChangeSet.empty(markdown.length);
		pendingEditThreads = [];
	}

	function setEditingMode(nextMode: EditingMode) {
		if (editMode === nextMode) return;

		if (editMode === 'suggest') {
			materializePendingEditSuggestions();
		}

		editMode = nextMode;
		resetSuggestionDraftState(activeEditorMarkdown());
		syncActiveDocumentTab();
	}

	function materializePendingEditSuggestions(message = 'Unsaved annotations') {
		if (!annotations || pendingEditThreads.length === 0) return false;

		const savedAnnotations = annotationsForPersistence();

		if (savedAnnotations) annotations = savedAnnotations;

		for (const thread of pendingEditThreads) {
			syncedEditKeys.add(suggestionKey(thread.line, thread.endLine, thread.quote, thread.body));
		}

		resetSuggestionDraftState(activeEditorMarkdown());
		markLocalDocumentDirty(message);

		return true;
	}

	function downloadMarkdown(markdown: string, fileName: string) {
		const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');

		anchor.href = url;
		anchor.download = fileName;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	function requestPrintDocument() {
		if (!documentData) return;

		closeFindPanel();
		if (settingsDialogOpen) closeSettingsDialog();
		if (settingsDialogOpen) return;

		printOptionsDialogOpen = true;
	}

	async function confirmPrintDocument() {
		printOptionsDialogOpen = false;
		await tick();
		await printDocument({ includeMarginNotesAppendix });
	}

	async function printDocument(options: PrintDocumentOptions = {}) {
		if (!documentData) return;

		editorMarkdown = activeEditorMarkdown();
		printDocumentHtml = renderPrintMarkdown(editorMarkdown, { resolveImageSrc: resolveMarkdownImageSrc });
		printableThreads = options.includeMarginNotesAppendix === false
			? []
			: printAppendixCandidateThreads;
		await tick();

		const nativePrint = desktopShell ? tauriInvoke<void>('print_window') : null;

		if (nativePrint) {
			try {
				await nativePrint;

				return;
			} catch(err) {
				console.warn('Unable to use native print', err);
			}
		}

		window.print();
	}

	function isAbortError(err: unknown) {
		return err instanceof DOMException && err.name === 'AbortError';
	}

	function emptyLocalAnnotations(fileName: string): LocalAnnotations {
		return {
			id: `local-annotations:${Date.now()}`,
			fileName,
			author: localAuthor,
			comments: [],
			suggestions: [],
			created_at: new Date().toISOString()
		};
	}

	function localAnnotationsFromEmbeddedBlock(fileName: string, comments: MarginCommentBlock | null): LocalAnnotations {
		const fallback = emptyLocalAnnotations(fileName);

		if (!comments) return fallback;

		return {
			...fallback,
			id: comments.annotations_id,
			author: comments.author || localAuthor,
			comments: comments.comments,
			suggestions: comments.suggestions,
			created_at: comments.updated_at
		};
	}

	function handleGlobalShortcut(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		if (handleFindShortcut(event)) return;
		if (!shouldHandleWebNativeShortcut()) return;

		const mod = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();

		if (mod && event.altKey && !event.shiftKey && key === 'm') {
			event.preventDefault();
			openCommentComposerForSelection();

			return;
		}

		if (!mod || event.altKey) return;

		if (!event.shiftKey && key === 'b') {
			event.preventDefault();
			toggleFileTreePanel();
		}

		if (!event.shiftKey && key === 's') {
			event.preventDefault();
			saveLocalMarkdown();
		}

		if (!event.shiftKey && key === 'p') {
			event.preventDefault();
			requestPrintDocument();
		}

		if (!event.shiftKey && key === 'n') {
			event.preventDefault();
			createNewDocument();
		}

		if (!event.shiftKey && key === 'o') {
			event.preventDefault();
			openLocalMarkdown();
		}

		if (event.shiftKey && key === 'o') {
			event.preventDefault();
			openLocalFolder();
		}

		if (!event.shiftKey && key === 'w') {
			event.preventDefault();
			closeActiveDocumentTab();
		}

		if (!event.shiftKey && key === ',') {
			event.preventDefault();
			openSettingsDialog();
		}

		if (event.shiftKey && event.key === '[') {
			event.preventDefault();
			activateAdjacentDocumentTab(-1);
		}

		if (event.shiftKey && event.key === ']') {
			event.preventDefault();
			activateAdjacentDocumentTab(1);
		}
	}

	function handleFindShortcut(event: KeyboardEvent) {
		if (!mainEditor) return false;

		const target = event.target;
		if (target instanceof Element && target.closest('.margin-find-panel')) return false;

		const mod = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();

		if (mod && !event.altKey && !event.shiftKey && key === 'f') {
			event.preventDefault();
			openFindPanel();

			return true;
		}

		if (mod && event.altKey && !event.shiftKey && key === 'f') {
			event.preventDefault();
			openFindAndReplacePanel();

			return true;
		}

		if (mod && !event.altKey && key === 'g') {
			event.preventDefault();

			if (event.shiftKey) {
				findPreviousInEditor();
			} else {
				findNextInEditor();
			}

			return true;
		}

		if (!mod && !event.altKey && key === 'f3') {
			event.preventDefault();

			if (event.shiftKey) {
				findPreviousInEditor();
			} else {
				findNextInEditor();
			}

			return true;
		}

		return false;
	}

	function handleBeforeUnload(event: BeforeUnloadEvent) {
		syncActiveDocumentTab();

		const hasDirtyLocalTab = documentTabs.some((tab) => tab.localFileMode && (tab.saveState === 'dirty' || tab.saveState === 'conflict'));

		if (!hasDirtyLocalTab) return;

		event.preventDefault();
		event.returnValue = '';
	}

	async function submitComment() {
		if (!annotations || !selectedQuote || !commentBody) return;

		annotations = {
			...annotations,
			author: localAuthor,
			comments: [
				...annotations.comments,
				{
					id: `local-comment-${Date.now()}`,
					author: localAuthor,
					body: commentBody,
					resolved: false,
					anchor: localAnchorForSelection(selectedQuote),
					created_at: new Date().toISOString()
				}
			]
		};

		markLocalDocumentDirty('Unsaved annotations');
		await tick();
		updateAnchorPositions();
		settleEditorSelection();
	}

	async function saveEditedComment(commentId: string) {
		const nextBody = editingCommentBody;

		if (!annotations || !commentId || !nextBody.trim()) return;

		const existingComment = annotations.comments.find((comment) => comment.id === commentId);

		if (!existingComment) {
			clearCommentEdit();
			return;
		}

		if (existingComment.body !== nextBody) {
			annotations = {
				...annotations,
				comments: annotations.comments.map((comment) => comment.id === commentId ? { ...comment, body: nextBody } : comment)
			};

			markLocalDocumentDirty('Unsaved annotations');
		}

		activeThreadId = commentId;
		clearCommentEdit();
		await tick();
		updateAnchorPositions();
	}

	async function acceptSuggestion(thread: ThreadView) {
		if (!annotations || thread.kind !== 'suggestion') return;

		activeThreadId = thread.id;
		replaceInEditor(thread.quote, thread.body);

		if (thread.pending) {
			syncedEditKeys.add(suggestionKey(thread.line, thread.endLine, thread.quote, thread.body));
			pendingEditThreads = pendingEditThreads.filter((candidate) => candidate.id !== thread.id);
		} else {
			annotations = updateLocalSuggestion(thread.id, { applied: true, resolved: false });
			markLocalDocumentDirty('Unsaved annotations');
		}

		await tick();
		updateAnchorPositions();
	}

	async function rejectSuggestion(thread: ThreadView) {
		if (!annotations || thread.kind !== 'suggestion') return;

		activeThreadId = thread.id;
		replaceInEditor(thread.body, thread.quote);

		if (thread.pending) {
			pendingEditThreads = pendingEditThreads.filter((candidate) => candidate.id !== thread.id);
		} else {
			annotations = updateLocalSuggestion(thread.id, { applied: false, resolved: false });
			markLocalDocumentDirty('Unsaved annotations');
		}

		await tick();
		updateAnchorPositions();
	}

	async function resolveSuggestion(thread: ThreadView) {
		if (!annotations || thread.kind !== 'suggestion') return;

		activeThreadId = thread.id;

		if (thread.pending) {
			syncedEditKeys.add(suggestionKey(thread.line, thread.endLine, thread.quote, thread.body));
			pendingEditThreads = pendingEditThreads.filter((candidate) => candidate.id !== thread.id);
		} else {
			annotations = updateLocalSuggestion(thread.id, { resolved: true });
			markLocalDocumentDirty('Unsaved annotations');
		}

		await tick();
		updateAnchorPositions();
	}

	function updateLocalSuggestion(
		suggestionId: string,
		patch: { applied?: boolean; resolved?: boolean }
	): LocalAnnotations | null {
		if (!annotations) return annotations;

		return {
			...annotations,
			suggestions: annotations.suggestions.map((suggestion) => suggestion.id === suggestionId ? { ...suggestion, ...patch } : suggestion)
		};
	}

	function replaceInEditor(search: string, replacement: string) {
		if (!mainEditor || !search || search === replacement) return;

		const doc = mainEditor.state.doc.toString();
		const index = doc.indexOf(search);

		if (index < 0) return;

		mainEditor.dispatch({
			changes: { from: index, to: index + search.length, insert: replacement }
		});

		editorMarkdown = mainEditor.state.doc.toString();
		pendingEditThreads = draftMarkdownSuggestions(draftChanges, draftBaseMarkdown, editorMarkdown, persistedThreads, { author: localAuthor, syncedKeys: syncedEditKeys });
	}

	function localAnchorForSelection(quote: string): MarginAnchor {
		const selection = mainEditor?.state.selection.main;
		const markdown = mainEditor?.state.doc.toString() ?? editorMarkdown;

		const rawQuote = selection && mainEditor
			? mainEditor.state.sliceDoc(selection.from, selection.to).trim()
			: quote;

		const anchorQuote = rawQuote || quote;
		const startOffset = selection?.from ?? 0;
		const endOffset = selection?.to ?? startOffset + anchorQuote.length;

		const startLine = selection && mainEditor
			? mainEditor.state.doc.lineAt(selection.from).number
			: 1;

		const endLine = selection && mainEditor
			? mainEditor.state.doc.lineAt(Math.max(selection.from, selection.to - 1)).number
			: startLine;

		return {
			start_line: startLine,
			end_line: endLine,
			quote: anchorQuote,
			prefix: markdown.slice(Math.max(0, startOffset - anchorContextCharacters), startOffset),
			suffix: markdown.slice(endOffset, Math.min(markdown.length, endOffset + anchorContextCharacters)),
			heading_path: headingPathBefore(markdown, startOffset),
			content_hash: `local-${hashString(`${anchorQuote}\u0000${startLine}\u0000${endLine}`)}`
		};
	}

	function headingPathBefore(markdown: string, offset: number) {
		const headings: string[] = [];
		const lines = markdown.slice(0, offset).split('\n');

		for (const line of lines) {
			const match = (/^(#{1,6})\s+(.+)$/).exec(line.trim());

			if (!match) continue;

			const depth = match[1].length;

			headings.splice(depth - 1);
			headings[depth - 1] = match[2].trim();
		}

		return headings.filter(Boolean);
	}

	function hashString(value: string) {
		let hash = 2166136261;

		for (let index = 0; index < value.length; index += 1) {
			hash ^= value.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}

		return (hash >>> 0).toString(36);
	}

	function goToThread(thread: ThreadView) {
		if (!mainEditor) return;

		activeThreadId = thread.id;

		const range = threadRangeInState(mainEditor.state, thread);

		if (!range) return;

		mainEditor.dispatch({ selection: { anchor: range.from, head: range.to } });
		mainEditor.focus();
	}

	async function resolveComment(thread: ThreadView) {
		if (!annotations || thread.kind !== 'comment') return;

		if (editingCommentId === thread.id) clearCommentEdit();

		annotations = {
			...annotations,
			comments: annotations.comments.map((comment) => comment.id === thread.id ? { ...comment, resolved: true } : comment)
		};

		markLocalDocumentDirty('Unsaved annotations');
		await tick();
		updateAnchorPositions();
	}
</script>

<main
	class="doc-app"
	class:desktop-shell={desktopShell}
	class:mobile-shell={mobileShell}
	class:drag-active={dragActive}
	class:file-tree-resizing={fileTreeResizeActive}
>
	<div class="window-tabbar" aria-label="Open documents">
		{#each visibleDocumentTabs as tab (tab.id)}
			<div
				class="document-tab-shell"
				class:active={tab.id === activeDocumentTabId}
			>
				<Button
					variant="ghost"
					size="sm"
					class="document-tab"
					aria-current={tab.id === activeDocumentTabId ? 'page' : undefined}
					onclick={() => activateDocumentTab(tab.id)}
				>
					<span class="document-tab-title">{tab.title}</span>

					{#if tabHasDiscardableWork(tab)}
						<span
							class="document-tab-dirty"
							aria-label="Unsaved changes"
						></span>
					{/if}
				</Button>

				<Button
					variant="ghost"
					size="icon-xs"
					class="document-tab-close"
					aria-label={`Close ${tab.title}`}
					onclick={(event) => {
						event.stopPropagation();
						closeDocumentTab(tab.id);
					}}
				>
					<XIcon aria-hidden="true" />
				</Button>
			</div>
			{/each}

		<div
			class="window-tabbar-drag"
			data-tauri-drag-region
			aria-hidden="true"
		></div>

		<ToggleGroup.Root
			class="titlebar-mode-toggle"
			aria-label="Editing mode"
			type="single"
			value={editMode}
		>
			<ToggleGroup.Item
				class={`titlebar-mode-button${editMode === 'edit' ? ' active' : ''}`}
				value="edit"
				aria-label="Edit directly"
				title="Edit directly"
				onclick={() => setEditingMode('edit')}
			>
				<span
					class="mode-icon mode-icon-edit"
					aria-hidden="true"
				>
					<span class="edit-glyph-letter">A</span>
					<span class="edit-glyph-caret"></span>
				</span>
			</ToggleGroup.Item>

			<ToggleGroup.Item
				class={`titlebar-mode-button${editMode === 'suggest' ? ' active' : ''}`}
				value="suggest"
				aria-label="Suggest edits"
				title="Suggest edits"
				onclick={() => setEditingMode('suggest')}
			>
				<svg
					class="mode-icon mode-icon-suggest"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path d="M6 5v14"></path>
					<path d="M10 7h8"></path>
					<path d="M10 12h6"></path>
					<path d="M10 17h4"></path>
					<path d="M17 15l2 2 3-4"></path>
				</svg>
			</ToggleGroup.Item>
		</ToggleGroup.Root>
	</div>

	<div class="doc-titlebar-shell">
		<header class="doc-topbar">
			<input
				class="local-file-input"
				bind:this={fileInput}
				type="file"
				accept=".md,.markdown,text/markdown,text/plain"
				on:change={handleLocalFileSelected}
			/>

			<div class="brand-cluster" data-tauri-drag-region>
				<div class="brand-mark">M</div>

				<div class="brand-title" data-tauri-drag-region>
					<p
						class="eyebrow"
						class:eyebrow-placeholder={!titlebarEyebrowLabel}
						class:placeholder-eyebrow={titlebarEyebrowPlaceholder}
						aria-hidden={titlebarEyebrowLabel ? undefined : 'true'}
					>
						{titlebarEyebrowLabel}
					</p>
					<h1>{documentTitleLabel}</h1>
				</div>
			</div>

			<div
				class="window-drag-spacer"
				data-tauri-drag-region
				aria-hidden="true"
			></div>

			<div class="topbar-actions" aria-label="Document actions">
				<Button
					variant="ghost"
					size="icon-sm"
					class="topbar-icon-button"
					aria-label="New document"
					title="New document"
					onclick={createNewDocument}
				>
					<FilePlusIcon aria-hidden="true" />
				</Button>

				<Button
					variant="ghost"
					size="icon-sm"
					class="topbar-icon-button"
					aria-label="Open document"
					title="Open document"
					onclick={openLocalMarkdown}
				>
					<FolderOpenIcon aria-hidden="true" />
				</Button>

				<Button
					variant="ghost"
					size="icon-sm"
					class="topbar-icon-button"
					aria-label="Save document"
					title="Save document"
					onclick={() => saveLocalMarkdown()}
				>
					<SaveIcon aria-hidden="true" />
				</Button>

				<Button
					variant="ghost"
					size="icon-sm"
					class="topbar-icon-button"
					aria-label="Print document"
					title="Print document"
					onclick={requestPrintDocument}
				>
					<PrinterIcon aria-hidden="true" />
				</Button>

				<Button
					variant="ghost"
					size="icon-sm"
					class="topbar-icon-button"
					aria-label="Settings"
					title="Settings"
					onclick={openSettingsDialog}
				>
					<SettingsIcon aria-hidden="true" />
				</Button>
			</div>
		</header>

		<div
			class="doc-toolbar"
			aria-label="Document tools"
			data-tauri-drag-region
		>
			<ToggleGroup.Root
				class="mobile-mode-toggle"
				aria-label="Editing mode"
				type="single"
				value={editMode}
			>
				<ToggleGroup.Item
					class={`mobile-mode-button${editMode === 'edit' ? ' active' : ''}`}
					value="edit"
					aria-label="Edit directly"
					title="Edit directly"
					onclick={() => setEditingMode('edit')}
				>
					<span
						class="mode-icon mode-icon-edit"
						aria-hidden="true"
					>
						<span class="edit-glyph-letter">A</span>
						<span class="edit-glyph-caret"></span>
					</span>
				</ToggleGroup.Item>

				<ToggleGroup.Item
					class={`mobile-mode-button${editMode === 'suggest' ? ' active' : ''}`}
					value="suggest"
					aria-label="Suggest edits"
					title="Suggest edits"
					onclick={() => setEditingMode('suggest')}
				>
					<svg
						class="mode-icon mode-icon-suggest"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path d="M6 5v14"></path>
						<path d="M10 7h8"></path>
						<path d="M10 12h6"></path>
						<path d="M10 17h4"></path>
						<path d="M17 15l2 2 3-4"></path>
					</svg>
				</ToggleGroup.Item>
			</ToggleGroup.Root>
		</div>
	</div>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	{#if externalChange}
		<section class="external-change-alert" aria-live="polite">
			<div>
				<strong>Changed on disk</strong>
				<span>{externalChange.name || fileNameFromPath(externalChange.path)} changed outside Margin.</span>
			</div>

			<div class="external-change-actions">
				<Button
					variant="ghost"
					size="sm"
					onclick={reloadExternalChange}
				>
					Reload
				</Button>

				<Button
					variant="ghost"
					size="sm"
					onclick={() => saveLocalMarkdownAs()}
				>
					Save As
				</Button>
			</div>
		</section>
	{/if}

	<div
		class="workspace-layout"
		class:file-tree-visible={fileTreePanelOpen}
		style={`--file-tree-panel-width: ${fileTreePanelWidth}px;`}
	>
		{#if !fileTreePanelOpen}
			<nav class="activity-rail workspace-activity-rail" aria-label="Workspace views">
				<Button
					variant="ghost"
					size="icon-sm"
					class="activity-icon-button"
					aria-label="Show file tree"
					aria-pressed="false"
					title="Show file tree"
					onclick={toggleFileTreePanel}
				>
					<FolderTreeIcon aria-hidden="true" />
				</Button>
			</nav>
		{/if}

			<div
				class="editor-layout"
				class:margin-rail-open={marginRailOpen}
			>
				<section class="paper-column">
					<article
						class="document-surface live-preview-surface"
						bind:this={documentSurface}
						aria-label="Markdown live preview editor"
					>
						{#if documentData}
							<div
								class="live-preview-editor"
								use:codeMirrorLiveEditor={{
									value: documentData.markdown,
									threads,
									documentKey: documentSessionKey
								}}
							></div>
						{/if}
					</article>
				</section>

				<aside
					class="margin-rail"
					class:open={marginRailOpen}
					class:empty={!marginRailOpen}
					aria-label="Document comments"
				>
					<div
						class="comment-stage"
						style={`min-height: ${stageHeight}px;`}
					>
						{#if marginItems.length > 0}
							<svg
								class="connector-layer"
								viewBox={`0 0 340 ${stageHeight}`}
								preserveAspectRatio="none"
								aria-hidden="true"
							>
								{#each marginItems as item}
									<path
										class="connector-shadow"
										class:connector-suggestion={item.connectorKind === 'suggestion'}
										class:connector-composer={item.type === 'composer'}
										class:connector-active={activeThreadId === item.id}
										d={connectorPath(item.anchorTop, item.top)}
									></path>

									<path
										class:connector-suggestion={item.connectorKind === 'suggestion'}
										class:connector-composer={item.type === 'composer'}
										class:connector-active={activeThreadId === item.id}
										d={connectorPath(item.anchorTop, item.top)}
									></path>

									<circle
										class="connector-source"
										class:connector-suggestion={item.connectorKind === 'suggestion'}
										class:connector-composer={item.type === 'composer'}
										class:connector-active={activeThreadId === item.id}
										cx="0"
										cy={Math.max(12, item.anchorTop)}
										r="3"
									></circle>

								{/each}
							</svg>
						{/if}

						{#each marginItems as item}
					{#if item.type === 'composer'}
						<section
							class="inline-composer"
							class:needs-attention={commentComposerAttention}
							aria-label="New comment"
							style={`top: ${item.top}px;`}
							use:measureHeight={item.id}
						>
							<div class="composer-author">
								<div class="avatar" style={avatarStyle(localAuthor)}>{authorInitials(localAuthor)}</div>
								<strong>{localAuthor}</strong>
							</div>

							<Textarea
								bind:ref={commentTextarea}
								bind:value={commentBody}
								autocapitalize="sentences"
								autocomplete="off"
								autocorrect="off"
								placeholder="Add a comment"
								spellcheck={true}
							/>

							<div class="composer-actions">
								<Button
									variant="outline"
									size="sm"
									class="ghost-button"
									onclick={clearSelection}
								>Cancel</Button>

								<Button
									size="sm"
									class="primary"
									onclick={submitComment}
									disabled={!selectionReady || !commentBody}
								>Comment</Button>
							</div>
						</section>
					{:else}
						<div
							class:thread-card={true}
							class:suggestion={item.thread.kind === 'suggestion'}
							class:pending={item.thread.pending}
							class:rejected={item.thread.status === 'rejected'}
							class:resolved={item.thread.status === 'resolved'}
							class:focused={activeThreadId === item.thread.id}
							class:editing-comment={item.thread.kind === 'comment' && editingCommentId === item.thread.id}
							role="button"
							aria-label={item.thread.kind === 'comment' && editingCommentId === item.thread.id ? 'Edit comment' : `Go to ${item.thread.kind}`}
							tabindex={item.thread.kind === 'comment' && editingCommentId === item.thread.id ? -1 : 0}
							style={`top: ${item.top}px;`}
							on:click={() => {
								if (item.thread.kind === 'comment' && editingCommentId === item.thread.id) return;

								goToThread(item.thread);
							}}
							on:keydown={(event) => {
								if (item.thread.kind === 'comment' && editingCommentId === item.thread.id) return;
								if (event.key === 'Enter') goToThread(item.thread);
							}}
							on:mouseenter={() => activeThreadId = item.thread.id}
							on:mouseleave={() => activeThreadId = ''}
							use:measureHeight={item.id}
						>
							{#if item.thread.kind === 'comment' && editingCommentId === item.thread.id}
								<section
									class="inline-composer comment-edit-form"
									aria-label="Edit comment"
								>
									<div class="composer-author">
										<div class="avatar" style={avatarStyle(item.thread.author)}>{authorInitials(item.thread.author)}</div>
										<strong>{item.thread.author}</strong>
									</div>

										<Textarea
											bind:ref={editingCommentTextarea}
											bind:value={editingCommentBody}
											aria-label="Edit comment"
											autocapitalize="sentences"
											autocomplete="off"
											autocorrect="off"
											placeholder="Edit comment"
											spellcheck={true}
										/>

										<div class="composer-actions">
											<Button
												variant="outline"
												size="sm"
												class="ghost-button"
												onclick={(event) => {
													event.stopPropagation();
													cancelCommentEdit();
												}}
											>Cancel</Button>

											<Button
												size="sm"
												class="primary"
												aria-label="Save comment"
												disabled={!editingCommentBody.trim() || editingCommentBody === item.thread.body}
												onclick={(event) => {
													event.stopPropagation();
													saveEditedComment(item.thread.id);
												}}
											>Save</Button>
										</div>
									</section>
								{:else}
									<div class="thread-header">
										<div class="avatar" style={avatarStyle(item.thread.author)}>{authorInitials(item.thread.author)}</div>

										<div>
											<strong>{item.thread.author}</strong>
										</div>

										{#if item.thread.kind === 'suggestion'}
											<Badge
												variant="outline"
												class="status-pill"
											>{suggestionStatusLabel(item.thread)}</Badge>
										{:else}
											<div class="thread-header-actions">
												<Button
													variant="ghost"
													size="icon-sm"
													class="thread-icon-button thread-edit-button"
													aria-label="Edit comment"
													title="Edit comment"
													onclick={(event) => {
														event.stopPropagation();
														startEditingComment(item.thread);
													}}
												>
													<PencilIcon aria-hidden="true" />
												</Button>

												<Button
													variant="ghost"
													size="icon-sm"
													class="thread-icon-button thread-resolve-button"
													aria-label="Resolve comment"
													title="Resolve comment"
													onclick={(event) => {
														event.stopPropagation();
														resolveComment(item.thread);
													}}
												>
													<CheckIcon aria-hidden="true" />
												</Button>
											</div>
										{/if}
									</div>

									{#if item.thread.kind === 'suggestion'}
										<div
											class="suggestion-diff"
											aria-label="Suggested change"
										>
											{#if diffQuote(item.thread)}
												<div class="diff-group removed">
													<span class="diff-label">Remove</span>

													{#each diffLines(diffQuote(item.thread)) as line}
														<pre><span>-</span><code>{line}</code></pre>
													{/each}
												</div>
											{/if}

											{#if diffBody(item.thread)}
												<div class="diff-group added">
													<span class="diff-label">Add</span>

													{#each diffLines(diffBody(item.thread)) as line}
														<pre><span>+</span><code>{line}</code></pre>
													{/each}
												</div>
											{/if}
										</div>
									{:else}
										<blockquote>{item.thread.quote}</blockquote>
										<p>{item.thread.body}</p>
									{/if}
								{/if}

							{#if item.thread.kind === 'suggestion'}
								<div class="thread-actions">
									<Button
										variant="ghost"
										size="sm"
										onclick={(event) => {
											event.stopPropagation();
											acceptSuggestion(item.thread);
										}}
										disabled={!item.thread.pending && item.thread.status === 'applied'}
									>Accept</Button>

									<Button
										variant="ghost"
										size="sm"
										onclick={(event) => {
											event.stopPropagation();
											rejectSuggestion(item.thread);
										}}
										disabled={item.thread.status === 'rejected'}
									>Reject</Button>

									<Button
										variant="ghost"
										size="sm"
										onclick={(event) => {
											event.stopPropagation();
											resolveSuggestion(item.thread);
										}}
										disabled={item.thread.status === 'resolved'}
									>Resolve</Button>
								</div>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
			</aside>
		</div>

		{#if fileTreePanelOpen}
			<aside
				class="file-tree-panel"
				aria-label="Open folder"
			>
				<button
					class="file-tree-resizer"
					type="button"
					aria-label="Resize file tree"
					on:pointerdown={startFileTreeResize}
					on:keydown={handleFileTreeResizeKeydown}
				></button>

				<div class="file-tree-content">
					<header class="file-tree-header">
						<div class="file-tree-heading">
							<p class="file-tree-eyebrow">Folder</p>
							<h2>{fileTreeRoot?.name || 'Open folder'}</h2>
						</div>

						<Button
							variant="ghost"
							size="icon-sm"
							class="activity-icon-button file-tree-close-button active"
							aria-label="Hide file tree"
							aria-pressed="true"
							title="Hide file tree"
							onclick={toggleFileTreePanel}
						>
							<PanelLeftCloseIcon aria-hidden="true" />
						</Button>
					</header>

					<div class="file-tree-scroll">
						{#if fileTreeRoot}
							<p class="file-tree-root-path" title={fileTreeRoot.path}>{fileTreeRootLabel()}</p>
							<p class="file-tree-count">{fileTreeEntryCount(fileTreeRoot.entries)} items</p>

							{#if fileTreeRoot.entries.length > 0}
								<ul class="file-tree-list root">
									{#each fileTreeRoot.entries as entry (entry.path)}
										<li>
											<FileTreeEntry
												{entry}
												activePath={nativeFilePath}
												onOpen={openFileTreeEntry}
											/>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="file-tree-empty">This folder is empty.</p>
							{/if}
						{:else if fileTreeLoading}
							<p class="file-tree-empty">Opening folder...</p>
						{:else}
							<p class="file-tree-empty">Open a folder to browse Markdown documents.</p>
						{/if}

						{#if fileTreeError}
							<p class="file-tree-error">{fileTreeError}</p>
						{/if}
					</div>
				</div>
			</aside>
		{/if}
	</div>

	<section class="print-document" aria-hidden="true">
		<div class="print-document-body">
			{@html printDocumentHtml}
		</div>

		{#if printableThreads.length > 0}
			<section class="print-annotations">
				<h2>Margin Notes</h2>

				{#each printableThreads as thread}
					<article class="print-annotation" class:print-suggestion={thread.kind === 'suggestion'}>
						<p class="print-annotation-label">
							{thread.kind === 'suggestion' ? 'Suggestion' : 'Comment'} by {thread.author}
							- line {thread.currentLine ?? thread.line}
						</p>

						{#if thread.quote}
							<blockquote>{thread.quote}</blockquote>
						{/if}

						<p>{thread.body}</p>
					</article>
				{/each}
			</section>
		{/if}
	</section>

	{#if saveProgressVisible}
		<div
			class="save-progress-indicator"
			class:fading={saveProgressFading}
			role="status"
			aria-live="polite"
		>
			<span>Saving</span><span class="save-progress-dots" aria-hidden="true"></span>
		</div>
	{/if}

	{#if updateNoticeVisible && availableAppUpdate}
		<div class="app-update-notice" role="status" aria-live="polite">
			<div class="app-update-copy">
				<span class="app-update-title">Update {availableAppUpdate.version}</span>
				<span class="app-update-detail">
					{updateCheckState === 'installing' ? 'Installing' : 'Ready to install'}
				</span>
			</div>

			<Button
				size="sm"
				class="primary app-update-install"
				onclick={installDesktopUpdate}
				disabled={updateCheckState === 'installing'}
			>
				<DownloadIcon aria-hidden="true" />
				<span>{updateCheckState === 'installing' ? 'Installing' : 'Install'}</span>
			</Button>

			<Button
				variant="ghost"
				size="icon-sm"
				class="icon-button app-update-dismiss"
				aria-label="Dismiss update"
				onclick={() => updateNoticeVisible = false}
				disabled={updateCheckState === 'installing'}
			>
				<XIcon aria-hidden="true" />
			</Button>
		</div>
	{/if}

		<Dialog.Root bind:open={printOptionsDialogOpen}>
			<Dialog.Content
				class="settings-dialog print-options-dialog"
				aria-labelledby="print-options-title"
				showCloseButton={false}
			>
				<form on:submit|preventDefault={confirmPrintDocument}>
					<Dialog.Header class="settings-dialog-header">
						<div>
							<p class="eyebrow">Margin</p>
							<Dialog.Title id="print-options-title">Print</Dialog.Title>
						</div>

						<Button
							variant="ghost"
							size="icon-sm"
							class="icon-button"
							aria-label="Close print options"
							onclick={() => printOptionsDialogOpen = false}
						>
							<XIcon aria-hidden="true" />
						</Button>
					</Dialog.Header>

					<fieldset class="settings-fieldset print-options-fieldset">
						<label class="print-option-checkbox" for="print-include-margin-notes">
							<input
								id="print-include-margin-notes"
								type="checkbox"
								bind:checked={includeMarginNotesAppendix}
								disabled={printAppendixCandidateThreads.length === 0}
							/>
							<span>Include margin notes appendix</span>
						</label>
					</fieldset>

					<Dialog.Footer class="settings-actions">
						<Button
							variant="outline"
							size="sm"
							class="ghost-button"
							onclick={() => printOptionsDialogOpen = false}
						>Cancel</Button>

						<Button
							size="sm"
							class="primary"
							type="submit"
						>Print</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>

		<Dialog.Root bind:open={settingsDialogOpen}>
			<Dialog.Content
				class="settings-dialog"
				aria-labelledby="settings-title"
				showCloseButton={false}
			>
				<form on:submit|preventDefault={saveSettings}>
					<Dialog.Header class="settings-dialog-header">
						<div>
							<p class="eyebrow">Margin</p>
							<Dialog.Title id="settings-title">Settings</Dialog.Title>
						</div>

						<Button
							variant="ghost"
							size="icon-sm"
							class="icon-button"
							aria-label="Close settings"
							onclick={closeSettingsDialog}
						>
							<XIcon aria-hidden="true" />
						</Button>
					</Dialog.Header>

					<fieldset class="settings-fieldset">
						<Label>Theme</Label>

						<ToggleGroup.Root
							class="theme-segmented-control"
							type="single"
							bind:value={settingsDraftTheme}
						>
							{#each themeOptions as theme}
								<ToggleGroup.Item
									class={`theme-option${settingsDraftTheme === theme ? ' active' : ''}`}
									value={theme}
								>
									<span>{theme === 'auto' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'}</span>
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
					</fieldset>

					<fieldset class="settings-fieldset">
						<Label for="settings-local-user-name">Local name</Label>

						<div class="settings-user-control">
							<div class="avatar" style={avatarStyle(settingsDraftLocalUserName)}>{authorInitials(settingsDraftLocalUserName)}</div>
							<input
								id="settings-local-user-name"
								class="settings-text-input"
								bind:value={settingsDraftLocalUserName}
								autocomplete="name"
								maxlength="80"
							/>
						</div>
					</fieldset>

					{#if desktopShell}
						<section class="settings-fieldset settings-update-fieldset" aria-labelledby="settings-updates-title">
							<div class="settings-update-header">
								<div>
									<Label id="settings-updates-title">Updates</Label>
									{#if updateStatusMessage}
										<p class={`settings-update-status${updateCheckState === 'error' ? ' error' : ''}`}>
											{updateStatusMessage}
										</p>
									{/if}
								</div>

								<Button
									variant="outline"
									size="sm"
									class="ghost-button settings-update-check"
									onclick={() => checkForDesktopUpdate(true)}
									disabled={updateCheckState === 'checking' || updateCheckState === 'installing'}
								>
									<RefreshCwIcon aria-hidden="true" />
									<span>{updateCheckState === 'checking' ? 'Checking' : 'Check'}</span>
								</Button>
							</div>

							{#if availableAppUpdate}
								<div class="settings-update-available">
									<p>Version {availableAppUpdate.version} is available</p>
									{#if availableAppUpdate.notes}
										<p>{availableAppUpdate.notes}</p>
									{/if}
									<Button
										size="sm"
										class="primary settings-update-install"
										onclick={installDesktopUpdate}
										disabled={updateCheckState === 'installing'}
									>
										<DownloadIcon aria-hidden="true" />
										<span>{updateCheckState === 'installing' ? 'Installing' : 'Install and Relaunch'}</span>
									</Button>
								</div>
							{/if}
						</section>
					{/if}

					{#if settingsError}
						<p class="settings-error">{settingsError}</p>
					{/if}

					<Dialog.Footer class="settings-actions">
						<Button
							variant="outline"
							size="sm"
							class="ghost-button"
							onclick={closeSettingsDialog}
							disabled={settingsSaving}
						>Cancel</Button>

						<Button
							size="sm"
							class="primary"
							type="submit"
							disabled={settingsSaving}
						>{settingsSaving ? 'Saving' : 'Save'}</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	</main>
