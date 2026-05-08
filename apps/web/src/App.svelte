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
		type Range,
		type Transaction
	} from '@codemirror/state';

	import {
		Decoration,
		EditorView,
		ViewPlugin,
		keymap,
		runScopeHandlers,
		type Panel,
		type ViewUpdate
	} from '@codemirror/view';
	import { tags } from '@lezer/highlight';

	import FolderTreeIcon from '@lucide/svelte/icons/folder-tree';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import { onMount, tick } from 'svelte';
	import brandMarkUrl from '../../../assets/margin-icon.svg';
	import brandMarkDarkUrl from '../../../assets/margin-icon-dk.svg';
	import { Button } from '$lib/components/ui/button/index.js';
	import CommandPalette from './lib/features/app/components/CommandPalette.svelte';
	import EditorTitlebar from './lib/features/app/components/EditorTitlebar.svelte';
	import MarginRail from './lib/features/app/components/MarginRail.svelte';
	import PrintDocument from './lib/features/app/components/PrintDocument.svelte';
	import PrintOptionsDialog from './lib/features/app/components/PrintOptionsDialog.svelte';
	import SettingsDialog from './lib/features/app/components/SettingsDialog.svelte';
	import UpdateNotice from './lib/features/app/components/UpdateNotice.svelte';
	import WordCountDialog from './lib/features/app/components/WordCountDialog.svelte';
	import FileTreePanel from './lib/features/documents/components/FileTreePanel.svelte';
	import SoseinCloudPanel from './lib/features/sosein-cloud/components/SoseinCloudPanel.svelte';
	import SoseinCloudDialog from './lib/features/sosein-cloud/components/SoseinCloudDialog.svelte';
	import { draftMarkdownSuggestions, suggestionKey } from './lib/features/comments/draft-suggestions';
	import {
		buildCommandPaletteCommandEntries,
		buildQuickOpenPaletteEntries
	} from './lib/features/app/command-registry';
	import {
		adjacentDocumentTab,
		closeDocumentTabs,
		nextUntitledFileName,
		syncDocumentTab,
		tabHasDiscardableWork,
		visibleDocumentTabs as projectVisibleDocumentTabs
	} from './lib/features/documents/document-tabs';
	import { defaultLocalUserName, normalizeLocalUserName } from './lib/features/app/local-identity';
	import {
		createBrowserLocalDocumentSession,
		createNativeLocalDocumentSession,
		createUntitledLocalDocumentSession,
		hasAutosavableLocalChanges as computeHasAutosavableLocalChanges,
		hasUnsavedLocalChanges as computeHasUnsavedLocalChanges,
		hasWritableLocalSaveTarget as computeHasWritableLocalSaveTarget,
		refreshLocalSaveState as computeRefreshLocalSaveState,
		shouldAutosaveLocalDocument as computeShouldAutosaveLocalDocument
	} from './lib/features/documents/local-document-session';
	import { registerNativeDesktopBridge } from './lib/features/native-shell/native-bridge';
	import {
		SoseinCloudApiError,
		SoseinCloudClient,
		mergedStoredUserFromSoseinUser,
		normalizeSoseinDocumentTitle,
		soseinEnvironmentForServerUrl,
		soseinDocumentFileName,
		soseinStoredUserDisplayName,
		soseinServerUrlForEnvironment,
		storedSessionFromAuth,
		type SoseinAuthSession,
		type SoseinCloudEnvironment,
		type SoseinCloudRequest,
		type SoseinDocument,
		type SoseinDocumentSummary,
		type SoseinStoredSession
	} from './lib/features/sosein-cloud/sosein-cloud';
	import type { SoseinCodeMirrorSync, SoseinSyncStatus } from './lib/features/sosein-cloud/sosein-codemirror-sync';
	import {
		addRecentDocumentEntry,
		readBrowserRecentDocuments,
		removeRecentDocumentEntry,
		writeBrowserRecentDocuments
	} from './lib/features/documents/recent-documents-service';
	import {
		clearSoseinSession,
		readSoseinSession,
		writeSoseinSession
	} from './lib/features/sosein-cloud/sosein-session-store';
	import {
		createSoseinDocumentState,
		findExistingSoseinDocumentTab
	} from './lib/features/sosein-cloud/sosein-workspace';
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
		relativeLocalPath,
		type RecentDocument
	} from './lib/features/documents/local-documents';
	import {
		markdownImageFromMatch,
		markdownImageOnly,
		markdownImagePattern
	} from './lib/markdown-images';
	import { inlineMarkdownMathSpans } from './lib/markdown-math';
	import { markdownCodeFenceLanguage } from './lib/markdown-code-fences';
	import {
		leadingMarkdownIndent,
		markdownIndentWidth,
		sourceMarkdownIndentLengthForWidth
	} from './lib/markdown-indent';
	import {
		isMermaidSourceBlock,
		markdownMermaidBlockSource,
		renderMermaidIntoElement,
		resetMermaidTheme
	} from './lib/live-preview/mermaid';
	import {
		CodeLanguageLabelWidget,
		FrontmatterWidget,
		HeadingCollapseToggleWidget,
		HorizontalRuleWidget,
		ListCollapseToggleWidget,
		MarkdownImageWidget,
		MarkdownMathWidget,
		MarkdownMermaidWidget,
		MarkdownTableWidget,
		SourceIndentGuideWidget,
		SuggestionBadgeWidget,
		SuggestionWidget,
		TaskCheckboxWidget,
		markdownImagePlaceholderAttributes
	} from './lib/live-preview/widgets/index';
	import {
		parsePartialMarkdownTextCore,
		type ParsedPartialMarkdownTextCore
	} from './lib/partial-markdown-core';
	import {
		MarkdownSourceModeDecider,
		PartialMarkdownTextModel,
		blockForLine,
		isOrderedListMarker,
		markdownHeadingLine,
		markdownListContentOffset,
		markdownListInfo,
		markdownListInfoFallback,
		markdownListLayoutForItem,
		type ListContinuationInfo,
		type MarkdownLineRange,
		type MarkdownListLayout,
		type SourceBlock
	} from './lib/partial-markdown-text';

	import {
		appendMarginCommentBlock,
		splitMarginCommentBlock,
		type MarginCommentBlock
	} from './lib/embedded-margin';
	import { renderPrintMarkdown } from './lib/features/print/print-markdown';

	import type { LocalDocument, MarginAnchor, MarginSuggestion, LocalAnnotations } from './lib/types';
	import type {
		AppSettings,
		AppUpdateCheckState,
		AppUpdateMetadata,
		CommandPaletteEntry,
		CommandPaletteMode,
		CommandPaletteOpenRequest,
		CommentSelectionAnchor,
		DocumentTab,
		DocumentViewport,
		EditingMode,
		ExternalDocumentChange,
		FilePickerWindow,
		FindPanelHandle,
		FindPanelIconName,
		FindPanelMode,
		FindPanelModeOptions,
		FindPanelPosition,
		InsertBlockKind,
		LivePreviewState,
		MarginItem,
		MarkdownFileHandle,
		NativeDirectoryEntry,
		NativeDirectoryTree,
		NativeMarkdownDocument,
		NativeMarkdownDocumentChange,
		NativeOpenPathPayload,
		NativeSoseinApiResponse,
		PrintDocumentOptions,
		ReviewCountStats,
		SaveLocalMarkdownOptions,
		SaveState,
		SoseinActiveDocument,
		SuggestionStatus,
		SuggestionSurfaceKind,
		TaskCountStats,
		TauriDragDropPayload,
		TauriWindow,
		ThemeSetting,
		ThreadRangeMatch,
		ThreadView,
		TypingProfile,
		TypingProfileRow,
		WordCountMetrics,
		WordCountStats,
		WorkspaceMode
	} from './lib/app-types';

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
	let appSettings: AppSettings = {
		theme: 'auto',
		localUserName: defaultLocalUserName(),
		soseinCloudEnabled: false
	};
	let settingsDraftTheme: ThemeSetting = 'auto';
	let settingsDraftLocalUserName = defaultLocalUserName();
	let localAuthor = defaultLocalUserName();
	let commentAuthor = defaultLocalUserName();
	let commentAuthorImageUrl = '';
	let workspaceMode: WorkspaceMode = { kind: 'local' };
	let soseinCloudEnvironment: SoseinCloudEnvironment = 'prod';
	let soseinCloudServerUrl: string = soseinServerUrlForEnvironment(soseinCloudEnvironment);
	let soseinSession: SoseinStoredSession | null = null;
	let soseinDialogOpen = false;
	let soseinDocuments: SoseinDocumentSummary[] = [];
	let soseinDocumentsLoading = false;
	let soseinAuthLoading = false;
	let soseinDocumentOpening = false;
	let soseinCloudError = '';
	let soseinNewDocumentTitle = 'Untitled';
	let soseinCloudVisible = false;
	let soseinActiveDocument: SoseinActiveDocument | null = null;
	let soseinEditorSync: SoseinCodeMirrorSync | null = null;
	let soseinSyncStatus: SoseinSyncStatus = 'disconnected';
	let soseinSyncRun = 0;
	let settingsDialogOpen = false;
	let printOptionsDialogOpen = false;
	let wordCountDialogOpen = false;
	let wordCountStats: WordCountStats = emptyWordCountStats();
	let includeMarginNotesAppendix = true;
	let settingsSaving = false;
	let settingsSaveQueued = false;
	let settingsError = '';
	let availableAppUpdate: AppUpdateMetadata | null = null;
	let updateCheckState: AppUpdateCheckState = 'idle';
	let updateStatusMessage = '';
	let updateNoticeVisible = false;
	let updateAutoCheckTimer: ReturnType<typeof setTimeout> | null = null;
	let error = '';

	$: soseinCloudServerUrl = soseinServerUrlForEnvironment(soseinCloudEnvironment);
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
	let documentViewport: DocumentViewport = { top: 0, bottom: Number.POSITIVE_INFINITY };
	let persistedThreads: ThreadView[] = [];
	let threads: ThreadView[] = [];
	let marginItems: MarginItem[] = [];
	let stageHeight = 720;
	let activeThreadId = '';
	let hoveredThreadId = '';
	let selectedThreadId = '';
	let resolvingThreadIds = new Set<string>();
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
	let nativeDesktopBridgeCleanup: Array<() => void> = [];
	let tauriShell = false;
	let desktopShell = false;
	let mobileShell = false;
	let nativeMenuBridgeReady = false;
	let nativeDragHasEditorImages = false;
	let saveDialogOpen = false;
	let documentTabs: DocumentTab[] = [];
	let visibleDocumentTabs: DocumentTab[] = [];
	let activeDocumentTabId = '';
	let lastReportedDesktopWindowHasTabs: boolean | null = null;
	let lastReportedDesktopWindowMode: WorkspaceMode['kind'] | null = null;
	let recentDocuments: RecentDocument[] = [];
	let dragActive = false;
	let printDocumentHtml = '';
	let printAppendixCandidateThreads: ThreadView[] = [];
	let printableThreads: ThreadView[] = [];
	let fileTreeRoot: NativeDirectoryTree | null = null;
	let fileTreePanelOpen = false;
	let fileTreePanelWidth = 300;
	let fileTreeLoading = false;
	let fileTreeError = '';
	let anchorPositionFrame: number | null = null;
	let commandPaletteOpenRequest: CommandPaletteOpenRequest | null = null;
	let commandPaletteRequestId = 0;
	let commandPaletteIsOpen = false;
	let collapsedHeadingKeys = new Set<string>();
	let collapsedListItemKeys = new Set<string>();
	const syncedEditKeys = new Set<string>();
	const anchorContextCharacters = 96;
	const commentResolveAnimationMs = 320;
	const gutterCardGap = 14;
	const gutterReservedTop = 86;
	const marginViewportPadding = 180;
	const recentDocumentsStorageKey = 'margin:recent-documents:v1';
	const settingsStorageKey = 'margin:settings:v1';
	const localAutosaveDelayMs = 900;
	const saveProgressMinVisibleMs = 1000;
	const saveProgressFadeMs = 500;
	const markdownBlockWidgetNavigationRadius = 6;
	const livePreviewViewportLineBuffer = 80;
	const typingProfilerStorageKey = 'margin:typing-profiler';
	const typingProfilerThresholdStorageKey = 'margin:typing-profiler-threshold-ms';
	const themeOptions: ThemeSetting[] = ['auto', 'light', 'dark'];
	const loadingMarkdownCodeLanguages = new Map<string, Promise<unknown>>();
	let pendingTypingProfile: TypingProfile | null = null;
	let partialMarkdownTextModelCache: {
		collapsedHeadingKeys: ReadonlySet<string>;
		collapsedListItemKeys: ReadonlySet<string>;
		documentSessionKey: string;
		model: PartialMarkdownTextModel;
		parsed: ParsedPartialMarkdownTextCore
	} | null = null;
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

	const setThreadsEffect = StateEffect.define<ThreadView[]>();
	const setActiveThreadEffect = StateEffect.define<string>();
	const setCommentAnchorEffect = StateEffect.define<CommentSelectionAnchor | null>();
	const refreshLivePreviewEffect = StateEffect.define<void>();
	const setMarginDropCursorEffect = StateEffect.define<number | null>();
	const markdownParseField = StateField.define<ParsedPartialMarkdownTextCore>({
		create(state) {
			return parsePartialMarkdownTextCore(state.doc.toString());
		},

		update(value, transaction) {
			if (!transaction.docChanged) return value;

			const profile = startTypingProfile(transaction);
			const start = profile ? performance.now() : 0;
			const parsed = parsePartialMarkdownTextCore(transaction.state.doc.toString());

			if (profile) {
				profile.parseMs = performance.now() - start;
				pendingTypingProfile = profile;
			}

			return parsed;
		}
	});

	function startTypingProfile(transaction: Transaction): TypingProfile | null {
		if (!typingProfilerEnabled()) return null;

		return {
			changedLines: changedLineSummary(transaction),
			decorationRanges: 0,
			decorationsMs: 0,
			docLength: transaction.state.doc.length,
			lines: transaction.state.doc.lines,
			modelCache: 'unknown',
			modelMs: 0,
			parseMs: 0,
			startedAt: performance.now(),
			state: transaction.state,
			totalMs: 0
		};
	}

	function consumeTypingProfile(state: EditorState) {
		if (!pendingTypingProfile || pendingTypingProfile.state !== state) return null;

		const profile = pendingTypingProfile;
		pendingTypingProfile = null;

		return profile;
	}

	function activeTypingProfile(state: EditorState) {
		if (!pendingTypingProfile || pendingTypingProfile.state !== state) return null;

		return pendingTypingProfile;
	}

	function changedLineSummary(transaction: Transaction) {
		const ranges: string[] = [];

		transaction.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
			const startPosition = Math.min(fromB, transaction.state.doc.length);
			const endPosition = Math.min(Math.max(fromB, toB > fromB ? toB - 1 : fromB), transaction.state.doc.length);
			const startLine = transaction.state.doc.lineAt(startPosition).number;
			const endLine = transaction.state.doc.lineAt(endPosition).number;

			ranges.push(startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`);
		});

		return ranges.join(', ') || 'none';
	}

	function typingProfilerEnabled() {
		if (typeof window === 'undefined') return false;

		try {
			return window.localStorage.getItem(typingProfilerStorageKey) === '1'
				|| new URLSearchParams(window.location.search).has('typingProfile');
		} catch {
			return false;
		}
	}

	function logTypingProfile(profile: TypingProfile) {
		const row: TypingProfileRow = {
			lines: profile.lines,
			docLength: profile.docLength,
			changedLines: profile.changedLines,
			parseMs: formatProfileMs(profile.parseMs),
			modelMs: formatProfileMs(profile.modelMs),
			decorationsMs: formatProfileMs(profile.decorationsMs),
			totalMs: formatProfileMs(profile.totalMs),
			modelCache: profile.modelCache,
			decorationRanges: profile.decorationRanges
		};

		if (profile.totalMs < typingProfilerThresholdMs()) return;

		recordTypingProfile(row);

		if (console.table) {
			console.table([row]);
		} else {
			console.debug('[Margin typing profile]', row);
		}

		console.debug('[Margin typing profile]', JSON.stringify(row));
	}

	function recordTypingProfile(row: TypingProfileRow) {
		if (typeof window === 'undefined') return;

		const target = window as typeof window & { __marginTypingProfiles?: TypingProfileRow[] };

		target.__marginTypingProfiles ??= [];
		target.__marginTypingProfiles.push(row);
	}

	function typingProfilerThresholdMs() {
		if (typeof window === 'undefined') return 0;

		try {
			const value = Number(window.localStorage.getItem(typingProfilerThresholdStorageKey) ?? '0');

			return Number.isFinite(value) ? value : 0;
		} catch {
			return 0;
		}
	}

	function formatProfileMs(value: number) {
		return Number(value.toFixed(2));
	}

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
		create() {
			return {
				threads: [],
				activeThreadId: '',
				commentAnchor: null
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

			if (threadChange || activeThreadChange || commentAnchorChange || refreshPreview) {
				return {
					threads: threadsForState,
					activeThreadId: activeThreadForState,
					commentAnchor: commentAnchorForState
				};
			}

			return value;
		}
	});

	const livePreviewBlockDecorationField = StateField.define({
		create(state) {
			return buildLivePreviewBlockDecorations(state);
		},

		update(value, transaction) {
			let refreshPreview = false;

			for (const effect of transaction.effects) {
				if (effect.is(refreshLivePreviewEffect)) {
					refreshPreview = true;
					break;
				}
			}

			if (transaction.docChanged || transaction.selection || refreshPreview) {
				return buildLivePreviewBlockDecorations(transaction.state, activeTypingProfile(transaction.state));
			}

			return value;
		},
		provide: (field) => EditorView.decorations.from(field)
	});

	const livePreviewPlugin = ViewPlugin.fromClass(
		class {
			decorations = Decoration.none;
			view: EditorView;

			constructor(view: EditorView) {
				this.view = view;
				this.decorations = this.build();
			}

			update(update: ViewUpdate) {
				if (!this.shouldRebuild(update)) return;

				const profile = consumeTypingProfile(update.state);

				this.decorations = this.build(profile);
				if (profile) logTypingProfile(profile);
			}

			build(profile: TypingProfile | null = null) {
				const metadata = this.view.state.field(livePreviewField);

				return buildLivePreviewDecorations(
					this.view,
					this.view.state,
					metadata.threads,
					metadata.activeThreadId,
					metadata.commentAnchor,
					profile
				);
			}

			shouldRebuild(update: ViewUpdate) {
				if (update.docChanged || update.selectionSet || update.viewportChanged) return true;

				for (const transaction of update.transactions) {
					for (const effect of transaction.effects) {
						if (
							effect.is(setThreadsEffect)
							|| effect.is(setActiveThreadEffect)
							|| effect.is(setCommentAnchorEffect)
							|| effect.is(refreshLivePreviewEffect)
						) {
							return true;
						}
					}
				}

				return false;
			}
		},
		{
			decorations: (plugin) => plugin.decorations
		}
	);

	$: persistedThreads = annotations
		? [
			...annotations.comments.filter((comment) => !comment.resolved).map((comment) => ({
				id: comment.id,
				kind: 'comment' as const,
				author: comment.author,
				authorImageUrl: comment.author_image_url,
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
				authorImageUrl: suggestion.author_image_url,
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
		saveMessage,
		externalChange,
		soseinActiveDocument,
		projectVisibleDocumentTabs(documentTabs, activeDocumentTabId, currentDocumentTabSnapshot())
	);
	$: workspaceModeKind = workspaceMode.kind;
	$: workspaceNavigatorLabel = workspaceMode.kind === 'sosein' ? 'cloud documents' : 'file tree';
	$: showDocumentTitlebar = workspaceMode.kind !== 'sosein' || Boolean(documentData);
	$: desktopWindowHasTabs = documentTabs.length > 0;
	$: reportDesktopWindowWorkspaceMode(workspaceModeKind);
	$: reportDesktopWindowTabState(desktopWindowHasTabs);
	$: documentTitleLabel = localFileName || documentData?.fileName || 'Untitled.md';
	$: documentLocationLabel = workspaceMode.kind === 'sosein' && !soseinActiveDocument
		? (soseinSession ? soseinStoredUserDisplayName(soseinSession.user) : 'Sosein Cloud')
		: documentLocationLabelFor(
			soseinActiveDocument,
			soseinSession,
			soseinSyncStatus,
			nativeFilePath
		);
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
	$: marginItems = layoutMarginItems(threads, selectedQuote, selectedLineTop, lineTops, annotationTops, cardHeights, documentViewport);
	$: stageHeight = Math.max(documentHeight, ...marginItems.map((item) => item.top + item.height + 24), 240);
	$: marginRailOpen = threads.length > 0 || selectedQuote.trim().length > 0;
	$: if (selectedThreadId && !threads.some((thread) => thread.id === selectedThreadId)) selectedThreadId = '';
	$: if (hoveredThreadId && !threads.some((thread) => thread.id === hoveredThreadId)) hoveredThreadId = '';
	$: activeThreadId = selectedThreadId || hoveredThreadId;
	$: updateSaveProgressIndicator(saveState);
	$: localAuthor = appSettings.localUserName;
	$: commentAuthor = workspaceMode.kind === 'sosein' && soseinSession
		? soseinStoredUserDisplayName(soseinSession.user)
		: localAuthor;
	$: commentAuthorImageUrl = workspaceMode.kind === 'sosein' ? (soseinSession?.user.profilePictureUrl ?? '') : '';

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
		const initialSoseinEnvironment = soseinEnvironmentFromSearchParams(searchParams);
		if (initialSoseinEnvironment) {
			soseinCloudEnvironment = initialSoseinEnvironment;
			soseinCloudServerUrl = soseinServerUrlForEnvironment(initialSoseinEnvironment);
		}
		workspaceMode = workspaceModeFromSearchParams(searchParams);
		if (workspaceMode.kind === 'sosein') fileTreePanelOpen = true;
		void initializeSoseinCloudVisibility();
		initializeSoseinCloudState(searchParams);
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
		window.addEventListener('resize', scheduleAnchorPositionUpdate);
		window.addEventListener('scroll', scheduleAnchorPositionUpdate, { passive: true });
		window.addEventListener('pointerdown', handleGlobalPointerDown);
		window.addEventListener('keydown', handleGlobalShortcut);
		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('resize', scheduleAnchorPositionUpdate);
			window.removeEventListener('scroll', scheduleAnchorPositionUpdate);
			window.removeEventListener('pointerdown', handleGlobalPointerDown);
			window.removeEventListener('keydown', handleGlobalShortcut);
			window.removeEventListener('beforeunload', handleBeforeUnload);
			clearAnchorPositionFrame();
			clearLocalAutosaveTimer();
			clearSaveProgressTimers();
			destroySoseinEditorSync();
			clearUpdateAutoCheckTimer();
			clearCommentComposerAttention();
			for (const cleanup of nativeDesktopBridgeCleanup) cleanup();
			nativeDesktopBridgeCleanup = [];
			nativeMenuBridgeReady = false;
		};
	});

	function isIOSLikeWebView() {
		const platform = navigator.platform || '';
		const userAgent = navigator.userAgent || '';

		return (/iPhone|iPad|iPod/i).test(userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	}

	function workspaceModeFromSearchParams(searchParams: URLSearchParams): WorkspaceMode {
		if (searchParams.get('workspace') !== 'sosein') return { kind: 'local' };

		return {
			kind: 'sosein',
			serverUrl: soseinCloudServerUrl,
			workspaceId: '',
			userEmail: ''
		};
	}

	function soseinEnvironmentFromSearchParams(searchParams: URLSearchParams): SoseinCloudEnvironment | null {
		const environment = searchParams.get('sosein_cloud_environment');

		if (environment === 'prod' || environment === 'staging') return environment;

		return null;
	}

	function enterLocalWorkspaceMode(rootPath?: string) {
		workspaceMode = rootPath ? { kind: 'local', rootPath } : { kind: 'local' };
	}

	function enterSoseinWorkspaceMode(session = soseinSession) {
		workspaceMode = {
			kind: 'sosein',
			serverUrl: session?.serverUrl ?? soseinCloudServerUrl,
			workspaceId: session?.defaultWorkspace.id ?? '',
			userEmail: session?.user.email ?? ''
		};
		fileTreePanelOpen = true;

		if (session) void refreshSoseinDocuments();
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

		if (!documentData && workspaceMode.kind !== 'sosein') createUntitledMarkdownDocument();
	}

	function activeEditorMarkdown() {
		return mainEditor?.state.doc.toString() ?? editorMarkdown;
	}

	function currentDocumentTabSnapshot() {
		return {
			documentData,
			annotations,
			editorMarkdown: activeEditorMarkdown(),
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
			soseinDocument: soseinActiveDocument,
			documentSessionKey,
			syncedEditKeys
		};
	}

	function syncActiveDocumentTab() {
		documentTabs = syncDocumentTab(documentTabs, activeDocumentTabId, currentDocumentTabSnapshot());
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
			if (await closeLastDesktopTabOrQuitApp()) {
				return;
			}

			createUntitledMarkdownDocument({ replaceActive: true });

			return;
		}

		const { nextActiveTab, nextTabs } = closeDocumentTabs(documentTabs, activeDocumentTabId, tabId);
		documentTabs = nextTabs;

		if (tabId === activeDocumentTabId) {
			if (nextActiveTab) await applyDocumentTab(nextActiveTab);
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

	function reportDesktopWindowTabState(hasTabs: boolean) {
		if (!desktopShell || lastReportedDesktopWindowHasTabs === hasTabs) return;

		lastReportedDesktopWindowHasTabs = hasTabs;

		const request = tauriInvoke<void>('set_window_tab_state', { hasTabs });

		if (!request) return;

		request.catch((err) => {
			console.warn('Unable to report desktop window tab state', err);
			lastReportedDesktopWindowHasTabs = null;
		});
	}

	function reportDesktopWindowWorkspaceMode(mode: WorkspaceMode['kind']) {
		if (!desktopShell || lastReportedDesktopWindowMode === mode) return;

		lastReportedDesktopWindowMode = mode;

		const request = tauriInvoke<void>('set_window_workspace_mode', { mode });

		if (!request) return;

		request.catch((err) => {
			console.warn('Unable to report desktop window workspace mode', err);
			lastReportedDesktopWindowMode = null;
		});
	}

	async function closeLastDesktopTabOrQuitApp() {
		if (!desktopShell) return false;

		const request = tauriInvoke<void>('close_last_tab_or_quit_app');

		if (!request) return false;

		try {
			await request;

			return true;
		} catch(err) {
			console.warn('Unable to close last desktop tab', err);

			return false;
		}
	}

	async function closeActiveDocumentTab() {
		if (!activeDocumentTabId) return;

		await closeDocumentTab(activeDocumentTabId);
	}

	async function activateAdjacentDocumentTab(direction: -1 | 1) {
		syncActiveDocumentTab();

		const nextTab = adjacentDocumentTab(documentTabs, activeDocumentTabId, direction);

		if (!nextTab) return;

		await applyDocumentTab(nextTab);
	}

	async function applyDocumentTab(nextTab: DocumentTab) {
		clearLocalAutosaveTimer();
		destroySoseinEditorSync();
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
		soseinActiveDocument = nextTab.soseinDocument;
		soseinSyncStatus = soseinActiveDocument ? 'connecting' : 'disconnected';
		documentSessionKey = nextTab.documentSessionKey;
		clearThreadFocus();
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
		if (soseinActiveDocument) void connectSoseinEditorSyncForActiveDocument();
		await tick();
		updateAnchorPositions();
	}

	function buildLivePreviewBlockDecorations(
		state: EditorState,
		profile: TypingProfile | null = null
	) {
		const ranges: Range<Decoration>[] = [];
		const decorationStart = profile ? performance.now() : 0;
		const parseMsBeforeDecorations = profile?.parseMs ?? 0;
		const modelMsBeforeDecorations = profile?.modelMs ?? 0;
		const markdownModel = partialMarkdownTextModelForState(state, profile);
		const sourceMode = markdownSourceModeDeciderForState(state, markdownModel);

		for (const block of markdownModel.frontmatterBlocks) {
			if (!block.frontmatter || livePreviewBlockHidden(markdownModel, block.start)) continue;
			if (sourceMode.decisionForLine(block.start).active) continue;

			const startLine = state.doc.line(block.start);
			const blockEnd = state.doc.line(block.end);

			ranges.push(Decoration.replace({
				widget: new FrontmatterWidget(block.frontmatter, block.start),
				block: true
			}).range(startLine.from, blockEnd.to));
		}

		for (const block of markdownModel.fencedBlocks) {
			if (!isMermaidSourceBlock(block) || livePreviewBlockHidden(markdownModel, block.start)) continue;
			if (sourceMode.decisionForLine(block.start).active) continue;

			const startLine = state.doc.line(block.start);
			const blockEnd = state.doc.line(block.end);

			ranges.push(Decoration.replace({
				widget: new MarkdownMermaidWidget(
					markdownMermaidBlockSource(markdownModel, block),
					block.start,
					startLine.from,
					updateAnchorPositions
				),
				block: true
			}).range(startLine.from, blockEnd.to));
		}

		for (const block of markdownModel.tableBlocks) {
			if (!block.table || livePreviewBlockHidden(markdownModel, block.start)) continue;
			if (sourceMode.decisionForLine(block.start).active) continue;

			const startLine = state.doc.line(block.start);
			const blockEnd = state.doc.line(block.end);

			ranges.push(Decoration.replace({
				widget: new MarkdownTableWidget(block.table, block.start),
				block: true
			}).range(startLine.from, blockEnd.to));
		}

		for (const block of markdownModel.mathBlocks) {
			if (!block.math || livePreviewBlockHidden(markdownModel, block.start)) continue;
			if (sourceMode.decisionForLine(block.start).active) continue;

			const startLine = state.doc.line(block.start);
			const blockEnd = state.doc.line(block.end);
			const singleLine = block.start === block.end;

			ranges.push(Decoration.replace({
				widget: new MarkdownMathWidget(block.math.source, true, block.start, startLine.from),
				block: !singleLine
			}).range(startLine.from, blockEnd.to));
		}

		for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
			const line = state.doc.line(lineNumber);

			if (livePreviewBlockHidden(markdownModel, line.number)) continue;
			if (blockForLine(markdownModel.ignoredContainerBlocks, line.number)) continue;

			const imageLine = markdownImageOnly(line.text);

			if (imageLine) {
				if (!sourceMode.decisionForLine(line.number).active) {
					ranges.push(Decoration.replace({
						widget: new MarkdownImageWidget(
							imageLine,
							line.number,
							line.from,
							line.to,
							markdownImageWidgetOptions(),
							true
						),
						block: true
					}).range(line.from, line.to));
				}

				continue;
			}

			if (isHorizontalRuleLine(line.text) && !sourceMode.decisionForLine(line.number).active) {
				ranges.push(Decoration.replace({
					widget: new HorizontalRuleWidget(line.number),
					block: true
				}).range(line.from, line.to));
			}
		}

		const decorations = Decoration.set(ranges, true);

		if (profile) {
			profile.decorationRanges += ranges.length;
			profile.decorationsMs += performance.now()
				- decorationStart
				- (profile.parseMs - parseMsBeforeDecorations)
				- (profile.modelMs - modelMsBeforeDecorations);
		}

		return decorations;
	}

	function livePreviewBlockHidden(model: PartialMarkdownTextModel, lineNumber: number) {
		return model.headingModel.collapsedAncestorByLine.has(lineNumber)
			|| model.listModel.collapsedAncestorByLine.has(lineNumber);
	}

	function buildLivePreviewDecorations(
		view: EditorView,
		state: EditorState,
		activeThreads: ThreadView[],
		focusedThreadId: string,
		activeCommentAnchor: CommentSelectionAnchor | null,
		profile: TypingProfile | null = null
	) {
		const ranges: Range<Decoration>[] = [];
		const decorationStart = profile ? performance.now() : 0;
		const parseMsBeforeDecorations = profile?.parseMs ?? 0;
		const modelMsBeforeDecorations = profile?.modelMs ?? 0;
		const markdownModel = partialMarkdownTextModelForState(state, profile);
		const frontmatterBlocks = markdownModel.frontmatterBlocks;
		const fencedBlocks = markdownModel.fencedBlocks;
		const tableBlocks = markdownModel.tableBlocks;
		const mathBlocks = markdownModel.mathBlocks;
		const headingModel = markdownModel.headingModel;
		const orderedListMarkers = markdownModel.orderedListMarkers;
		const listModel = markdownModel.listModel;
		const sourceMode = markdownSourceModeDeciderForState(state, markdownModel);
		const activeHeadingControlLines = sourceMode.activeHeadingControlLines;
		const activeListControlLines = sourceMode.activeListControlLines;
		const selectionLineNumber = state.doc.lineAt(state.selection.main.head).number;
		const lineRanges = livePreviewLineRanges(view, markdownModel);

		for (const lineRange of lineRanges) {
			for (let lineNumber = lineRange.startLine; lineNumber <= lineRange.endLine; lineNumber += 1) {
				const line = state.doc.line(lineNumber);
				const text = line.text;
				const sourceDecision = sourceMode.decisionForLine(line.number);
				const activeBlock = sourceDecision.block;
				const active = sourceDecision.active;
				const activeClass = sourceDecision.sourceClass;
				const activeAttributes = sourceDecision.attributes;
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

				continue;
			}

			if (fencedBlock) {
				const boundary = line.number === fencedBlock.start || line.number === fencedBlock.end;
				const emptyCodeBlock = fencedBlock.end === fencedBlock.start + 1;
				const listContext = active ? null : markdownModel.listContainerInfo(fencedBlock.start);

				if (isMermaidSourceBlock(fencedBlock) && !active) continue;

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
				}

				continue;
			}

			if (isHorizontalRuleLine(text)) {
				if (active) {
					ranges.push(Decoration.line({
						class: activeClass,
						attributes: activeAttributes
					}).range(line.from));
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
						widget: new HeadingCollapseToggleWidget(
							headingCollapseKey,
							headingCollapsed,
							line.number,
							toggleMarkdownHeadingCollapse
						),
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
				const taskInfo = taskItem?.info ?? markdownListInfo(line.text);
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
						widget: new ListCollapseToggleWidget(
							taskCollapseKey,
							taskCollapsed,
							line.number,
							toggleMarkdownListCollapse
						),
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
				const itemInfo = item?.info ?? markdownListInfo(line.text);
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
						widget: new ListCollapseToggleWidget(
							itemCollapseKey,
							itemCollapsed,
							line.number,
							toggleMarkdownListCollapse
						),
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

			const indentedCode = active ? null : markdownModel.indentedCodeInfo(line.number);

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

			const listContinuation = active ? null : markdownModel.listContinuationInfo(line.number);

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
	}

		for (const thread of activeThreads) {
			const range = threadRangeInState(state, thread);

			if (!range || !rangeIntersectsLineRanges(state, range.from, range.to, lineRanges)) continue;

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

		if (activeCommentRange && rangeIntersectsLineRanges(state, activeCommentRange.from, activeCommentRange.to, lineRanges)) {
			ranges.push(Decoration.mark({
				class: 'annotation-mark composer-selection'
			}).range(activeCommentRange.from, activeCommentRange.to));
		}

		const decorations = Decoration.set(ranges, true);

		if (profile) {
			profile.decorationRanges += ranges.length;
			profile.decorationsMs += performance.now()
				- decorationStart
				- (profile.parseMs - parseMsBeforeDecorations)
				- (profile.modelMs - modelMsBeforeDecorations);
			profile.totalMs = performance.now() - profile.startedAt;
		}

		return decorations;
	}

	function livePreviewLineRanges(view: EditorView, model: PartialMarkdownTextModel): MarkdownLineRange[] {
		const visibleRanges = view.visibleRanges.length > 0
			? view.visibleRanges
			: [{ from: 0, to: view.state.doc.length }];
		const lineRanges: MarkdownLineRange[] = [];

		for (const range of visibleRanges) {
			const from = Math.min(range.from, view.state.doc.length);
			const to = Math.min(Math.max(range.from, range.to > range.from ? range.to - 1 : range.from), view.state.doc.length);
			const startLine = view.state.doc.lineAt(from).number;
			const endLine = view.state.doc.lineAt(to).number;

			lineRanges.push({
				startLine: Math.max(1, startLine - livePreviewViewportLineBuffer),
				endLine: Math.min(view.state.doc.lines, endLine + livePreviewViewportLineBuffer)
			});
		}

		for (const range of [...lineRanges]) {
			addIntersectingBlockLineRanges(lineRanges, range, [
				...model.frontmatterBlocks,
				...model.tableBlocks,
				...model.mathBlocks
			]);
		}

		return mergeMarkdownLineRanges(lineRanges);
	}

	function addIntersectingBlockLineRanges(
		lineRanges: MarkdownLineRange[],
		visibleRange: MarkdownLineRange,
		blocks: SourceBlock[]
	) {
		for (const block of blocks) {
			if (block.end < visibleRange.startLine || block.start > visibleRange.endLine) continue;

			lineRanges.push({ startLine: block.start, endLine: block.end });
		}
	}

	function mergeMarkdownLineRanges(lineRanges: MarkdownLineRange[]) {
		const sorted = [...lineRanges]
			.sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);
		const merged: MarkdownLineRange[] = [];

		for (const range of sorted) {
			const previous = merged[merged.length - 1];

			if (!previous || range.startLine > previous.endLine + 1) {
				merged.push({ ...range });

				continue;
			}

			previous.endLine = Math.max(previous.endLine, range.endLine);
		}

		return merged;
	}

	function rangeIntersectsLineRanges(
		state: EditorState,
		from: number,
		to: number,
		lineRanges: MarkdownLineRange[]
	) {
		const startLine = state.doc.lineAt(Math.min(from, state.doc.length)).number;
		const endPosition = Math.min(Math.max(from, to > from ? to - 1 : from), state.doc.length);
		const endLine = state.doc.lineAt(endPosition).number;

		return lineRanges.some((range) => endLine >= range.startLine && startLine <= range.endLine);
	}

	function partialMarkdownTextModelForState(state: EditorState, profile: TypingProfile | null = null) {
		const parsed = partialMarkdownParseForState(state, profile);
		const start = profile ? performance.now() : 0;

		if (
			partialMarkdownTextModelCache
			&& partialMarkdownTextModelCache.parsed === parsed
			&& partialMarkdownTextModelCache.collapsedHeadingKeys === collapsedHeadingKeys
			&& partialMarkdownTextModelCache.collapsedListItemKeys === collapsedListItemKeys
			&& partialMarkdownTextModelCache.documentSessionKey === documentSessionKey
		) {
			if (profile) {
				profile.modelCache = 'hit';
				profile.modelMs += performance.now() - start;
			}

			return partialMarkdownTextModelCache.model;
		}

		const model = new PartialMarkdownTextModel(parsed, {
			collapsedHeadingKeys,
			collapsedListItemKeys,
			documentSessionKey
		});

		partialMarkdownTextModelCache = {
			collapsedHeadingKeys,
			collapsedListItemKeys,
			documentSessionKey,
			model,
			parsed
		};

		if (profile) {
			profile.modelCache = 'miss';
			profile.modelMs += performance.now() - start;
		}

		return model;
	}

	function partialMarkdownParseForState(state: EditorState, profile: TypingProfile | null = null) {
		const cached = state.field(markdownParseField, false);

		if (cached) return cached;

		const start = profile ? performance.now() : 0;
		const parsed = parsePartialMarkdownTextCore(state.doc.toString());

		if (profile) profile.parseMs += performance.now() - start;

		return parsed;
	}

	function markdownSourceModeDeciderForState(
		state: EditorState,
		model = partialMarkdownTextModelForState(state)
	) {
		return new MarkdownSourceModeDecider(model, state.selection.ranges.map((range) => {
			const endPosition = range.empty ? range.head : Math.max(range.from, range.to - 1);

			return {
				startLine: state.doc.lineAt(range.from).number,
				endLine: state.doc.lineAt(endPosition).number
			};
		}));
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

	function markdownImageWidgetOptions() {
		return {
			resolveImageSrc: resolveMarkdownImageSrc,
			onGeometryChange: updateAnchorPositions
		};
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

	function isHorizontalRuleLine(text: string) {
		return (/^[ \t]{0,3}(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})$/).test(text);
	}

	function markdownCodeLanguage(info: string) {
		const language = markdownCodeFenceLanguage(info);

		if (!language) return null;

		return LanguageDescription.matchLanguageName(languages, language, true);
	}

	function preloadMarkdownCodeLanguages(view: EditorView) {
		for (const block of partialMarkdownTextModelForState(view.state).fencedBlocks) {
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
		const headingModel = partialMarkdownTextModelForState(state).headingModel;
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
		const listModel = partialMarkdownTextModelForState(state).listModel;
		const item = listModel.items.get(lineNumber);

		if (!item || item.blockEnd <= lineNumber) return null;

		const headLine = state.doc.lineAt(state.selection.main.head).number;

		if (headLine <= lineNumber || headLine > item.blockEnd) return null;

		const parentLine = state.doc.line(lineNumber);

		return { anchor: markdownListContentPosition(parentLine) };
	}

	function markdownListContentPosition(line: Line) {
		return line.from + markdownListContentOffset(line.text);
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
				widget: new MarkdownImageWidget(
					image,
					line.number,
					line.from + from,
					line.from + to,
					markdownImageWidgetOptions()
				),
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
		options: { value: string; threads: ThreadView[]; documentKey: string; cloudSync: SoseinCodeMirrorSync | null }
	) {
		let lastExternalValue = editorInitialValue(options);
		let lastDocumentKey = options.documentKey;
		let lastCloudSync = options.cloudSync;
		let applyingExternalValue = false;
		let view = createEditorView(options);

		return {
			update(next: typeof options) {
				if (next.cloudSync !== lastCloudSync) {
					destroyEditorView(view);
					view = createEditorView(next);
					lastExternalValue = editorInitialValue(next);
					lastDocumentKey = next.documentKey;
					lastCloudSync = next.cloudSync;

					return;
				}

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
				lastCloudSync = next.cloudSync;
			},

			destroy() {
				destroyEditorView(view);
			}
		};

		function createEditorView(next: typeof options) {
			const nextView = new EditorView({
				parent: node,
				state: EditorState.create({ doc: editorInitialValue(next), extensions: livePreviewExtensions(next.cloudSync) })
			});

			mainEditor = nextView;
			nextView.dispatch({ effects: setThreadsEffect.of(next.threads) });
			preloadMarkdownCodeLanguages(nextView);
			updateSelectionFromEditor(nextView);
			requestAnimationFrame(updateAnchorPositions);

			return nextView;
		}

		function destroyEditorView(editorView: EditorView) {
			if (mainEditor === editorView) mainEditor = null;

			editorView.destroy();
		}

		function editorInitialValue(next: typeof options) {
			return next.cloudSync ? next.cloudSync.ytext.toString() : next.value;
		}

		function livePreviewExtensions(cloudSync: SoseinCodeMirrorSync | null): Extension[] {
			return [
				history(),
				EditorState.tabSize.of(4),
				indentUnit.of('    '),
				markdown({ codeLanguages: markdownCodeLanguage }),
				markdownParseField,
				marginDropCursor,
				syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
				syntaxHighlighting(marginHighlightStyle),
				search({ top: true, createPanel: marginSearchPanel }),
				...(cloudSync ? [cloudSync.extension] : []),
				livePreviewField,
				livePreviewBlockDecorationField,
				livePreviewPlugin,
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
							openCommandPalette('files');

							return true;
						}
					},

					{
						key: 'Mod-Shift-p',
						run() {
							openCommandPalette('commands');

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

						if (soseinActiveDocument) {
							if (documentData) documentData = { ...documentData, markdown: editorMarkdown };
							baseMarkdown = editorMarkdown;
							saveState = soseinSyncStatus === 'error' || soseinSyncStatus === 'disconnected' ? 'conflict' : 'saved';
							saveMessage = soseinSyncStatusLabel(soseinSyncStatus);
						} else if (localFileMode && !applyingExternalValue) {
							refreshLocalSaveState(editorMarkdown);
							scheduleLocalAutosave();
						}

						if (soseinActiveDocument) {
							resetSuggestionDraftState(editorMarkdown);
						} else if (applyingExternalValue) {
							resetSuggestionDraftState(editorMarkdown);
						} else if (editMode === 'suggest') {
							draftChanges = composeDraftChanges(draftChanges, update);
							pendingEditThreads = draftMarkdownSuggestions(draftChanges, draftBaseMarkdown, editorMarkdown, persistedThreads, { author: commentAuthor, authorImageUrl: commentAuthorImageUrl, syncedKeys: syncedEditKeys });
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
						const threadId = threadAnchorFromEvent(event);

						if (threadId) selectThread(threadId);

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

						previewThread(threadId);
					},

					mouseleave(event, view) {
						updateFootnoteJumpArmed(view, false);

						clearThreadPreview();
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
		title.textContent = 'Find and Replace';

		titleDragHandle.append(title);
		titleBar.append(
			titleDragHandle,
			findPanelButton('compact', 'Compact', 'Show compact find', () => {
				setPanelMode('compact');

				return true;
			}, undefined, 'scaling-contract'),
			findPanelButton('close-expanded', 'Close', 'Close find and replace', () => closeSearchPanel(view), undefined, 'x')
		);
		titleBar.addEventListener('pointerdown', startFindPanelDrag);

		const topRow = document.createElement('div');
		topRow.className = 'margin-find-row find-primary';
		topRow.append(
			findPanelField(searchInput, 'Find'),
			findPanelButton('previous', 'Prev', 'Previous match', () => findPrevious(view), commandButtons, 'up'),
			findPanelButton('next', 'Next', 'Next match', () => findNext(view), commandButtons, 'down'),
			status,
			findPanelButton('more', 'More', 'Show more options', () => {
				setPanelMode('expanded', { resetPosition: true });

				return true;
			}, undefined, 'scaling'),
			findPanelButton('close-compact', 'Close', 'Close find and replace', () => closeSearchPanel(view), undefined, 'x')
		);

		const replaceRow = document.createElement('div');
		replaceRow.className = 'margin-find-row replace';
		replaceRow.append(
			findPanelField(replaceInput, 'Replace'),
			findPanelButton('replace', 'Replace', 'Replace current match', () => replaceNext(view), replaceButtons),
			findPanelButton('replaceAll', 'All', 'Replace all matches', () => replaceAll(view), replaceButtons)
		);

		const optionsRow = document.createElement('div');
		optionsRow.className = 'margin-find-row options';
		const optionsLabel = document.createElement('span');
		optionsLabel.className = 'margin-find-row-label';
		optionsLabel.textContent = 'Options';

		const optionsGroup = document.createElement('div');
		optionsGroup.className = 'margin-find-option-group';
		optionsGroup.append(
			findPanelOption('Case', caseInput),
			findPanelOption('Word', wordInput),
			findPanelOption('Regex', regexInput)
		);

		optionsRow.append(optionsLabel, optionsGroup);

		const findGroup = document.createElement('div');
		findGroup.className = 'margin-find-group';
		findGroup.append(topRow, replaceRow, optionsRow);

		dom.append(titleBar, findGroup);
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

	function findPanelField(input: HTMLInputElement, labelText: string) {
		const field = document.createElement('div');
		const label = document.createElement('span');

		field.className = 'margin-find-field';
		label.className = 'margin-find-field-label';
		label.textContent = labelText;
		field.append(label, input);

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
			x: ['M18 6 6 18', 'M6 6l12 12'],
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
		const nextAnnotationTops: Record<string, number> = {};
		const documentRect = documentSurface.getBoundingClientRect();

		if (mainEditor) {
			for (let lineNumber = 1; lineNumber <= mainEditor.state.doc.lines; lineNumber += 1) {
				const line = mainEditor.state.doc.line(lineNumber);

				nextLineTops[lineNumber] = editorBlockCenterTop(mainEditor, line.from, documentRect);
			}

			for (const thread of threads) {
				const range = threadRangeInState(mainEditor.state, thread);

				if (range) nextAnnotationTops[thread.id] = editorAnchorCenterTop(mainEditor, range.from, documentRect);
			}
		}

		lineTops = nextLineTops;
		annotationTops = nextAnnotationTops;
		documentViewport = documentViewportForRect(documentRect);
		documentHeight = Math.max(documentSurface.offsetHeight, mainEditor?.dom.offsetHeight ?? 0);
	}

	function scheduleAnchorPositionUpdate() {
		if (anchorPositionFrame !== null) return;

		anchorPositionFrame = requestAnimationFrame(() => {
			anchorPositionFrame = null;
			updateAnchorPositions();
		});
	}

	function clearAnchorPositionFrame() {
		if (anchorPositionFrame === null) return;

		cancelAnimationFrame(anchorPositionFrame);
		anchorPositionFrame = null;
	}

	function documentViewportForRect(documentRect: DOMRect): DocumentViewport {
		return {
			top: -documentRect.top - marginViewportPadding,
			bottom: window.innerHeight - documentRect.top + marginViewportPadding
		};
	}

	function editorBlockCenterTop(view: EditorView, position: number, documentRect: DOMRect) {
		const block = view.lineBlockAt(position);
		const documentTop = view.documentTop - documentRect.top;

		return Math.max(0, documentTop + block.top + block.height / 2);
	}

	function editorAnchorCenterTop(view: EditorView, position: number, documentRect: DOMRect) {
		const coords = view.coordsForChar(position) ?? view.coordsAtPos(position, 1);

		if (coords && coords.bottom >= 0 && coords.top <= window.innerHeight) {
			return Math.max(0, coords.top - documentRect.top + (coords.bottom - coords.top) / 2);
		}

		return editorBlockCenterTop(view, position, documentRect);
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
		const markdownModel = partialMarkdownTextModelForState(state);

		for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
			if (isMarkdownImageOnlyLine(state, lineNumber)) {
				imageBlocks.push({ start: lineNumber, end: lineNumber, kind: 'line' });
			}
		}

		return [
			...imageBlocks,
			...markdownModel.mathBlocks,
			...markdownModel.fencedBlocks.filter(isMermaidSourceBlock)
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
		const currentIndentWidth = markdownIndentWidth(indent);

		if (currentIndentWidth <= 0) return '';

		let targetIndentWidth = emptyListOutdentTargetWidth(state, lineNumber, currentIndentWidth);

		if (targetIndentWidth >= currentIndentWidth) {
			targetIndentWidth = Math.max(0, currentIndentWidth - 2);
		}

		return `${indentStringForWidth(indent, targetIndentWidth)}${marker}${spacing}${taskMarker}`;
	}

	function outdentedBlankListContinuationIndent(state: EditorState, lineNumber: number, text: string) {
		const currentIndentWidth = leadingMarkdownIndent(text);

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
		return partialMarkdownTextModelForState(state).listModel;
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
		measuredHeights: Record<string, number>,
		viewport: DocumentViewport
	): MarginItem[] {
		const rawItems: Array<Omit<MarginItem, 'top'>> = items.flatMap((thread) => {
			const anchorTop = annotationAnchors[thread.id] ?? anchorTops[anchorLineForThread(thread)];

			if (anchorTop == null || !anchorIsNearViewport(anchorTop, viewport)) return [];

			return [{
				type: 'thread' as const,
				id: thread.id,
				anchorTop,
				height: measuredHeights[thread.id] ?? estimateThreadHeight(thread),
				connectorKind: thread.kind,
				thread
			}];
		});

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

	function anchorIsNearViewport(anchorTop: number, viewport: DocumentViewport) {
		return anchorTop >= viewport.top && anchorTop <= viewport.bottom;
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

	function connectorSourceRadius(item: MarginItem, focused = false) {
		return focused || item.type === 'composer' ? 2.2 : 1.8;
	}

	function connectorStrokeWidth(item: MarginItem, focused = false) {
		if (focused) return 1;
		if (item.type === 'composer') return 0.62;

		return 0.92;
	}

	function connectorCoordinate(value: number) {
		return Number(value.toFixed(2));
	}

	function connectorPath(item: MarginItem, focused = false) {
		const anchorY = Math.max(12, item.anchorTop);
		const cardY = item.top + 24;
		const sourceX = connectorCoordinate(connectorSourceRadius(item, focused) + connectorStrokeWidth(item, focused) / 2);
		const connectorEndX = focused ? 35.6 : 37.6;

		return `M ${sourceX} ${anchorY} C ${connectorCoordinate(sourceX + 12)} ${anchorY}, 14 ${cardY}, ${connectorEndX} ${cardY}`;
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

	function selectThread(threadId: string) {
		if (!threadId) return;

		selectedThreadId = threadId;
		hoveredThreadId = '';
	}

	function previewThread(threadId: string) {
		if (selectedThreadId) return;
		if (hoveredThreadId !== threadId) hoveredThreadId = threadId;
	}

	function clearThreadPreview() {
		if (hoveredThreadId) hoveredThreadId = '';
	}

	function clearThreadFocus() {
		selectedThreadId = '';
		hoveredThreadId = '';
	}

	function setThreadResolving(threadId: string, resolving: boolean) {
		const nextThreadIds = new Set(resolvingThreadIds);

		if (resolving) {
			nextThreadIds.add(threadId);
		} else {
			nextThreadIds.delete(threadId);
		}

		resolvingThreadIds = nextThreadIds;
	}

	function threadIsResolving(threadId: string) {
		return resolvingThreadIds.has(threadId);
	}

	function waitForCommentResolveAnimation(): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, commentResolveAnimationMs));
	}

	function handleGlobalPointerDown(event: PointerEvent) {
		const target = event.target;

		if (!(target instanceof Element)) return;
		if (target.closest('.margin-rail, [data-thread-anchor]')) return;

		clearThreadFocus();
	}

	function startEditingComment(thread: ThreadView) {
		if (thread.kind !== 'comment') return;

		clearSelection();
		selectThread(thread.id);
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
		const bridge = await registerNativeDesktopBridge(window as TauriWindow, {
			createNewDocument,
			handleNativeOpenUrls,
			handleNativeDocumentChanged,
			openCommandPaletteCommands: () => openCommandPalette('commands'),
			openCommandPaletteFiles: () => openCommandPalette('files'),
			openLocalMarkdown,
			openLocalFolder,
			openRecentDocument,
			clearRecentDocuments,
			saveLocalMarkdown: () => saveLocalMarkdown(),
			saveLocalMarkdownAs,
			requestPrintDocument,
			openWordCountDialog,
			closeActiveDocumentTab,
			activatePreviousTab: () => activateAdjacentDocumentTab(-1),
			activateNextTab: () => activateAdjacentDocumentTab(1),
			openSettingsDialog,
			checkForDesktopUpdate: () => {
				openSettingsDialog();
				return checkForDesktopUpdate(true);
			},
			openFindPanel: () => openFindPanel(),
			openFindAndReplacePanel: () => openFindAndReplacePanel(),
			findNextInEditor,
			findPreviousInEditor,
			toggleFileTreePanel,
			insertMarkdownBlock: (kind) => {
				insertMarkdownBlock(kind);
			},
			openCommentComposerForSelection: () => {
				openCommentComposerForSelection();
			},
			handleNativeDragDrop,
			isInsertBlockKind
		});

		nativeDesktopBridgeCleanup = bridge.cleanup;
		nativeMenuBridgeReady = bridge.menuReady;
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
		return desktopShell && !nativeMenuBridgeReady && document.hasFocus();
	}

	async function openCommandPalette(mode: CommandPaletteMode) {
		closeFindPanel();
		printOptionsDialogOpen = false;
		if (soseinDialogOpen) closeSoseinDialog();
		if (settingsDialogOpen) {
			closeSettingsDialog();
			if (settingsDialogOpen) return;
		}

		commandPaletteRequestId += 1;
		commandPaletteOpenRequest = { id: commandPaletteRequestId, mode };
	}

	function commandPaletteCommandEntries(): CommandPaletteEntry[] {
		return buildCommandPaletteCommandEntries({
			desktopShell,
			workspaceKind: workspaceModeKind,
			workspaceNavigatorLabel,
			soseinCloudVisible,
			soseinSessionEmail: soseinSession?.user.email ?? '',
			soseinActiveDocument: Boolean(soseinActiveDocument),
			editMode,
			documentData: Boolean(documentData),
			documentTabsLength: documentTabs.length,
			fileTreePanelOpen,
			selectedQuote,
			createNewDocument,
			openLocalMarkdown,
			openLocalFolder,
			openQuickOpen: () => openCommandPalette('files'),
			openSettingsDialog,
			saveLocalMarkdown: () => saveLocalMarkdown(),
			saveLocalMarkdownAs,
			requestPrintDocument,
			closeActiveDocumentTab,
			activatePreviousTab: () => activateAdjacentDocumentTab(-1),
			activateNextTab: () => activateAdjacentDocumentTab(1),
			toggleFileTreePanel,
			openFindPanel: () => openFindPanel(),
			openFindAndReplacePanel: () => openFindAndReplacePanel(),
			setEditingMode,
			openCommentComposerForSelection: () => {
				openCommentComposerForSelection();
			},
			insertMarkdownBlock: (kind) => {
				insertMarkdownBlock(kind);
			},
			openSoseinDialog,
			openSoseinWorkspace,
			checkForDesktopUpdate: () => {
				openSettingsDialog();
				return checkForDesktopUpdate(true);
			}
		});
	}

	function quickOpenPaletteEntries(): CommandPaletteEntry[] {
		return buildQuickOpenPaletteEntries({
			workspaceKind: workspaceModeKind,
			visibleDocumentTabs,
			activeDocumentTabId,
			fileTreeRoot,
			recentDocuments,
			soseinDocuments,
			activateDocumentTab,
			openNativeMarkdownPath,
			openSoseinDocument,
			openLocalFolder,
			openLocalMarkdown,
			openSoseinWorkspace
		});
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
		wordCountDialogOpen = false;
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
			appSettings = { theme: 'auto', localUserName: defaultLocalUserName(), soseinCloudEnabled: false };
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
			localUserName: normalizeLocalUserName(settings?.localUserName, defaultLocalUserName()),
			soseinCloudEnabled: settings?.soseinCloudEnabled === true
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

		resetMermaidTheme();
		mainEditor?.dispatch({ effects: refreshLivePreviewEffect.of() });
	}

	function clearUpdateAutoCheckTimer() {
		if (!updateAutoCheckTimer) return;

		clearTimeout(updateAutoCheckTimer);
		updateAutoCheckTimer = null;
	}

	function openSettingsDialog() {
		closeFindPanel();
		printOptionsDialogOpen = false;
		wordCountDialogOpen = false;
		if (soseinDialogOpen) closeSoseinDialog();
		settingsDraftTheme = appSettings.theme;
		settingsDraftLocalUserName = appSettings.localUserName;
		settingsError = '';
		settingsDialogOpen = true;
	}

	function closeSettingsDialog() {
		settingsDialogOpen = false;
		settingsDraftTheme = appSettings.theme;
		settingsDraftLocalUserName = appSettings.localUserName;
		settingsError = '';
	}

	async function initializeSoseinCloudVisibility() {
		try {
			if (!desktopShell) {
				soseinCloudVisible = false;

				return;
			}

			soseinCloudVisible = Boolean(await tauriInvoke<boolean>('sosein_cloud_enabled'));
		} catch(err) {
			console.warn('Unable to read Sosein Cloud visibility', err);

			soseinCloudVisible = false;
		}
	}

	function initializeSoseinCloudState(searchParams: URLSearchParams) {
		const handoffEnvironment = soseinEnvironmentFromSearchParams(searchParams);

		if (handoffEnvironment) {
			soseinCloudEnvironment = handoffEnvironment;
			soseinCloudServerUrl = soseinServerUrlForEnvironment(handoffEnvironment);
		}

		soseinSession = readSoseinSession();

		if (searchParams.has('handoff_code')) {
			const serverUrl = soseinServerUrlForEnvironment(handoffEnvironment ?? soseinCloudEnvironment);

			void exchangeSoseinOidcHandoff(searchParams.get('handoff_code') || '', serverUrl);
		} else if (soseinSession) {
			soseinCloudEnvironment = soseinEnvironmentForServerUrl(soseinSession.serverUrl);
			soseinCloudServerUrl = soseinSession.serverUrl;
			void validateStoredSoseinSession();
			if (workspaceMode.kind === 'sosein') void refreshSoseinDocuments();
		}
	}

	function openSoseinDialog() {
		closeFindPanel();
		printOptionsDialogOpen = false;
		wordCountDialogOpen = false;
		if (settingsDialogOpen) closeSettingsDialog();

		soseinCloudError = '';
		soseinDialogOpen = true;

		if (soseinSession) void refreshSoseinDocuments();
	}

	function closeSoseinDialog() {
		soseinDialogOpen = false;
		soseinCloudError = '';
	}

	async function openSoseinWorkspace() {
		closeSoseinDialog();

		if (desktopShell && workspaceMode.kind !== 'sosein') {
			const request = tauriInvoke<void>('open_sosein_workspace_window');

			if (request) {
				try {
					await request;

					return;
				} catch(err) {
					handleSoseinCloudError(err, 'Unable to open Sosein Cloud workspace');
				}
			}
		}

		enterSoseinWorkspaceMode();
	}

	async function exchangeSoseinOidcHandoff(handoffCode: string, serverUrl = soseinCloudServerUrl) {
		if (!handoffCode) return;

		soseinAuthLoading = true;
		soseinCloudError = '';

		try {
			await finishSoseinOidcLogin(await soseinCloudClient(undefined, serverUrl).exchangeOidcHandoff(handoffCode), serverUrl);
			removeSoseinHandoffCodeFromUrl();
		} catch(err) {
			handleSoseinCloudError(err, 'Unable to finish Sosein Cloud login');
		} finally {
			soseinAuthLoading = false;
		}
	}

	async function startSoseinOidcLogin() {
		soseinCloudError = '';
		const serverUrl = soseinCloudServerUrl;

		if (desktopShell) {
			soseinAuthLoading = true;

			try {
				const authSession = await tauriInvoke<SoseinAuthSession>('start_sosein_oidc_login', { serverUrl });

				if (!authSession) {
					throw new Error('Desktop Sosein Cloud login is unavailable in this Margin build.');
				}

				await finishSoseinOidcLogin(authSession, serverUrl);
			} catch(err) {
				handleSoseinCloudError(err, 'Unable to start Sosein Cloud login');
			} finally {
				soseinAuthLoading = false;
			}

			return;
		}

		if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') {
			soseinCloudError = 'Sosein Cloud login needs an HTTP return URL in this build.';

			return;
		}

		window.location.href = soseinCloudClient(undefined, serverUrl).oidcLoginUrl(soseinOidcReturnUrl());
	}

	async function finishSoseinOidcLogin(authSession: SoseinAuthSession, serverUrl = soseinCloudServerUrl) {
		const session = storedSessionFromAuth(serverUrl, authSession);

		soseinCloudEnvironment = soseinEnvironmentForServerUrl(session.serverUrl);
		soseinCloudServerUrl = session.serverUrl;
		soseinSession = session;
		writeSoseinSession(session);
		soseinDialogOpen = true;
		await validateStoredSoseinSession({ updateWorkspaceMode: false });
		if (!soseinSession) return;
		if (workspaceMode.kind === 'sosein') enterSoseinWorkspaceMode(soseinSession);
		await refreshSoseinDocuments();
	}

	function removeSoseinHandoffCodeFromUrl() {
		const url = new URL(window.location.href);

		url.searchParams.delete('handoff_code');
		url.searchParams.delete('sosein_cloud_environment');
		window.history.replaceState({}, '', url.toString());
	}

	function soseinOidcReturnUrl() {
		const url = new URL(window.location.href);

		url.searchParams.delete('handoff_code');
		url.searchParams.set('sosein_cloud_environment', soseinCloudEnvironment);

		return url.toString();
	}

	async function validateStoredSoseinSession(options: { updateWorkspaceMode?: boolean } = {}) {
		if (!soseinSession) return;

		try {
			const validation = await soseinClientForSession().validateSession();
			soseinSession = {
				...soseinSession,
				user: mergedStoredUserFromSoseinUser(soseinSession.user, validation.user),
				expiresAt: validation.expires_at
			};
			writeSoseinSession(soseinSession);
			if (options.updateWorkspaceMode !== false && workspaceMode.kind === 'sosein') {
				enterSoseinWorkspaceMode(soseinSession);
			}
		} catch(err) {
			if (isSoseinUnauthorized(err)) disconnectSoseinSession();
		}
	}

	async function refreshSoseinDocuments() {
		if (!soseinSession) return;

		soseinDocumentsLoading = true;
		soseinCloudError = '';

		try {
			soseinDocuments = (await soseinClientForSession().listDocuments()).documents;
		} catch(err) {
			if (isSoseinUnauthorized(err)) {
				disconnectSoseinSession();
			} else if (isSoseinNotFound(err)) {
				soseinDocuments = [];
				soseinCloudError = 'Sosein Cloud account setup is incomplete. Disconnect and connect again to finish workspace setup.';
			} else {
				handleSoseinCloudError(err, 'Unable to list Sosein Cloud documents');
			}
		} finally {
			soseinDocumentsLoading = false;
		}
	}

	async function createSoseinDocument() {
		if (!soseinSession) return;

		soseinDocumentOpening = true;
		soseinCloudError = '';

		try {
			const document = await soseinClientForSession().createDocument(normalizeSoseinDocumentTitle(soseinNewDocumentTitle));

			soseinNewDocumentTitle = 'Untitled';
			await refreshSoseinDocuments();
			await openSoseinDocument(document);
		} catch(err) {
			if (isSoseinUnauthorized(err)) disconnectSoseinSession();
			handleSoseinCloudError(err, 'Unable to create Sosein Cloud document');
		} finally {
			soseinDocumentOpening = false;
		}
	}

	async function openSoseinDocument(document: SoseinDocumentSummary | SoseinDocument) {
		if (!soseinSession) return;

		const session = soseinSession;

		soseinDocumentOpening = true;
		soseinCloudError = '';

		try {
			syncActiveDocumentTab();

			const existingTab = findExistingSoseinDocumentTab(documentTabs, session.serverUrl, document.id);

			if (existingTab) {
				closeSoseinDialog();
				await applyDocumentTab(existingTab);

				return;
			}

			const client = soseinClientForSession();
			const fullDocument = 'latest_snapshot' in document
				? document
				: await client.getDocument(document.id);
			const nextState = createSoseinDocumentState({
				serverUrl: session.serverUrl,
				document: fullDocument,
				fileName: soseinDocumentFileName(fullDocument.title),
				syncStatus: 'connecting',
				syncStatusLabel: soseinSyncStatusLabel
			});

			destroySoseinEditorSync();
			clearLocalAutosaveTimer();
			closeSoseinDialog();
			enterSoseinWorkspaceMode(session);

			soseinActiveDocument = nextState.soseinDocument;
			soseinSyncStatus = 'connecting';
			localFileMode = false;
			localFileHandle = null;
			localFileName = '';
			localMetadataDirty = false;
			nativeFilePath = '';
			lastPersistedSerializedMarkdown = '';
			externalChange = null;
			saveState = 'saved';
			saveMessage = nextState.saveMessage;
			documentSessionKey = nextState.documentSessionKey;
			activeDocumentTabId = nextState.documentSessionKey;
			documentData = nextState.documentData;
			annotations = null;
			editMode = 'edit';
			resetDraftState('');
			clearSelection();
			syncActiveDocumentTab();
			await connectSoseinEditorSyncForActiveDocument();
			await tick();
			updateAnchorPositions();
		} catch(err) {
			if (isSoseinUnauthorized(err)) disconnectSoseinSession();
			handleSoseinCloudError(err, 'Unable to open Sosein Cloud document');
		} finally {
			soseinDocumentOpening = false;
		}
	}

	async function connectSoseinEditorSyncForActiveDocument() {
		if (!soseinSession || !soseinActiveDocument) return;

		const run = ++soseinSyncRun;
		const activeDocument = soseinActiveDocument;
		const client = soseinClientForSession();

		try {
			const { createSoseinCodeMirrorSync } = await import('./lib/features/sosein-cloud/sosein-codemirror-sync');
			const sync = await createSoseinCodeMirrorSync({
				serverUrl: activeDocument.serverUrl,
				documentId: activeDocument.id,
				userName: soseinStoredUserDisplayName(soseinSession.user),
				userImage: soseinSession.user.profilePictureUrl,
				issueSyncTicket: async () => {
					const response = await client.issueSyncTicket(activeDocument.id);

					return response.ticket;
				},
				onStatus: updateSoseinSyncStatus,
				onError: handleSoseinSyncError
			});

			if (run !== soseinSyncRun || soseinActiveDocument?.id !== activeDocument.id) {
				sync.destroy();

				return;
			}

			soseinEditorSync = sync;
		} catch(err) {
			if (isSoseinUnauthorized(err)) disconnectSoseinSession();
			handleSoseinCloudError(err, 'Unable to start Sosein Cloud sync');
			updateSoseinSyncStatus('error');
		}
	}

	function handleSoseinSyncError(err: unknown) {
		if (isSoseinUnauthorized(err)) disconnectSoseinSession();

		handleSoseinCloudError(err, 'Sosein Cloud sync failed');
	}

	function destroySoseinEditorSync() {
		soseinSyncRun += 1;
		soseinEditorSync?.destroy();
		soseinEditorSync = null;
	}

	function clearSoseinActiveDocument() {
		destroySoseinEditorSync();
		soseinActiveDocument = null;
		soseinSyncStatus = 'disconnected';
	}

	function disconnectSoseinSession() {
		clearSoseinActiveDocument();
		soseinSession = null;
		soseinDocuments = [];
		clearSoseinSession();
	}

	function soseinClientForSession() {
		if (!soseinSession) throw new Error('No Sosein Cloud session is available');

		return soseinCloudClient(soseinSession.sessionToken, soseinSession.serverUrl);
	}

	function soseinCloudClient(sessionToken?: string, serverUrl = soseinCloudServerUrl) {
		return new SoseinCloudClient(
			serverUrl,
			sessionToken,
			desktopShell ? nativeSoseinCloudTransport : undefined
		);
	}

	async function nativeSoseinCloudTransport<T>(request: SoseinCloudRequest): Promise<T> {
		const response = await tauriInvoke<NativeSoseinApiResponse>('sosein_api_request', {
			serverUrl: request.baseUrl,
			method: request.method,
			path: request.path,
			sessionToken: request.sessionToken ?? request.bootstrapToken ?? null,
			body: request.body ?? null
		});

		if (!response) {
			throw new Error('Desktop Sosein Cloud API bridge is unavailable.');
		}

		if (response.status < 200 || response.status >= 300) {
			throw new SoseinCloudApiError(response.status, response.bodyText);
		}

		return response.body as T;
	}

	function updateSoseinSyncStatus(status: SoseinSyncStatus) {
		soseinSyncStatus = status;

		if (soseinActiveDocument) {
			saveState = status === 'error' || status === 'disconnected' ? 'conflict' : 'saved';
			saveMessage = soseinSyncStatusLabel(status);
		}
	}

	function soseinSyncStatusLabel(status: SoseinSyncStatus) {
		if (status === 'synced' || status === 'connected') return 'Cloud synced';
		if (status === 'syncing') return 'Syncing...';
		if (status === 'ticket' || status === 'connecting') return 'Connecting...';
		if (status === 'disconnected') return 'Cloud disconnected';

		return 'Cloud sync failed';
	}

	function documentLocationLabelFor(
		activeDocument: SoseinActiveDocument | null,
		session: SoseinStoredSession | null,
		status: SoseinSyncStatus,
		filePath: string
	) {
		if (!activeDocument) return filePath ? compactLocalPath(directoryPath(filePath)) : '';

		const statusLabel = soseinSyncStatusLabel(status);

		if (!session) return `Sosein Cloud / ${statusLabel}`;

		return `${soseinStoredUserDisplayName(session.user)} / ${statusLabel}`;
	}

	function handleSoseinCloudError(err: unknown, fallback: string) {
		console.warn(fallback, err);

		if (err instanceof SoseinCloudApiError) {
			soseinCloudError = `${fallback}: ${err.status}`;

			return;
		}

		soseinCloudError = err instanceof Error ? err.message : fallback;
	}

	function isSoseinUnauthorized(err: unknown) {
		return err instanceof SoseinCloudApiError && err.status === 401;
	}

	function isSoseinNotFound(err: unknown) {
		return err instanceof SoseinCloudApiError && err.status === 404;
	}

	function openWordCountDialog() {
		if (!documentData && !mainEditor) return;

		closeFindPanel();
		printOptionsDialogOpen = false;
		if (settingsDialogOpen) closeSettingsDialog();
		if (settingsDialogOpen) return;

		wordCountStats = buildWordCountStats(
			activeEditorMarkdown(),
			activeEditorSelectionMarkdown(),
			annotations,
			pendingEditThreads
		);
		wordCountDialogOpen = true;
	}

	function closeWordCountDialog() {
		wordCountDialogOpen = false;
	}

	function activeEditorSelectionMarkdown() {
		if (!mainEditor) return '';

		const selection = mainEditor.state.selection.main;

		return selection.empty ? '' : mainEditor.state.sliceDoc(selection.from, selection.to);
	}

	function buildWordCountStats(
		markdown: string,
		selectionMarkdown: string,
		currentAnnotations: LocalAnnotations | null,
		pendingThreads: ThreadView[]
	): WordCountStats {
		const trimmedSelection = selectionMarkdown.trim();

		return {
			document: textMetrics(markdown),
			selection: trimmedSelection ? textMetrics(selectionMarkdown) : null,
			review: reviewCountStats(currentAnnotations, pendingThreads),
			tasks: taskCountStats(markdown)
		};
	}

	function emptyWordCountStats(): WordCountStats {
		return {
			document: textMetrics(''),
			selection: null,
			review: { open: 0, closed: 0 },
			tasks: { open: 0, total: 0 }
		};
	}

	function textMetrics(markdown: string): WordCountMetrics {
		return {
			words: markdown.match(/[\p{L}\p{N}]+(?:['’._-][\p{L}\p{N}]+)*/gu)?.length ?? 0,
			characters: Array.from(markdown).length,
			lines: markdown.length === 0 ? 0 : markdown.split(/\r\n|\r|\n/).length
		};
	}

	function reviewCountStats(currentAnnotations: LocalAnnotations | null, pendingThreads: ThreadView[]): ReviewCountStats {
		const comments = currentAnnotations?.comments ?? [];
		const suggestions = currentAnnotations?.suggestions ?? [];
		const open = comments.filter((comment) => !comment.resolved).length
			+ suggestions.filter((suggestion) => !suggestion.resolved).length
			+ pendingThreads.filter((thread) => !thread.resolved).length;
		const closed = comments.filter((comment) => comment.resolved).length
			+ suggestions.filter((suggestion) => suggestion.resolved).length
			+ pendingThreads.filter((thread) => thread.resolved).length;

		return { open, closed };
	}

	function taskCountStats(markdown: string): TaskCountStats {
		let open = 0;
		let total = 0;

		for (const line of markdown.split(/\r\n|\r|\n/)) {
			const task = (/^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+/).exec(line);

			if (!task) continue;

			total += 1;
			if (task[1] === ' ') open += 1;
		}

		return { open, total };
	}

	function formatCount(count: number) {
		return count.toLocaleString();
	}

	function formatReadingTime(words: number) {
		if (words === 0) return '0 min';
		if (words < 225) return '< 1 min';

		const minutes = Math.ceil(words / 225);
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;

		if (hours === 0) return `${formatCount(minutes)} min`;

		const hourLabel = hours === 1 ? 'hr' : 'hrs';
		if (remainingMinutes === 0) return `${formatCount(hours)} ${hourLabel}`;

		return `${formatCount(hours)} ${hourLabel} ${remainingMinutes} min`;
	}

	function formatReviewProgress(stats: ReviewCountStats) {
		return `${formatCount(stats.open)} open / ${formatCount(stats.closed)} closed`;
	}

	function formatTaskProgress(stats: TaskCountStats) {
		const taskLabel = stats.total === 1 ? 'task' : 'tasks';

		return `${formatCount(stats.open)} open / ${formatCount(stats.total)} ${taskLabel}`;
	}

	function updateSettingsTheme(theme: ThemeSetting) {
		if (theme === settingsDraftTheme) return;

		settingsDraftTheme = theme;
		applyTheme(theme);
		void saveSettingsDraft();
	}

	function updateSettingsLocalUserName(value: string) {
		settingsDraftLocalUserName = value;
		void saveSettingsDraft();
	}

	async function saveSettingsDraft() {
		settingsSaveQueued = true;
		if (settingsSaving) return;

		settingsSaving = true;

		try {
			while (settingsSaveQueued) {
				settingsSaveQueued = false;
				settingsError = '';

				const nextSettings: AppSettings = {
					theme: settingsDraftTheme,
					localUserName: settingsDraftLocalUserName.trim(),
					soseinCloudEnabled: appSettings.soseinCloudEnabled
				};

				const request = desktopShell
					? tauriInvoke<AppSettings>('write_settings', { settings: nextSettings })
					: null;

				const savedSettings = request ? await request : nextSettings;

				appSettings = normalizeSettings(savedSettings);

				if (!request) localStorage.setItem(settingsStorageKey, JSON.stringify(appSettings));

				applyTheme(appSettings.theme);
			}
		} catch(err) {
			settingsError = err instanceof Error ? err.message : 'Unable to save settings';
		} finally {
			settingsSaving = false;
			if (settingsSaveQueued) void saveSettingsDraft();
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
		if (workspaceMode.kind === 'sosein') return false;

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
		const browserRecentDocuments = readBrowserRecentDocuments(recentDocumentsStorageKey);

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

	function persistRecentDocuments(nextRecentDocuments: RecentDocument[]) {
		recentDocuments = normalizeRecentDocuments(nextRecentDocuments);
		writeBrowserRecentDocuments(recentDocumentsStorageKey, recentDocuments);
		void syncRecentDocumentsMenu();
	}

	function addRecentDocument(document: NativeMarkdownDocument) {
		persistRecentDocuments(addRecentDocumentEntry(recentDocuments, document));
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
				writeBrowserRecentDocuments(recentDocumentsStorageKey, recentDocuments);
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
		enterLocalWorkspaceMode(directory.path);
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
				persistRecentDocuments(removeRecentDocumentEntry(recentDocuments, path));
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

	async function openFileTreeEntry(entry: NativeDirectoryEntry) {
		if (entry.kind !== 'markdown') return;

		await openNativeMarkdownPath(entry.path);
	}

	function toggleFileTreePanel() {
		fileTreePanelOpen = !fileTreePanelOpen;
	}

	function createNewDocument() {
		if (workspaceMode.kind === 'sosein') {
			void createSoseinDocument();

			return;
		}

		syncActiveDocumentTab();
		createUntitledMarkdownDocument();
	}

	function applyLocalDocumentSessionState(
		sessionState: ReturnType<typeof createUntitledLocalDocumentSession>,
		options: { fileName: string; resetEditor: boolean; clearCloud?: boolean } = {
			fileName: sessionState.localFileName,
			resetEditor: true,
			clearCloud: true
		}
	) {
		if (options.clearCloud ?? true) {
			clearSoseinActiveDocument();
		}

		localFileMode = sessionState.localFileMode;
		localFileHandle = sessionState.localFileHandle;
		localFileName = sessionState.localFileName;
		localMetadataDirty = sessionState.localMetadataDirty;
		nativeFilePath = sessionState.nativeFilePath;
		lastPersistedSerializedMarkdown = sessionState.lastPersistedSerializedMarkdown;
		externalChange = sessionState.externalChange;
		saveState = sessionState.saveState;
		saveMessage = sessionState.saveMessage;
		documentSessionKey = sessionState.documentSessionKey;
		activeDocumentTabId = sessionState.documentSessionKey;
		documentData = sessionState.documentData;
		annotations = localAnnotationsFromEmbeddedBlock(options.fileName, sessionState.embeddedComments);

		if (options.resetEditor) {
			resetDraftState(sessionState.editorMarkdown);
			clearSelection();
		}
	}

	function createUntitledMarkdownDocument(options: { replaceActive?: boolean } = {}) {
		enterLocalWorkspaceMode();
		syncActiveDocumentTab();
		const fileName = nextUntitledFileName(documentTabs);
		const sessionState = createUntitledLocalDocumentSession(fileName, `local:untitled:${Date.now()}`);

		clearLocalAutosaveTimer();

		if (!options.replaceActive) syncActiveDocumentTab();

		applyLocalDocumentSessionState(sessionState, { fileName, resetEditor: true, clearCloud: true });
		annotations = emptyLocalAnnotations(fileName);

		if (options.replaceActive) documentTabs = [];

		syncActiveDocumentTab();
		requestAnimationFrame(updateAnchorPositions);
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
		enterLocalWorkspaceMode(directoryPath(nativeDocument.path));
		syncActiveDocumentTab();

		const existingTab = documentTabs.find((tab) => tab.nativeFilePath === nativeDocument.path);

		if (existingTab) {
			addRecentDocument(nativeDocument);
			await applyDocumentTab(existingTab);

			return;
		}

		documentSessionKey = `local:${nativeDocument.path}`;
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

		const nextDocumentSessionKey = options.forceEditorReload
			? `${activeDocumentTabId || documentSessionKey}:reload:${Date.now()}`
			: documentSessionKey;
		const sessionState = createNativeLocalDocumentSession({
			nativeDocument,
			fileName,
			splitDocument,
			message,
			documentSessionKey: nextDocumentSessionKey
		});

		applyLocalDocumentSessionState(sessionState, { fileName, resetEditor: true, clearCloud: true });
	}

	async function loadLocalMarkdownFile(file: File, handle: MarkdownFileHandle | null) {
		enterLocalWorkspaceMode();
		const serializedMarkdown = await file.text();
		const splitDocument = splitMarginCommentBlock(serializedMarkdown);
		const fileName = handle?.name || file.name || 'Untitled.md';
		const sessionState = createBrowserLocalDocumentSession({
			serializedMarkdown,
			splitDocument,
			fileName,
			handle,
			documentSessionKey: `local:${Date.now()}:${fileName}`
		});

		clearLocalAutosaveTimer();
		syncActiveDocumentTab();
		applyLocalDocumentSessionState(sessionState, { fileName, resetEditor: true, clearCloud: true });
		syncActiveDocumentTab();
		await tick();
		updateAnchorPositions();
	}

	function hasWritableLocalSaveTarget() {
		return computeHasWritableLocalSaveTarget({
			localFileMode,
			desktopShell,
			nativeFilePath,
			localFileHandle
		});
	}

	function shouldAutosaveLocalDocument() {
		return computeShouldAutosaveLocalDocument({
			documentData,
			localFileMode,
			desktopShell,
			nativeFilePath,
			localFileHandle,
			externalChange,
			saveMessage,
			markdown: activeEditorMarkdown(),
			baseMarkdown,
			localMetadataDirty,
			pendingEditThreads
		});
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
			if (externalChange && externalChange.path === document.path && externalChange.markdown === document.markdown) return;

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
		return computeHasUnsavedLocalChanges({
			markdown,
			baseMarkdown,
			localMetadataDirty,
			pendingEditThreads,
			commentBody
		});
	}

	function hasAutosavableLocalChanges(markdown = activeEditorMarkdown()) {
		return computeHasAutosavableLocalChanges({
			markdown,
			baseMarkdown,
			localMetadataDirty,
			pendingEditThreads
		});
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
		const nextState = computeRefreshLocalSaveState({
			markdown,
			baseMarkdown,
			localMetadataDirty,
			externalChange
		});

		saveState = nextState.saveState;
		saveMessage = nextState.saveMessage;
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
			author: commentAuthor,
			suggestions: [...annotations.suggestions, ...materializedSuggestions]
		};
	}

	function pendingThreadToSuggestion(thread: ThreadView, index: number): MarginSuggestion {
		const startLine = thread.currentLine ?? thread.line;
		const endLine = thread.currentEndLine ?? thread.endLine;

		return {
			id: `local-suggestion-${Date.now()}-${index}`,
			author: thread.author,
			...(thread.authorImageUrl ? { author_image_url: thread.authorImageUrl } : {}),
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
		if (workspaceMode.kind === 'sosein' && nextMode === 'suggest') return;

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
		wordCountDialogOpen = false;
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
		await renderPrintMermaidCharts();

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

	async function renderPrintMermaidCharts() {
		const charts = Array.from(
			document.querySelectorAll<HTMLElement>('.print-document-body .print-mermaid-chart[data-mermaid-source]')
		);

		await Promise.all(charts.map(async (chart) => {
			const source = chart.dataset.mermaidSource ?? '';

			chart.classList.add('markdown-mermaid-widget');
			await renderMermaidIntoElement(chart, source);
		}));
	}

	function isAbortError(err: unknown) {
		return err instanceof DOMException && err.name === 'AbortError';
	}

	function emptyLocalAnnotations(fileName: string): LocalAnnotations {
		return {
			id: `local-annotations:${Date.now()}`,
			fileName,
			author: commentAuthor,
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
			author: comments.author || commentAuthor,
			comments: comments.comments,
			suggestions: comments.suggestions,
			created_at: comments.updated_at
		};
	}

	function handleCommandPaletteShortcut(event: KeyboardEvent) {
		if (desktopShell && !document.hasFocus()) return false;

		const mod = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();

		if (!mod || event.altKey || key !== 'p') return false;

		event.preventDefault();
		openCommandPalette(event.shiftKey ? 'commands' : 'files');

		return true;
	}

	function handleGlobalShortcut(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		if (desktopShell && !document.hasFocus()) return;
		if (handleCommandPaletteShortcut(event)) return;
		if (commandPaletteIsOpen) return;
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
			openCommandPalette('files');
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
		if (desktopShell && !document.hasFocus()) return false;
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
			author: commentAuthor,
			comments: [
				...annotations.comments,
				{
					id: `local-comment-${Date.now()}`,
					author: commentAuthor,
					...(commentAuthorImageUrl ? { author_image_url: commentAuthorImageUrl } : {}),
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

		selectThread(commentId);
		clearCommentEdit();
		await tick();
		updateAnchorPositions();
	}

	async function acceptSuggestion(thread: ThreadView) {
		if (!annotations || thread.kind !== 'suggestion') return;

		selectThread(thread.id);
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

		selectThread(thread.id);
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

		selectThread(thread.id);

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
		pendingEditThreads = draftMarkdownSuggestions(draftChanges, draftBaseMarkdown, editorMarkdown, persistedThreads, { author: commentAuthor, authorImageUrl: commentAuthorImageUrl, syncedKeys: syncedEditKeys });
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

		selectThread(thread.id);

		const range = threadRangeInState(mainEditor.state, thread);

		if (!range) return;

		mainEditor.dispatch({ selection: { anchor: range.from, head: range.to } });
		mainEditor.focus();
	}

	async function resolveComment(thread: ThreadView) {
		if (!annotations || thread.kind !== 'comment') return;
		if (threadIsResolving(thread.id)) return;

		const resolvingDocumentSessionKey = documentSessionKey;

		if (editingCommentId === thread.id) clearCommentEdit();

		selectThread(thread.id);
		setThreadResolving(thread.id, true);
		await waitForCommentResolveAnimation();
		setThreadResolving(thread.id, false);

		if (!annotations || documentSessionKey !== resolvingDocumentSessionKey) return;

		annotations = {
			...annotations,
			comments: annotations.comments.map((comment) => comment.id === thread.id ? { ...comment, resolved: true } : comment)
		};

		if (selectedThreadId === thread.id) clearThreadFocus();
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
	class:file-tree-open={fileTreePanelOpen}
	style={`--file-tree-panel-width: ${fileTreePanelWidth}px;`}
>
	<EditorTitlebar
		bind:fileInput
		{fileTreePanelOpen}
		{workspaceNavigatorLabel}
		{visibleDocumentTabs}
		{activeDocumentTabId}
		{editMode}
		{brandMarkUrl}
		{brandMarkDarkUrl}
		{titlebarEyebrowLabel}
		{titlebarEyebrowPlaceholder}
		{documentTitleLabel}
		{showDocumentTitlebar}
		{toggleFileTreePanel}
		{tabHasDiscardableWork}
		{activateDocumentTab}
		{closeDocumentTab}
		{openCommandPalette}
		{setEditingMode}
		{handleLocalFileSelected}
	/>

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

	{#if fileTreePanelOpen}
		{#if workspaceMode.kind === 'sosein'}
			<SoseinCloudPanel
				bind:newDocumentTitle={soseinNewDocumentTitle}
				session={soseinSession}
				documents={soseinDocuments}
				documentsLoading={soseinDocumentsLoading}
				authLoading={soseinAuthLoading}
				documentOpening={soseinDocumentOpening}
				error={soseinCloudError}
				activeDocument={soseinActiveDocument}
				syncStatus={soseinSyncStatus}
				bind:width={fileTreePanelWidth}
				disconnectSession={disconnectSoseinSession}
				startOidcLogin={startSoseinOidcLogin}
				refreshDocuments={refreshSoseinDocuments}
				createDocument={createSoseinDocument}
				openDocument={openSoseinDocument}
				syncStatusLabel={soseinSyncStatusLabel}
			/>
		{:else}
			<FileTreePanel
				{fileTreeRoot}
				{fileTreeLoading}
				{fileTreeError}
				{nativeFilePath}
				bind:width={fileTreePanelWidth}
				{openFileTreeEntry}
			/>
		{/if}
	{/if}

	<div
		class="workspace-layout"
		class:file-tree-visible={fileTreePanelOpen}
	>
		{#if !fileTreePanelOpen && !desktopShell}
			<nav class="activity-rail workspace-activity-rail" aria-label="Workspace views">
				<Button
					variant="ghost"
					size="icon-sm"
					class="activity-icon-button"
					aria-label={`Show ${workspaceNavigatorLabel}`}
					aria-pressed="false"
					title={`Show ${workspaceNavigatorLabel}`}
					onclick={toggleFileTreePanel}
				>
					{#if workspaceMode.kind === 'sosein'}
						<CloudIcon aria-hidden="true" />
					{:else}
						<FolderTreeIcon aria-hidden="true" />
					{/if}
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
									documentKey: documentSessionKey,
									cloudSync: soseinEditorSync
								}}
							></div>
						{/if}
					</article>
				</section>

				<MarginRail
					bind:commentTextarea
					bind:commentBody
					bind:editingCommentTextarea
					bind:editingCommentBody
					{marginRailOpen}
					{stageHeight}
					{marginItems}
					{activeThreadId}
					{selectedThreadId}
					{commentComposerAttention}
					{commentAuthor}
					{commentAuthorImageUrl}
					selectionReady={Boolean(selectionReady)}
					{editingCommentId}
					{measureHeight}
					{threadIsResolving}
					{connectorPath}
					{connectorSourceRadius}
					{clearSelection}
					{submitComment}
					{goToThread}
					{previewThread}
					{clearThreadPreview}
					{startEditingComment}
					{resolveComment}
					{cancelCommentEdit}
					{saveEditedComment}
					{suggestionStatusLabel}
					{diffQuote}
					{diffLines}
					{diffBody}
					{acceptSuggestion}
					{rejectSuggestion}
					{resolveSuggestion}
				/>

		</div>

	</div>

	<PrintDocument
		{printDocumentHtml}
		{printableThreads}
	/>

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

	<CommandPalette
		openRequest={commandPaletteOpenRequest}
		onOpenChange={(open) => {
			commandPaletteIsOpen = open;
		}}
		getCommandEntries={commandPaletteCommandEntries}
		getFileEntries={quickOpenPaletteEntries}
		{fileTreePanelOpen}
	/>

	{#if updateNoticeVisible && availableAppUpdate}
		<UpdateNotice
			bind:updateNoticeVisible
			{availableAppUpdate}
			{updateCheckState}
			{installDesktopUpdate}
		/>
	{/if}


	<WordCountDialog
		bind:open={wordCountDialogOpen}
		{wordCountStats}
		{closeWordCountDialog}
		{formatCount}
		{formatReadingTime}
		{formatReviewProgress}
		{formatTaskProgress}
	/>

	<PrintOptionsDialog
		bind:open={printOptionsDialogOpen}
		bind:includeMarginNotesAppendix
		{printAppendixCandidateThreads}
		{confirmPrintDocument}
	/>

	<SoseinCloudDialog
		bind:open={soseinDialogOpen}
		bind:environment={soseinCloudEnvironment}
		bind:newDocumentTitle={soseinNewDocumentTitle}
		session={soseinSession}
		documents={soseinDocuments}
		documentsLoading={soseinDocumentsLoading}
		authLoading={soseinAuthLoading}
		documentOpening={soseinDocumentOpening}
		error={soseinCloudError}
		activeDocument={soseinActiveDocument}
		syncStatus={soseinSyncStatus}
		closeDialog={closeSoseinDialog}
		disconnectSession={disconnectSoseinSession}
		startOidcLogin={startSoseinOidcLogin}
		openWorkspace={openSoseinWorkspace}
		refreshDocuments={refreshSoseinDocuments}
		createDocument={createSoseinDocument}
		openDocument={openSoseinDocument}
		syncStatusLabel={soseinSyncStatusLabel}
	/>

	<SettingsDialog
		bind:open={settingsDialogOpen}
		{themeOptions}
		{settingsDraftTheme}
		{settingsDraftLocalUserName}
		{desktopShell}
		{updateCheckState}
		{updateStatusMessage}
		{availableAppUpdate}
		{settingsError}
		{closeSettingsDialog}
		{updateSettingsTheme}
		{updateSettingsLocalUserName}
		{checkForDesktopUpdate}
		{installDesktopUpdate}
	/>

	</main>
