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
	import { HighlightStyle, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';

	import {
		ChangeSet,
		EditorState,
		StateEffect,
		StateField,
		type Extension,
		type Line,
		type Range
	} from '@codemirror/state';

	import {
		Decoration,
		EditorView,
		WidgetType,
		keymap,
		type DecorationSet,
		type ViewUpdate
	} from '@codemirror/view';
	import { tags } from '@lezer/highlight';

	import FilePlusIcon from '@lucide/svelte/icons/file-plus';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
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

	import {
		appendMarginCommentBlock,
		splitMarginCommentBlock,
		type MarginCommentBlock
	} from './lib/embedded-margin';

	import type { DocumentResponse, MarginAnchor, MarginSuggestion, Review } from './lib/types';

	let documentData: DocumentResponse | null = null;
	let review: Review | null = null;
	let editorMarkdown = '';
	let baseMarkdown = '';
	let pendingEditThreads: ThreadView[] = [];
	let selectedQuote = '';
	let commentBody = '';
	let replacementBody = '';
	let mode: 'comment' | 'suggest' = 'comment';
	let editMode: EditingMode = 'edit';
	let appSettings: AppSettings = { theme: 'auto' };
	let settingsDraftTheme: ThemeSetting = 'auto';
	let settingsDialogOpen = false;
	let settingsSaving = false;
	let settingsError = '';
	let error = '';
	let documentSurface: HTMLElement;
	let fileInput: HTMLInputElement;
	let mainEditor: EditorView | null = null;
	let selectionToolbar = { visible: false, top: 0, left: 0 };
	let selectedLineTop = 0;
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
	let fileChangeCheckInFlight = false;
	let unlistenNativeInsertMenu: (() => void) | null = null;
	let unlistenNativeNewMenu: (() => void) | null = null;
	let unlistenNativeOpenUrls: (() => void) | null = null;
	let unlistenNativeOpenMenu: (() => void) | null = null;
	let unlistenNativeOpenRecentMenu: (() => void) | null = null;
	let unlistenNativeClearRecentMenu: (() => void) | null = null;
	let unlistenNativeSaveMenu: (() => void) | null = null;
	let unlistenNativeSaveAsMenu: (() => void) | null = null;
	let unlistenNativeCloseTabMenu: (() => void) | null = null;
	let unlistenNativePreviousTabMenu: (() => void) | null = null;
	let unlistenNativeNextTabMenu: (() => void) | null = null;
	let unlistenNativeSettingsMenu: (() => void) | null = null;
	let unlistenNativeDocumentChanged: (() => void) | null = null;
	let unlistenNativeDragDrop: (() => void) | null = null;
	let tauriShell = false;
	let desktopShell = false;
	let mobileShell = false;
	let nativeMenuBridgeReady = false;
	let saveDialogOpen = false;
	let documentTabs: DocumentTab[] = [];
	let visibleDocumentTabs: DocumentTab[] = [];
	let activeDocumentTabId = '';
	let recentDocuments: RecentDocument[] = [];
	let dragActive = false;
	const syncedEditKeys = new Set<string>();
	const reviewer = 'Aisha Fenton';
	const anchorContextCharacters = 96;
	const gutterCardGap = 14;
	const gutterReservedTop = 86;
	const recentDocumentsStorageKey = 'margin:recent-documents:v1';
	const settingsStorageKey = 'margin:settings:v1';
	const maxRecentDocuments = 10;
	const themeOptions: ThemeSetting[] = ['auto', 'light', 'dark'];
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
	type AppSettings = { theme: ThemeSetting };
	type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict';
	type InsertBlockKind = 'table' | 'tasks' | 'bullets' | 'numbers';
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
	type RecentDocument = { path: string; title: string; openedAt: number };
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
		documentData: DocumentResponse;
		review: Review | null;
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
			connectorKind: 'comment' | 'suggestion'
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

	type LivePreviewState = {
		threads: ThreadView[];
		activeThreadId: string;
		decorations: DecorationSet
	 };

	type SourceBlock = {
		start: number;
		end: number;
		kind: 'line' | 'frontmatter' | 'fenced-code' | 'list' | 'indented' | 'table';
		language?: string;
		frontmatter?: MarkdownFrontmatter;
		table?: MarkdownTable
	 };

	type FenceInfo = { marker: '`' | '~'; length: number; language: string };
	type ListInfo = { indent: number; contentIndent: number };
	type MarkdownFrontmatterEntry = { key: string; value: string };
	type MarkdownFrontmatter = {
		entries: MarkdownFrontmatterEntry[];
		rawLines: string[]
	};
	type MarkdownImage = {
		alt: string;
		src: string;
		title: string;
		raw: string;
		attrs: MarkdownImageAttributes
	};
	type MarkdownImageAttributes = {
		width: MarkdownImageSize | null;
		height: MarkdownImageSize | null;
		other: string[]
	};
	type MarkdownImageSize = {
		value: number;
		unit: string;
		raw: string
	};

	type MarkdownTable = {
		headers: string[];
		alignments: Array<'left' | 'center' | 'right' | null>;
		rows: string[][]
	 };

	const markdownImageBounds = new Map<string, { width: number; height: number }>();

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
			resizeHandle.addEventListener('mousedown', (event) => {
				this.startResize(event, view, image, wrapper);
			});

			image.addEventListener('error', () => {
				wrapper.classList.add('is-missing');
			});

			const rememberBounds = () => {
				window.requestAnimationFrame(() => {
					const rect = image.getBoundingClientRect();

					if (rect.width <= 0 || rect.height <= 0) return;

					markdownImageBounds.set(markdownImageBoundsKey(this.image), {
						width: Math.round(rect.width),
						height: Math.round(rect.height)
					});
				});
			};

			image.addEventListener('load', rememberBounds);
			if (image.complete) rememberBounds();

			wrapper.append(image, fallback, resizeHandle);

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

	const livePreviewField = StateField.define<LivePreviewState>({
		create(state) {
			return {
				threads: [],
				activeThreadId: '',
				decorations: buildLivePreviewDecorations(state, [], '')
			};
		},

		update(value, transaction) {
			let threadsForState = value.threads;
			let activeThreadForState = value.activeThreadId;
			let threadChange = false;
			let activeThreadChange = false;

			for (const effect of transaction.effects) {
				if (effect.is(setThreadsEffect)) {
					threadsForState = effect.value;
					threadChange = true;
				}

				if (effect.is(setActiveThreadEffect)) {
					activeThreadForState = effect.value;
					activeThreadChange = true;
				}
			}

			if (transaction.docChanged || transaction.selection || threadChange || activeThreadChange) {
				return {
					threads: threadsForState,
					activeThreadId: activeThreadForState,
					decorations: buildLivePreviewDecorations(transaction.state, threadsForState, activeThreadForState)
				};
			}

			return value;
		},
		provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
	});

	$: persistedThreads = review
		? [
			...review.comments.filter((comment) => !comment.resolved).map((comment) => ({
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

			...review.suggestions.map((suggestion) => ({
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
	$: visibleDocumentTabs = documentTabs.map((tab) => tab.id === activeDocumentTabId ? tabFromCurrentState(tab) : tab);
	$: selectionReady = selectedQuote.trim().length > 0 && review;
	$: marginItems = layoutMarginItems(threads, selectedQuote, selectedLineTop, mode, lineTops, annotationTops, cardHeights);
	$: stageHeight = Math.max(documentHeight, ...marginItems.map((item) => item.top + item.height + 24), 240);

	$: if (mainEditor) {
		mainEditor.dispatch({
			effects: [
				setThreadsEffect.of(threads),
				setActiveThreadEffect.of(activeThreadId)
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
		loadAppSettings();
		recentDocuments = readRecentDocuments();
		syncRecentDocumentsMenu();

		const nativeListenersReady = setupNativeDesktopListeners();

		bootstrapStandaloneDocument(nativeListenersReady);
		window.addEventListener('resize', updateAnchorPositions);
		window.addEventListener('keydown', handleGlobalShortcut);
		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('resize', updateAnchorPositions);
			window.removeEventListener('keydown', handleGlobalShortcut);
			window.removeEventListener('beforeunload', handleBeforeUnload);
			unlistenNativeInsertMenu?.();
			unlistenNativeNewMenu?.();
			unlistenNativeOpenUrls?.();
			unlistenNativeOpenMenu?.();
			unlistenNativeOpenRecentMenu?.();
			unlistenNativeClearRecentMenu?.();
			unlistenNativeSaveMenu?.();
			unlistenNativeSaveAsMenu?.();
			unlistenNativeCloseTabMenu?.();
			unlistenNativePreviousTabMenu?.();
			unlistenNativeNextTabMenu?.();
			unlistenNativeSettingsMenu?.();
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

	async function bootstrapStandaloneDocument(nativeListenersReady: Promise<void>) {
		await nativeListenersReady;
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
				repo: 'Loading repo',
				file_path: 'Opening document',
				source_commit: 'pending',
				markdown
			};

		return {
			id: previous?.id ?? (activeDocumentTabId || documentSessionKey),
			title: nextDocumentData.file_path,
			documentData: nextDocumentData,
			review,
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

		syncActiveDocumentTab();

		const nextTab = documentTabs.find((tab) => tab.id === tabId);

		if (!nextTab) return;

		await applyDocumentTab(nextTab);
	}

	async function closeDocumentTab(tabId: string) {
		syncActiveDocumentTab();

		const tabIndex = documentTabs.findIndex((tab) => tab.id === tabId);

		if (tabIndex < 0) return;

		const tab = documentTabs[tabIndex];

		if (tabHasDiscardableWork(tab) && !window.confirm(`Close ${tab.title}? Unsaved work in this tab will be discarded.`)) {
			return;
		}

		if (documentTabs.length <= 1) {
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
		return tab.saveState === 'dirty' || tab.saveState === 'conflict' || tab.pendingEditThreads.length > 0 || tab.editorMarkdown !== tab.baseMarkdown || tab.localMetadataDirty && Boolean((tab.review?.comments.length ?? 0) + (tab.review?.suggestions.length ?? 0));
	}

	async function applyDocumentTab(nextTab: DocumentTab) {
		activeDocumentTabId = nextTab.id;
		documentData = { ...nextTab.documentData, markdown: nextTab.editorMarkdown };
		review = nextTab.review;
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
		commentBody = '';
		replacementBody = '';
		selectionToolbar.visible = false;
		syncedEditKeys.clear();

		for (const key of nextTab.syncedEditKeys) syncedEditKeys.add(key);

		await tick();
		updateAnchorPositions();
	}

	function buildLivePreviewDecorations(
		state: EditorState,
		activeThreads: ThreadView[],
		focusedThreadId: string
	) {
		const ranges: Range<Decoration>[] = [];
		const frontmatterBlocks = markdownFrontmatterBlocks(state);
		const fencedBlocks = fencedCodeBlocks(state);
		const tableBlocks = markdownTableBlocks(state);
		const activeBlocks = activeSourceBlocksForSelection(state, frontmatterBlocks, fencedBlocks, tableBlocks);

		for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
			const line = state.doc.line(lineNumber);
			const text = line.text;
			const activeBlock = blockForLine(activeBlocks, line.number);
			const active = Boolean(activeBlock);
			const activeClass = activeBlock ? activeSourceClass(activeBlock, line.number) : '';
			const frontmatterBlock = blockForLine(frontmatterBlocks, line.number);
			const fencedBlock = blockForLine(fencedBlocks, line.number);
			const tableBlock = blockForLine(tableBlocks, line.number);

			if (frontmatterBlock?.frontmatter) {
				if (active) {
					ranges.push(Decoration.line({
						class: `cm-live-frontmatter-source-line ${activeClass}`
					}).range(line.from));

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

				const classes = active
					? `cm-live-codeblock-line ${activeClass}`
					: boundary
						? `cm-live-code-fence-hidden-line${emptyCodeBlock && line.number === fencedBlock.start
							? ' cm-live-code-fence-empty-start'
							: ''}`
						: 'cm-live-codeblock-line';

				ranges.push(Decoration.line({ class: classes }).range(line.from));

				if (!active && boundary && line.from < line.to) {
					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(line.from, line.to));
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
						class: `cm-live-table-source-line ${activeClass}`
					}).range(line.from));

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

			const heading = (/^(#{1,6})(\s+)(.*)/).exec(text);
			const blockquote = (/^([ \t]{0,3}>[ \t]?)(.*)/).exec(text);
			const footnoteDefinition = footnoteDefinitionMatch(text);
			const imageLine = markdownImageOnly(text);

			if (blockquote) {
				const markerEnd = blockquote[1].length;

				ranges.push(Decoration.line({
					class: `cm-live-blockquote-line${active ? ` ${activeClass}` : ''}`
				}).range(line.from));

				if (active) {
					ranges.push(Decoration.mark({
						class: 'cm-markdown-source-syntax cm-markdown-blockquote-syntax'
					}).range(line.from, line.from + markerEnd));
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
					class: `cm-live-footnote-definition${active ? ` ${activeClass}` : ''}`
				}).range(line.from));

				if (active) {
					ranges.push(Decoration.mark({
						class: 'cm-markdown-source-syntax cm-markdown-footnote-syntax'
					}).range(line.from + footnoteDefinition[1].length, line.from + contentOffset));
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
						attributes: markdownImagePlaceholderAttributes(imageLine)
					}).range(line.from));
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
					ranges.push(Decoration.line({ class: activeClass }).range(line.from));
				} else {
					ranges.push(Decoration.replace({
						widget: new HorizontalRuleWidget(line.number),
						block: true
					}).range(line.from, line.to));
				}

				continue;
			}

			if (heading) {
				ranges.push(Decoration.line({
					class: `cm-live-heading cm-live-heading-${heading[1].length}${active
						? ` ${activeClass}`
						: ''}`
				}).range(line.from));

				if (active) {
					ranges.push(Decoration.mark({
						class: 'cm-markdown-source-syntax cm-markdown-heading-syntax'
					}).range(line.from, line.from + heading[1].length + heading[2].length));
				}

				if (!active) {
					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(line.from, line.from + heading[1].length + heading[2].length));
					addInlineMarkdownPreview(ranges, line, heading[0].length - heading[3].length);
				}

				continue;
			}

			const task = (/^(\s*)([-*+])(\s+)\[([ xX])\](\s+)(.*)/).exec(text);

			if (task) {
				const markerStart = line.from + task[1].length;
				const checkPosition = markerStart + task[2].length + task[3].length + 1;
				const syntaxEnd = checkPosition + 2 + task[5].length;
				const contentOffset = syntaxEnd - line.from;
				const checked = task[4].toLowerCase() === 'x';

				ranges.push(Decoration.line({
					class: `cm-live-list-line cm-live-task-line ${checked ? 'cm-task-checked' : 'cm-task-open'}${active
						? ` ${activeClass}`
						: ''}`
				}).range(line.from));

				if (active) {
					ranges.push(Decoration.mark({ class: 'cm-markdown-source-syntax cm-markdown-list-syntax' }).range(markerStart, syntaxEnd));
				}

				if (!active) {
					ranges.push(Decoration.widget({
						widget: new TaskCheckboxWidget(checked, checkPosition),
						side: -1
					}).range(markerStart));

					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(markerStart, syntaxEnd));
					addInlineMarkdownPreview(ranges, line, contentOffset);
				}

				continue;
			}

			const list = (/^(\s*)([-*+])(\s+)(.*)/).exec(text);

			if (list) {
				const markerStart = line.from + list[1].length;

				ranges.push(Decoration.line({
					class: `cm-live-list-line${active
						? ` ${activeClass}`
						: ''}`
				}).range(line.from));

				if (active) {
					ranges.push(Decoration.mark({ class: 'cm-markdown-source-syntax cm-markdown-list-syntax' }).range(markerStart, markerStart + list[2].length + list[3].length));
				}

				if (!active) {
					ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(markerStart, markerStart + list[2].length + list[3].length));
					addInlineMarkdownPreview(ranges, line, list[1].length + list[2].length + list[3].length);
				}

				continue;
			}

			if (active) {
				ranges.push(Decoration.line({ class: activeClass }).range(line.from));
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

		return Decoration.set(ranges, true);
	}

	function activeSourceBlocksForSelection(
		state: EditorState,
		frontmatterBlocks: SourceBlock[],
		fencedBlocks: SourceBlock[],
		tableBlocks: SourceBlock[]
	) {
		const blocks: SourceBlock[] = [];

		for (const range of state.selection.ranges) {
			const from = range.from;
			const endPosition = range.empty ? range.head : Math.max(range.from, range.to - 1);
			const startLine = state.doc.lineAt(from).number;
			const endLine = state.doc.lineAt(endPosition).number;

			for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
				const block = sourceBlockForLine(state, lineNumber, frontmatterBlocks, fencedBlocks, tableBlocks);

				if (!blocks.some((existing) => sameSourceBlock(existing, block))) {
					blocks.push(block);
				}

				lineNumber = Math.max(lineNumber, block.end);
			}
		}

		return blocks;
	}

	function sameSourceBlock(left: SourceBlock, right: SourceBlock) {
		return left.kind === right.kind && left.start === right.start && left.end === right.end;
	}

	function sourceBlockForLine(
		state: EditorState,
		lineNumber: number,
		frontmatterBlocks: SourceBlock[],
		fencedBlocks: SourceBlock[],
		tableBlocks: SourceBlock[]
	): SourceBlock {
		const frontmatterBlock = blockForLine(frontmatterBlocks, lineNumber);

		if (frontmatterBlock) return frontmatterBlock;

		const fencedBlock = blockForLine(fencedBlocks, lineNumber);

		if (fencedBlock) return fencedBlock;

		const tableBlock = blockForLine(tableBlocks, lineNumber);

		if (tableBlock) return tableBlock;

		const listBlock = listBlockForLine(state, lineNumber);

		if (listBlock) return listBlock;

		const indentedBlock = indentedBlockForLine(state, lineNumber);

		if (indentedBlock) return indentedBlock;

		return { start: lineNumber, end: lineNumber, kind: 'line' };
	}

	function activeSourceClass(block: SourceBlock, lineNumber: number) {
		if (block.start === block.end) return 'cm-active-source-line';

		const edge = lineNumber === block.start
			? 'cm-active-block-start'
			: lineNumber === block.end ? 'cm-active-block-end' : 'cm-active-block-middle';

		return `cm-active-source-line cm-active-block-line ${edge}`;
	}

	function lineInBlock(lineNumber: number, block: SourceBlock) {
		return lineNumber >= block.start && lineNumber <= block.end;
	}

	function blockForLine(blocks: SourceBlock[], lineNumber: number) {
		return blocks.find((block) => lineInBlock(lineNumber, block)) ?? null;
	}

	function fencedCodeBlocks(state: EditorState): SourceBlock[] {
		const blocks: SourceBlock[] = [];
		let openFence: { line: number; fence: FenceInfo } | null = null;

		for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
			const text = state.doc.line(lineNumber).text;

			if (openFence) {
				if (isClosingFence(text, openFence.fence)) {
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

			const fence = openingFence(text);

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

	function isFrontmatterBoundaryLine(text: string) {
		return (/^[ \t]*---[ \t]*$/).test(text);
	}

	function isFrontmatterClosingLine(text: string) {
		return (/^[ \t]*\.\.\.[ \t]*$/).test(text);
	}

	function parseFrontmatter(rawLines: string[]): MarkdownFrontmatter {
		const entries: MarkdownFrontmatterEntry[] = [];
		let currentEntry: MarkdownFrontmatterEntry | null = null;

		for (const line of rawLines) {
			const match = (/^[ \t]*([A-Za-z0-9_.-]+):[ \t]*(.*)$/).exec(line);

			if (match) {
				currentEntry = {
					key: match[1],
					value: frontmatterValueLabel(match[2])
				};

				entries.push(currentEntry);
				continue;
			}

			if (!currentEntry) continue;

			const listItem = (/^[ \t]+-[ \t]+(.+)$/).exec(line);
			const continuation = (/^[ \t]+(.+)$/).exec(line);

			if (listItem) {
				currentEntry.value = joinFrontmatterValue(currentEntry.value, frontmatterValueLabel(listItem[1]), ', ');
				continue;
			}

			if (continuation) {
				currentEntry.value = joinFrontmatterValue(currentEntry.value, frontmatterValueLabel(continuation[1]), ' ');
			}
		}

		return { entries, rawLines };
	}

	function joinFrontmatterValue(current: string, next: string, separator: string) {
		if (!current) return next;
		if (!next) return current;

		return `${current}${separator}${next}`;
	}

	function frontmatterValueLabel(value: string) {
		const trimmed = value.trim();

		if (
			(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
			(trimmed.startsWith("'") && trimmed.endsWith("'"))
		) {
			return trimmed.slice(1, -1);
		}

		return trimmed;
	}

	function markdownImageOnly(text: string): MarkdownImage | null {
		const trimmed = text.trim();
		const match = markdownImagePattern().exec(trimmed);

		if (!match || match[0] !== trimmed) return null;

		return markdownImageFromMatch(match);
	}

	function markdownImagePattern() {
		return /!\[([^\]\n]*)\]\(((?:<[^>\n]+>(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?)|(?:[^)\n]+))\)(?:\{([^\n}]*)\})?/g;
	}

	function markdownImageFromMatch(match: RegExpMatchArray): MarkdownImage | null {
		const rawDestination = match[2]?.trim() ?? '';
		const { src, title } = splitMarkdownImageDestination(rawDestination);

		if (!src) return null;

		return {
			alt: match[1] ?? '',
			src,
			title,
			raw: match[0],
			attrs: parseMarkdownImageAttributes(match[3] ?? '')
		};
	}

	function parseMarkdownImageAttributes(value: string): MarkdownImageAttributes {
		const attrs: MarkdownImageAttributes = { width: null, height: null, other: [] };
		const source = value.trim().replace(/^:/, '').trim();

		for (const token of markdownAttributeTokens(source)) {
			const match = (/^([A-Za-z][A-Za-z0-9_-]*)=(.+)$/).exec(token);

			if (!match) {
				attrs.other.push(token);
				continue;
			}

			const key = match[1].toLowerCase();
			const size = parseMarkdownImageSize(match[2]);

			if (key === 'width' && size) {
				attrs.width = size;
			} else if (key === 'height' && size) {
				attrs.height = size;
			} else {
				attrs.other.push(token);
			}
		}

		return attrs;
	}

	function markdownAttributeTokens(value: string) {
		const tokens: string[] = [];
		let token = '';
		let quote = '';

		for (const character of value) {
			if (quote) {
				token += character;
				if (character === quote) quote = '';
				continue;
			}

			if (character === '"' || character === "'") {
				quote = character;
				token += character;
				continue;
			}

			if (/\s/.test(character)) {
				if (token) {
					tokens.push(token);
					token = '';
				}

				continue;
			}

			token += character;
		}

		if (token) tokens.push(token);

		return tokens;
	}

	function parseMarkdownImageSize(value: string): MarkdownImageSize | null {
		const raw = unquoteMarkdownTitle(value);
		const match = (/^(\d+(?:\.\d+)?)([A-Za-z%]*)$/).exec(raw);

		if (!match) return null;

		return {
			value: Number(match[1]),
			unit: match[2],
			raw
		};
	}

	function splitMarkdownImageDestination(destination: string) {
		if (destination.startsWith('<')) {
			const closeIndex = destination.indexOf('>');

			if (closeIndex > 0) {
				return {
					src: destination.slice(1, closeIndex).trim(),
					title: unquoteMarkdownTitle(destination.slice(closeIndex + 1).trim())
				};
			}
		}

		const title = (/\s+(["'])(.*?)\1\s*$/).exec(destination);

		if (title) {
			return {
				src: destination.slice(0, title.index).trim(),
				title: title[2]
			};
		}

		return { src: destination.trim(), title: '' };
	}

	function unquoteMarkdownTitle(value: string) {
		const trimmed = value.trim();

		if (
			(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
			(trimmed.startsWith("'") && trimmed.endsWith("'"))
		) {
			return trimmed.slice(1, -1);
		}

		return trimmed;
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

	function markdownImageSizeCss(size: MarkdownImageSize | null) {
		if (!size) return '';

		return `${size.value}${size.unit || 'px'}`;
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

	function clampImageResize(value: number) {
		return Math.max(48, Math.min(2400, Math.round(value)));
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

	function markdownImageWithSize(image: MarkdownImage, width: number, height: number) {
		const attrs = [
			...image.attrs.other,
			`width=${clampImageResize(width)}`,
			`height=${clampImageResize(height)}`
		];

		return `![${escapeMarkdownImageAlt(image.alt)}](${markdownImageDestinationWithTitle(image)}){${attrs.join(' ')}}`;
	}

	function markdownImageDestinationWithTitle(image: MarkdownImage) {
		const destination = markdownImageDestination(image.src);

		if (!image.title) return destination;

		return `${destination} "${escapeMarkdownTitle(image.title)}"`;
	}

	function escapeMarkdownTitle(value: string) {
		return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	}

	function isHorizontalRuleLine(text: string) {
		return (/^[ \t]{0,3}(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})$/).test(text);
	}

	function openingFence(text: string): FenceInfo | null {
		const match = (/^\s*(`{3,}|~{3,})(.*)$/).exec(text);

		if (!match) return null;

		const marker = match[1][0] as '`' | '~';

		return { marker, length: match[1].length, language: codeFenceLanguage(match[2] ?? '') };
	}

	function codeFenceLanguage(info: string) {
		const token = info.trim().split(/\s+/)[0] ?? '';

		return token
			.replace(/^\{\.?/, '')
			.replace(/^\./, '')
			.replace(/^language-/, '')
			.replace(/\}$/, '');
	}

	function isClosingFence(text: string, fence: FenceInfo) {
		const trimmed = text.trim();

		if (!trimmed || trimmed[0] !== fence.marker || trimmed.length < fence.length) return false;

		return [...trimmed].every((character) => character === fence.marker);
	}

	function markdownTableBlocks(state: EditorState): SourceBlock[] {
		const blocks: SourceBlock[] = [];

		for (let lineNumber = 1; lineNumber < state.doc.lines; lineNumber += 1) {
			if (blockForLine(blocks, lineNumber)) continue;

			const header = tableCells(state.doc.line(lineNumber).text);
			const delimiter = tableCells(state.doc.line(lineNumber + 1).text);

			if (!header || !delimiter || !tableDelimiterCells(delimiter)) continue;

			const columnCount = Math.max(header.length, delimiter.length);
			const rows: string[][] = [];
			let end = lineNumber + 1;

			for (let rowLine = lineNumber + 2; rowLine <= state.doc.lines; rowLine += 1) {
				const cells = tableCells(state.doc.line(rowLine).text);

				if (!cells || tableDelimiterCells(cells)) break;

				rows.push(padTableCells(cells, columnCount));
				end = rowLine;
			}

			blocks.push({
				start: lineNumber,
				end,
				kind: 'table',
				table: {
					headers: padTableCells(header, columnCount),
					alignments: padTableAlignments(delimiter.map(tableAlignment), columnCount),
					rows
				}
			});

			lineNumber = end;
		}

		return blocks;
	}

	function tableCells(text: string) {
		const trimmed = text.trim();

		if (!trimmed.includes('|')) return null;

		let row = trimmed;

		if (row.startsWith('|')) row = row.slice(1);
		if (row.endsWith('|')) row = row.slice(0, -1);

		const cells: string[] = [];
		let current = '';
		let escaped = false;

		for (const character of row) {
			if (escaped) {
				current += character === '|' ? '|' : `\\${character}`;
				escaped = false;

				continue;
			}

			if (character === '\\') {
				escaped = true;

				continue;
			}

			if (character === '|') {
				cells.push(current.trim());
				current = '';

				continue;
			}

			current += character;
		}

		cells.push(current.trim());

		return cells.length > 1 ? cells : null;
	}

	function tableDelimiterCells(cells: string[]) {
		return cells.length > 0 && cells.every((cell) => (/^:?-{3,}:?$/).test(cell.replace(/\s+/g, '')));
	}

	function tableAlignment(cell: string): 'left' | 'center' | 'right' | null {
		const normalized = cell.replace(/\s+/g, '');
		const left = normalized.startsWith(':');
		const right = normalized.endsWith(':');

		if (left && right) return 'center';
		if (right) return 'right';
		if (left) return 'left';

		return null;
	}

	function padTableCells(cells: string[], length: number) {
		return Array.from({ length }, (_, index) => cells[index] ?? '');
	}

	function padTableAlignments(
		alignments: Array<'left' | 'center' | 'right' | null>,
		length: number
	) {
		return Array.from({ length }, (_, index) => alignments[index] ?? null);
	}

	function listBlockForLine(state: EditorState, lineNumber: number): SourceBlock | null {
		for (let candidateLine = lineNumber; candidateLine >= 1; candidateLine -= 1) {
			const candidate = state.doc.line(candidateLine);
			const info = listInfo(candidate.text);

			if (!info) {
				if (candidateLine !== lineNumber && candidate.text.trim() && leadingIndent(candidate.text) === 0) {
					break;
				}

				continue;
			}

			if (candidateLine === lineNumber || belongsToListContinuation(state, candidateLine + 1, lineNumber, info)) {
				let end = candidateLine;

				for (let nextLine = candidateLine + 1; nextLine <= state.doc.lines; nextLine += 1) {
					const text = state.doc.line(nextLine).text;

					if (!text.trim() || leadingIndent(text) >= info.contentIndent) {
						end = nextLine;

						continue;
					}

					break;
				}

				return { start: candidateLine, end, kind: 'list' };
			}
		}

		return null;
	}

	function belongsToListContinuation(
		state: EditorState,
		startLine: number,
		endLine: number,
		info: ListInfo
	) {
		for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
			const text = state.doc.line(lineNumber).text;

			if (text.trim() && leadingIndent(text) < info.contentIndent) return false;
		}

		return true;
	}

	function listInfo(text: string): ListInfo | null {
		const match = (/^(\s*)((?:[-*+])|(?:\d+[.)]))(\s+)/).exec(text);

		if (!match) return null;

		const indent = indentWidth(match[1]);

		return {
			indent,
			contentIndent: indent + indentWidth(match[2] + match[3])
		};
	}

	function indentedBlockForLine(state: EditorState, lineNumber: number): SourceBlock | null {
		const line = state.doc.line(lineNumber);

		if (!line.text.trim() || leadingIndent(line.text) < 4) return null;

		let start = lineNumber;
		let end = lineNumber;

		for (let previous = lineNumber - 1; previous >= 1; previous -= 1) {
			const text = state.doc.line(previous).text;

			if (text.trim() && leadingIndent(text) < 4) break;

			start = previous;
		}

		for (let next = lineNumber + 1; next <= state.doc.lines; next += 1) {
			const text = state.doc.line(next).text;

			if (text.trim() && leadingIndent(text) < 4) break;

			end = next;
		}

		return { start, end, kind: 'indented' };
	}

	function leadingIndent(text: string) {
		const match = (/^\s*/).exec(text);

		return indentWidth(match?.[0] ?? '');
	}

	function indentWidth(value: string) {
		let width = 0;

		for (const character of value) {
			width += character === '\t' ? 4 : 1;
		}

		return width;
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
				markdown({ codeLanguages: languages }),
				syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
				syntaxHighlighting(marginHighlightStyle),
				livePreviewField,
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
						key: 'Mod-,',
						run() {
							if (!shouldHandleWebNativeShortcut()) return false;

							openSettingsDialog();

							return true;
						}
					},
					{ key: 'Enter', run: smartMarkdownEnter },
					{ key: 'Backspace', run: smartMarkdownBackspace },
					{ key: 'Tab', run: indentMore },
					{ key: 'Shift-Tab', run: indentLess },
					...defaultKeymap,
					...historyKeymap
				]),
				EditorView.lineWrapping,
				EditorView.updateListener.of((update: ViewUpdate) => {
					if (update.selectionSet || update.focusChanged) updateSelectionFromEditor(update.view);

					if (update.docChanged) {
						editorMarkdown = update.state.doc.toString();

						if (localFileMode) {
							refreshLocalSaveState(editorMarkdown);
						}

						if (applyingExternalValue) {
							resetSuggestionDraftState(editorMarkdown);
						} else if (editMode === 'suggest') {
							draftChanges = composeDraftChanges(draftChanges, update);
							pendingEditThreads = draftMarkdownSuggestions(draftChanges, draftBaseMarkdown, editorMarkdown, persistedThreads, { author: reviewer, syncedKeys: syncedEditKeys });
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

					blur(event, view) {
						updateFootnoteJumpArmed(view, false);
						selectionToolbar.visible = false;
					},

					focus() {
						updateSelectionFromEditor(view);
					}
				})
			];
		}
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
		const selection = view.state.selection.main;

		if (selection.empty) {
			selectedQuote = '';
			selectionToolbar.visible = false;

			return;
		}

		const quote = view.state.sliceDoc(selection.from, selection.to).trim();
		const fromRect = view.coordsAtPos(selection.from);
		const toRect = view.coordsAtPos(selection.to);

		if (!quote || !fromRect || !toRect || !documentSurface) return;

		const documentRect = documentSurface.getBoundingClientRect();

		selectedQuote = displayTextForMarkdownLine(quote);
		replacementBody = selectedQuote;
		selectedLineTop = Math.max(0, fromRect.top - documentRect.top + (fromRect.bottom - fromRect.top) / 2);

		selectionToolbar = {
			visible: true,
			top: Math.max(116, fromRect.top + window.scrollY - 42),
			left: Math.min(window.innerWidth - 196, Math.max(16, (fromRect.left + toRect.right) / 2 + window.scrollX - 92))
		};
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

	function smartMarkdownEnter(view: EditorView) {
		const selection = view.state.selection.main;

		if (!selection.empty) return insertNewlineAndIndent(view);

		const line = view.state.doc.lineAt(selection.head);
		const list = (/^(\s*)((?:[-*+]|\d+[.)]))(\s+)(.*)$/).exec(line.text);

		if (!list) return insertNewlineAndIndent(view);

		const prefix = `${list[1]}${list[2]}${list[3]}`;
		const cursorOffset = selection.head - line.from;

		if (cursorOffset < prefix.length) return insertNewlineAndIndent(view);

		if (!list[4].trim()) {
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

		view.dispatch({
			changes: {
				from: selection.head,
				insert: `\n${list[1]}${nextListMarker(list[2])}${list[3]}`
			}
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

	function displayTextForMarkdownLine(line: string) {
		const trimmed = line.trim();

		if (!trimmed) return '';

		const heading = (/^#{1,6}\s+(.+)$/).exec(trimmed);

		if (heading) return heading[1].trim();

		const list = (/^[-*+]\s+(.+)$/).exec(trimmed);

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
		activeMode: 'comment' | 'suggest',
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
				connectorKind: activeMode === 'suggest' ? 'suggestion' : 'comment'
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

	function openComposer(nextMode: 'comment' | 'suggest') {
		mode = nextMode;

		if (nextMode === 'comment') {
			commentBody = '';
		}
	}

	function clearSelection() {
		selectedQuote = '';
		commentBody = '';
		replacementBody = '';
		selectionToolbar.visible = false;
		mainEditor?.dispatch({ selection: { anchor: mainEditor.state.selection.main.head } });
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

			unlistenNativeInsertMenu = await listen<InsertBlockKind>('margin://insert-block', (event) => {
				if (isInsertBlockKind(event.payload)) {
					insertMarkdownBlock(event.payload);
				}
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
		commentBody = '';
		replacementBody = '';
		selectionToolbar.visible = false;

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
			.map((image) => markdownImageReference(image.source, image.alt))
			.join('\n\n');
		const prefix = insertionPrefix(doc, position);
		const suffix = insertionSuffix(doc, position);
		const insert = `${prefix}${markdown}${suffix}`;
		const anchor = position + prefix.length + markdown.length;

		selectedQuote = '';
		commentBody = '';
		replacementBody = '';
		selectionToolbar.visible = false;
		error = '';

		view.dispatch({
			changes: { from: position, to: position, insert },
			selection: { anchor }
		});

		view.focus();
	}

	function editorPositionFromCoordinates(
		view: EditorView,
		coordinates: { x: number; y: number } | null
	) {
		if (!coordinates) return view.state.selection.main.head;

		const position = view.posAtCoords(coordinates);

		if (position !== null) return position;

		const scale = window.devicePixelRatio || 1;
		const scaledPosition = scale === 1
			? null
			: view.posAtCoords({ x: coordinates.x / scale, y: coordinates.y / scale });

		return scaledPosition ?? view.state.selection.main.head;
	}

	function markdownImageReference(source: string, alt: string) {
		const destination = isAbsoluteLocalPath(source)
			? markdownImageDestinationForPath(source)
			: source;

		return `![${escapeMarkdownImageAlt(alt)}](${markdownImageDestination(destination)})`;
	}

	function markdownImageDestinationForPath(path: string) {
		const normalized = normalizePathSeparators(path);
		const documentDirectory = nativeFilePath ? directoryPath(nativeFilePath) : '';
		const relative = documentDirectory ? relativeLocalPath(documentDirectory, normalized) : '';

		return relative || normalized;
	}

	function markdownImageDestination(destination: string) {
		const value = destination.trim();

		if (/[\s()<>]/.test(value)) {
			return `<${value.replace(/</g, '%3C').replace(/>/g, '%3E')}>`;
		}

		return value;
	}

	function escapeMarkdownImageAlt(value: string) {
		return value.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
	}

	function imageAltText(source: string) {
		const name = fileNameFromPath(source.split(/[?#]/)[0] || source);
		const withoutExtension = name.replace(/\.[^.]+$/, '');

		return decodePathComponent(withoutExtension).replace(/[-_]+/g, ' ').trim() || 'Image';
	}

	function isImageSourceLike(source: string) {
		return (/^(?:blob:|data:image\/)/i).test(source) || isImagePathLike(source) || source.startsWith('file://');
	}

	function isImagePathLike(path: string) {
		return (/\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)(?:[?#].*)?$/i).test(path);
	}

	function tauriInvoke<T>(command: string, args?: Record<string, unknown>) {
		const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;

		return invoke ? invoke<T>(command, args) : null;
	}

	function shouldHandleWebNativeShortcut() {
		return desktopShell && !nativeMenuBridgeReady;
	}

	async function loadAppSettings() {
		const request = desktopShell ? tauriInvoke<AppSettings>('read_settings') : null;

		try {
			const loadedSettings = request ? await request : readBrowserSettings();

			appSettings = normalizeSettings(loadedSettings);
		} catch(err) {
			console.warn('Unable to load settings', err);
			appSettings = { theme: 'auto' };
		}

		settingsDraftTheme = appSettings.theme;
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
		return { theme: normalizeTheme(settings?.theme) };
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

	function openSettingsDialog() {
		settingsDraftTheme = appSettings.theme;
		settingsError = '';
		settingsDialogOpen = true;
	}

	function closeSettingsDialog() {
		if (settingsSaving) return;

		settingsDialogOpen = false;
		settingsDraftTheme = appSettings.theme;
		settingsError = '';
	}

	async function saveSettings() {
		settingsSaving = true;
		settingsError = '';

		const nextSettings: AppSettings = { theme: settingsDraftTheme };

		const request = desktopShell
			? tauriInvoke<AppSettings>('write_settings', { settings: nextSettings })
			: null;

		try {
			const savedSettings = request ? await request : nextSettings;

			appSettings = normalizeSettings(savedSettings);

			if (!request) localStorage.setItem(settingsStorageKey, JSON.stringify(appSettings));

			applyTheme(appSettings.theme);
			settingsDialogOpen = false;
		} catch(err) {
			settingsError = err instanceof Error ? err.message : 'Unable to save settings';
		} finally {
			settingsSaving = false;
		}
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
			if (isMarkdownPathLike(nativeUrl)) {
				await openNativeMarkdownPath(nativeUrl);

				return;
			}

			error = `Margin could not open ${nativeUrl}`;

			return;
		}

		if (parsedUrl.protocol === 'file:') {
			await openNativeMarkdownPath(filePathFromFileUrl(parsedUrl));

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
			await openNativeMarkdownPath(path);

			return;
		}

		const pathSegments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
		const action = url.hostname || pathSegments[0] || 'open';

		if (action === 'open' || action === 'file') {
			const pathFromRoute = url.hostname ? url.pathname : `/${pathSegments.slice(1).join('/')}`;

			if (pathFromRoute && pathFromRoute !== '/') {
				await openNativeMarkdownPath(decodeURIComponent(pathFromRoute));

				return;
			}
		}

		if (action === 'document' || action === 'doc' || action === 'review' || action === 'cloud') {
			error = 'Cloud documents are planned for a later Margin version.';

			return;
		}

		error = `Margin link received, but no handler exists for "${action}" yet.`;
	}

	function filePathFromFileUrl(url: URL) {
		const path = decodeURIComponent(url.pathname);

		return (/^\/[A-Za-z]:\//).test(path) ? path.slice(1) : path;
	}

	function readRecentDocuments() {
		try {
			const raw = window.localStorage.getItem(recentDocumentsStorageKey);

			if (!raw) return [];

			const parsed = JSON.parse(raw) as RecentDocument[];

			if (!Array.isArray(parsed)) return [];

			return parsed.filter((entry) => typeof entry?.path === 'string' && typeof entry?.title === 'string').slice(0, maxRecentDocuments);
		} catch {
			return [];
		}
	}

	function persistRecentDocuments(nextRecentDocuments: RecentDocument[]) {
		recentDocuments = nextRecentDocuments.slice(0, maxRecentDocuments);

		try {
			window.localStorage.setItem(recentDocumentsStorageKey, JSON.stringify(recentDocuments));
		} catch {
			// Recent documents are a convenience; failures here should not block editing.
		}

		syncRecentDocumentsMenu();
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

		const request = tauriInvoke<void>('set_recent_documents_menu', {
			entries: recentDocuments.map(({ path, title }) => ({ path, title }))
		});

		if (!request) return;

		try {
			await request;
		} catch(err) {
			console.warn('Unable to update recent documents menu', err);
		}
	}

	async function openRecentDocument(index: number) {
		const recentDocument = recentDocuments[index];

		if (!recentDocument) return;

		await openNativeMarkdownPath(recentDocument.path, { removeRecentOnFailure: true });
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
		if (payload.type === 'enter' || payload.type === 'over') {
			dragActive = true;

			return;
		}

		if (payload.type === 'leave') {
			dragActive = false;

			return;
		}

		dragActive = false;

		const imagePaths = payload.paths.filter(isImagePathLike);
		const markdownPaths = payload.paths.filter(isMarkdownPathLike);

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

		if (markdownPaths.length === 0) {
			error = 'Drop Markdown, text, or image files.';

			return;
		}

		error = '';

		for (const path of markdownPaths) {
			await openNativeMarkdownPath(path);
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

	function isMarkdownPathLike(path: string) {
		return (/\.(md|markdown|txt)$/i).test(path);
	}

	function fileNameFromPath(path: string) {
		return path.split(/[\\/]/).filter(Boolean).at(-1) || 'Untitled.md';
	}

	function normalizePathSeparators(path: string) {
		return decodePathComponent(path).replace(/\\/g, '/');
	}

	function decodePathComponent(path: string) {
		try {
			return decodeURIComponent(path);
		} catch {
			return path;
		}
	}

	function isAbsoluteLocalPath(path: string) {
		const normalized = normalizePathSeparators(path);

		return normalized.startsWith('/') || (/^[A-Za-z]:\//).test(normalized);
	}

	function directoryPath(path: string) {
		const normalized = normalizePathSeparators(path);
		const index = normalized.lastIndexOf('/');

		if (index < 0) return '';
		if (index === 0) return '/';

		return normalized.slice(0, index);
	}

	function joinLocalPath(base: string, path: string) {
		const decodedPath = normalizePathSeparators(path);

		if (isAbsoluteLocalPath(decodedPath)) return decodedPath;

		const baseParts = splitLocalPath(base);
		const parts = [...baseParts.parts];

		for (const part of decodedPath.split('/')) {
			if (!part || part === '.') continue;
			if (part === '..') {
				parts.pop();
				continue;
			}

			parts.push(part);
		}

		return buildLocalPath(baseParts.root, parts);
	}

	function relativeLocalPath(fromDirectory: string, toPath: string) {
		const from = splitLocalPath(fromDirectory);
		const to = splitLocalPath(toPath);

		if (from.root !== to.root) return '';

		let shared = 0;

		while (from.parts[shared] && from.parts[shared] === to.parts[shared]) {
			shared += 1;
		}

		const up = from.parts.slice(shared).map(() => '..');
		const down = to.parts.slice(shared);

		return [...up, ...down].join('/');
	}

	function splitLocalPath(path: string) {
		const normalized = normalizePathSeparators(path);
		const drive = /^([A-Za-z]:)(?:\/|$)/.exec(normalized);
		const root = drive ? `${drive[1]}/` : normalized.startsWith('/') ? '/' : '';
		const rest = root
			? normalized.slice(root.length)
			: normalized;

		return {
			root,
			parts: rest.split('/').filter(Boolean)
		};
	}

	function buildLocalPath(root: string, parts: string[]) {
		if (!root) return parts.join('/');
		if (root === '/') return `/${parts.join('/')}`;

		return `${root}${parts.join('/')}`;
	}

	function createNewDocument() {
		syncActiveDocumentTab();
		createUntitledMarkdownDocument();
	}

	function createUntitledMarkdownDocument(options: { replaceActive?: boolean } = {}) {
		const fileName = nextUntitledFileName();
		const nextDocumentSessionKey = `local:untitled:${Date.now()}`;

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
		review = emptyLocalReview(fileName);
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

	function standaloneDocumentData(fileName: string, markdown: string): DocumentResponse {
		return {
			id: documentSessionKey,
			repo: 'Standalone Markdown',
			file_path: fileName,
			source_commit: 'local',
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
		review = localReviewFromEmbeddedBlock(fileName, splitDocument.comments);
		resetDraftState(splitDocument.markdown);
		clearSelection();
	}

	async function loadLocalMarkdownFile(file: File, handle: MarkdownFileHandle | null) {
		const serializedMarkdown = await file.text();
		const splitDocument = splitMarginCommentBlock(serializedMarkdown);
		const fileName = handle?.name || file.name || 'Untitled.md';
		const nextDocumentSessionKey = `local:${Date.now()}:${fileName}`;

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
		review = localReviewFromEmbeddedBlock(fileName, splitDocument.comments);
		resetDraftState(splitDocument.markdown);
		clearSelection();
		syncActiveDocumentTab();
		await tick();
		updateAnchorPositions();
	}

	async function saveLocalMarkdown() {
		if (!documentData) return;

		if (desktopShell && nativeFilePath) {
			await saveNativeMarkdownToPath(nativeFilePath);

			return;
		}

		if (!localFileMode || !localFileHandle?.createWritable) {
			await saveLocalMarkdownAs();

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
			markLocalFileSaved(snapshot.markdown, localFileHandle.name, 'Saved', snapshot.review, snapshot.serializedMarkdown);
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

		saveDialogOpen = true;

		try {
			error = '';

			const suggestedName = localFileName || documentData.file_path || 'document.md';

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
					markLocalFileSaved(snapshot.markdown, handle.name, 'Saved', snapshot.review, snapshot.serializedMarkdown);
				} catch(err) {
					if (isAbortError(err)) return;

					saveState = 'dirty';
					saveMessage = 'Save failed';
					error = err instanceof Error ? err.message : 'Unable to save Markdown file';
				}

				return;
			}

			const snapshot = persistenceSnapshot();

			downloadMarkdown(snapshot.serializedMarkdown, localFileName || documentData.file_path || 'document.md');
			localFileMode = true;
			markLocalFileSaved(snapshot.markdown, localFileName || documentData.file_path || 'document.md', 'Downloaded copy', snapshot.review, snapshot.serializedMarkdown);
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
			markLocalFileSaved(snapshot.markdown, document.name, 'Saved', snapshot.review, snapshot.serializedMarkdown);
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
		return markdown !== baseMarkdown || localMetadataDirty || pendingEditThreads.length > 0 || commentBody.trim().length > 0 || replacementBody.trim().length > 0;
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
		savedReview = reviewForPersistence(),
		serializedMarkdown = appendMarginCommentBlock(markdown, marginCommentBlockFromReview(savedReview))
	) {
		localFileName = fileName;
		review = savedReview;
		localMetadataDirty = false;
		lastPersistedSerializedMarkdown = serializedMarkdown;
		externalChange = null;
		saveState = 'saved';
		saveMessage = message;

		if (documentData) {
			documentData = { ...documentData, file_path: fileName, markdown };
		}

		resetDraftState(markdown);
		syncActiveDocumentTab();
	}

	function markLocalDocumentDirty(message = 'Unsaved changes') {
		if (!localFileMode) return;

		localMetadataDirty = true;
		saveState = externalChange ? 'conflict' : 'dirty';
		saveMessage = externalChange ? 'Changed on disk' : message;
		syncActiveDocumentTab();
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
		const snapshotReview = reviewForPersistence();

		return {
			markdown,
			review: snapshotReview,
			serializedMarkdown: appendMarginCommentBlock(markdown, marginCommentBlockFromReview(snapshotReview))
		};
	}

	function reviewForPersistence(): Review | null {
		if (!review || pendingEditThreads.length === 0) return review;

		const existingSuggestionKeys = new Set(review.suggestions.map((suggestion) => suggestionKey(suggestion.anchor.start_line, suggestion.anchor.end_line, suggestion.original, suggestion.replacement)));

		const materializedSuggestions = pendingEditThreads.filter((thread) => thread.kind === 'suggestion').filter((thread) => {
			const key = suggestionKey(thread.line, thread.endLine, thread.quote, thread.body);

			if (existingSuggestionKeys.has(key)) return false;

			existingSuggestionKeys.add(key);

			return true;
		}).map(pendingThreadToSuggestion);

		if (materializedSuggestions.length === 0) return review;

		return {
			...review,
			suggestions: [...review.suggestions, ...materializedSuggestions]
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

	function marginCommentBlockFromReview(snapshotReview: Review | null = review): MarginCommentBlock | null {
		if (!snapshotReview) return null;

		return {
			schema: 'margin.markdown-comments',
			version: 1,
			review_id: snapshotReview.id,
			reviewer: snapshotReview.reviewer,
			comments: snapshotReview.comments,
			suggestions: snapshotReview.suggestions,
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

	function materializePendingEditSuggestions(message = 'Unsaved suggestions') {
		if (!review || pendingEditThreads.length === 0) return false;

		const savedReview = reviewForPersistence();

		if (savedReview) review = savedReview;

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

	function isAbortError(err: unknown) {
		return err instanceof DOMException && err.name === 'AbortError';
	}

	function emptyLocalReview(fileName: string): Review {
		return {
			id: `local-review:${Date.now()}`,
			repo: 'Standalone Markdown',
			file_path: fileName,
			source_commit: 'local',
			reviewer,
			comments: [],
			suggestions: [],
			created_at: new Date().toISOString()
		};
	}

	function localReviewFromEmbeddedBlock(fileName: string, comments: MarginCommentBlock | null): Review {
		const fallback = emptyLocalReview(fileName);

		if (!comments) return fallback;

		return {
			...fallback,
			id: comments.review_id,
			reviewer: comments.reviewer || reviewer,
			comments: comments.comments,
			suggestions: comments.suggestions,
			created_at: comments.updated_at
		};
	}

	function handleGlobalShortcut(event: KeyboardEvent) {
		if (!shouldHandleWebNativeShortcut()) return;

		const mod = event.metaKey || event.ctrlKey;

		if (!mod || event.altKey) return;

		const key = event.key.toLowerCase();

		if (!event.shiftKey && key === 's') {
			event.preventDefault();
			saveLocalMarkdown();
		}

		if (!event.shiftKey && key === 'n') {
			event.preventDefault();
			createNewDocument();
		}

		if (!event.shiftKey && key === 'o') {
			event.preventDefault();
			openLocalMarkdown();
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

	function handleBeforeUnload(event: BeforeUnloadEvent) {
		syncActiveDocumentTab();

		const hasDirtyLocalTab = documentTabs.some((tab) => tab.localFileMode && (tab.saveState === 'dirty' || tab.saveState === 'conflict'));

		if (!hasDirtyLocalTab) return;

		event.preventDefault();
		event.returnValue = '';
	}

	async function submitComment() {
		if (!review || !selectedQuote || !commentBody) return;

		review = {
			...review,
			comments: [
				...review.comments,
				{
					id: `local-comment-${Date.now()}`,
					author: reviewer,
					body: commentBody,
					resolved: false,
					anchor: localAnchorForSelection(selectedQuote),
					created_at: new Date().toISOString()
				}
			]
		};

			markLocalDocumentDirty('Unsaved comments');
			await tick();
			updateAnchorPositions();
			settleEditorSelection();
	}

	async function submitSuggestion() {
		if (!review || !selectedQuote || !replacementBody) return;

		const anchor = localAnchorForSelection(selectedQuote);
		const suggestionKeyValue = suggestionKey(anchor.start_line, anchor.end_line, selectedQuote, replacementBody);

		replaceEditorSelection(replacementBody);

		review = {
			...review,
			suggestions: [
				...review.suggestions,
				{
					id: `local-suggestion-${Date.now()}`,
					author: reviewer,
					original: selectedQuote,
					replacement: replacementBody,
					applied: true,
					resolved: false,
					anchor,
					created_at: new Date().toISOString()
				}
			]
		};

		syncedEditKeys.add(suggestionKeyValue);
		pendingEditThreads = pendingEditThreads.filter((thread) => suggestionKey(thread.line, thread.endLine, thread.quote, thread.body) !== suggestionKeyValue && (thread.quote !== selectedQuote || thread.body !== replacementBody));
			markLocalDocumentDirty('Unsaved suggestion');
			await tick();
			updateAnchorPositions();
			settleEditorSelection();
	}

	async function acceptSuggestion(thread: ThreadView) {
		if (!review || thread.kind !== 'suggestion') return;

		activeThreadId = thread.id;
		replaceInEditor(thread.quote, thread.body);

		if (thread.pending) {
			syncedEditKeys.add(suggestionKey(thread.line, thread.endLine, thread.quote, thread.body));
			pendingEditThreads = pendingEditThreads.filter((candidate) => candidate.id !== thread.id);
		} else {
			review = updateLocalSuggestion(thread.id, { applied: true, resolved: false });
			markLocalDocumentDirty('Unsaved comments');
		}

		await tick();
		updateAnchorPositions();
	}

	async function rejectSuggestion(thread: ThreadView) {
		if (!review || thread.kind !== 'suggestion') return;

		activeThreadId = thread.id;
		replaceInEditor(thread.body, thread.quote);

		if (thread.pending) {
			pendingEditThreads = pendingEditThreads.filter((candidate) => candidate.id !== thread.id);
		} else {
			review = updateLocalSuggestion(thread.id, { applied: false, resolved: false });
			markLocalDocumentDirty('Unsaved comments');
		}

		await tick();
		updateAnchorPositions();
	}

	async function resolveSuggestion(thread: ThreadView) {
		if (!review || thread.kind !== 'suggestion') return;

		activeThreadId = thread.id;

		if (thread.pending) {
			syncedEditKeys.add(suggestionKey(thread.line, thread.endLine, thread.quote, thread.body));
			pendingEditThreads = pendingEditThreads.filter((candidate) => candidate.id !== thread.id);
		} else {
			review = updateLocalSuggestion(thread.id, { resolved: true });
			markLocalDocumentDirty('Unsaved comments');
		}

		await tick();
		updateAnchorPositions();
	}

	function updateLocalSuggestion(
		suggestionId: string,
		patch: { applied?: boolean; resolved?: boolean }
	): Review | null {
		if (!review) return review;

		return {
			...review,
			suggestions: review.suggestions.map((suggestion) => suggestion.id === suggestionId ? { ...suggestion, ...patch } : suggestion)
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
		pendingEditThreads = draftMarkdownSuggestions(draftChanges, draftBaseMarkdown, editorMarkdown, persistedThreads, { author: reviewer, syncedKeys: syncedEditKeys });
	}

	function replaceEditorSelection(replacement: string) {
		if (!mainEditor) return;

		const selection = mainEditor.state.selection.main;

		if (selection.empty) return;

		mainEditor.dispatch({
			changes: { from: selection.from, to: selection.to, insert: replacement },
			selection: { anchor: selection.from + replacement.length }
		});

		editorMarkdown = mainEditor.state.doc.toString();
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
		if (!review || thread.kind !== 'comment') return;

		review = {
			...review,
			comments: review.comments.map((comment) => comment.id === thread.id ? { ...comment, resolved: true } : comment)
		};

		markLocalDocumentDirty('Unsaved comments');
		await tick();
		updateAnchorPositions();
	}
</script>

<main
	class="doc-app"
	class:desktop-shell={desktopShell}
	class:mobile-shell={mobileShell}
	class:drag-active={dragActive}
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

				{#if visibleDocumentTabs.length > 1}
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
					{/if}
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

			<div data-tauri-drag-region>
				<p class="eyebrow">{documentData?.repo ?? 'Loading repo'}</p>
				<h1>{documentData?.file_path ?? 'Opening document'}</h1>
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
				onclick={saveLocalMarkdown}
			>
				<SaveIcon aria-hidden="true" />
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

			<span>Live Preview</span>
			<span>Standalone editor</span>
			<span class:dirty-status={saveState === 'dirty' || saveState === 'conflict'}>{saveMessage || 'Local file'}</span>
			<span>{countLabel(review?.comments.length ?? 0, 'comment')}</span>
			<span>{countLabel(review?.suggestions.length ?? 0, 'saved suggestion')}</span>

			{#if pendingEditThreads.length > 0}
				<span>{countLabel(pendingEditThreads.length, 'unsaved edit suggestion')}</span>
			{/if}
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
					onclick={saveLocalMarkdownAs}
				>
					Save As
				</Button>
			</div>
		</section>
	{/if}

	{#if selectionToolbar.visible && selectedQuote}
		<ToggleGroup.Root
			class="selection-toolbar"
			aria-label="Selection actions"
			type="single"
			value={mode}
			style={`top: ${selectionToolbar.top}px; left: ${selectionToolbar.left}px;`}
			onmousedown={(event) => event.preventDefault()}
		>
			<ToggleGroup.Item
				class={mode === 'comment' ? 'active' : ''}
				value="comment"
				onclick={() => openComposer('comment')}
			>Comment</ToggleGroup.Item>

			<ToggleGroup.Item
				class={mode === 'suggest' ? 'active' : ''}
				value="suggest"
				onclick={() => openComposer('suggest')}
			>Suggest</ToggleGroup.Item>
		</ToggleGroup.Root>
	{/if}

	<div class="review-canvas">
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

		<aside class="margin-rail" aria-label="Document comments">
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
								class:connector-active={activeThreadId === item.id}
								d={connectorPath(item.anchorTop, item.top)}
							></path>

							<path
								class:connector-suggestion={item.connectorKind === 'suggestion'}
								class:connector-active={activeThreadId === item.id}
								d={connectorPath(item.anchorTop, item.top)}
							></path>

							<circle
								class="connector-source"
								class:connector-suggestion={item.connectorKind === 'suggestion'}
								class:connector-active={activeThreadId === item.id}
								cx="0"
								cy={Math.max(12, item.anchorTop)}
								r="3"
							></circle>

						{/each}
					</svg>
				{/if}

					<section class="review-summary">
						<span>Margin notes</span>
						<strong>{countLabel(threads.length, 'open note')}</strong>
					</section>

				{#if threads.length === 0 && !selectedQuote}
					<section class="empty-thread">
						<strong>No comments yet</strong>
						<p>Select text to comment, or type in the document to suggest an edit.</p>
					</section>
				{/if}

				{#each marginItems as item}
					{#if item.type === 'composer'}
						<section
							class="inline-composer"
							class:suggestion={item.connectorKind === 'suggestion'}
							aria-label="New review note"
							style={`top: ${item.top}px;`}
							use:measureHeight={item.id}
						>
							<div class="composer-header">
								<div class="avatar">AF</div>

								<div>
									<strong>{mode === 'comment' ? 'Add comment' : 'Suggest edit'}</strong>
									<span>Anchored to selected text</span>
								</div>

									<Button
										variant="ghost"
										size="icon-sm"
										class="icon-button"
										aria-label="Close composer"
										onclick={clearSelection}
									>
										<XIcon aria-hidden="true" />
									</Button>
								</div>

							<blockquote>{selectedQuote}</blockquote>

							{#if mode === 'comment'}
								<Textarea
									bind:value={commentBody}
									placeholder="Comment on this selection"
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
							{:else}
								<Textarea
									bind:value={replacementBody}
									aria-label="Replacement text"
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
										onclick={submitSuggestion}
										disabled={!selectionReady || !replacementBody}
									>Suggest</Button>
								</div>
							{/if}
						</section>
					{:else}
						<div
							class:thread-card={true}
							class:suggestion={item.thread.kind === 'suggestion'}
							class:pending={item.thread.pending}
							class:rejected={item.thread.status === 'rejected'}
							class:resolved={item.thread.status === 'resolved'}
							class:focused={activeThreadId === item.thread.id}
							role="button"
							tabindex="0"
							style={`top: ${item.top}px;`}
							on:click={() => goToThread(item.thread)}
							on:keydown={(event) => event.key === 'Enter' && goToThread(item.thread)}
							on:mouseenter={() => activeThreadId = item.thread.id}
							on:mouseleave={() => activeThreadId = ''}
							use:measureHeight={item.id}
						>
							<div class="thread-header">
								<div class="avatar">{item.thread.author.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>

									<div>
										<strong>{item.thread.author}</strong>
									</div>

								{#if item.thread.kind === 'suggestion'}
									<Badge
										variant="outline"
										class="status-pill"
									>{suggestionStatusLabel(item.thread)}</Badge>
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

							<div class="thread-actions">
								{#if item.thread.kind === 'suggestion'}
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
								{:else}
									<Button
										variant="ghost"
										size="sm"
										onclick={(event) => {
											event.stopPropagation();
											resolveComment(item.thread);
										}}
									>Resolve</Button>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</aside>
	</div>

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
