import {
	compactLocalPath,
	fileNameFromPath,
	relativeLocalPath,
	type RecentDocument
} from '../documents/local-documents';

import type {
	CommandPaletteEntry,
	DocumentTab,
	EditingMode,
	NativeDirectoryEntry
} from '../../app-types';

export function buildCommandPaletteCommandEntries(args: {
	desktopShell: boolean;
	soseinCloudVisible: boolean;
	soseinSessionEmail: string;
	soseinActiveDocument: boolean;
	editMode: EditingMode;
	documentData: boolean;
	documentTabsLength: number;
	fileTreePanelOpen: boolean;
	selectedQuote: string;
	createNewDocument: () => void | Promise<void>;
	openLocalMarkdown: () => void | Promise<void>;
	openLocalFolder: () => void | Promise<void>;
	openQuickOpen: () => void | Promise<void>;
	openSettingsDialog: () => void | Promise<void>;
	saveLocalMarkdown: () => void | Promise<void>;
	saveLocalMarkdownAs: () => void | Promise<void>;
	requestPrintDocument: () => void | Promise<void>;
	closeActiveDocumentTab: () => void | Promise<void>;
	activatePreviousTab: () => void | Promise<void>;
	activateNextTab: () => void | Promise<void>;
	toggleFileTreePanel: () => void | Promise<void>;
	openFindPanel: () => void | Promise<void>;
	openFindAndReplacePanel: () => void | Promise<void>;
	setEditingMode: (mode: EditingMode) => void;
	openCommentComposerForSelection: () => void | Promise<void>;
	insertMarkdownBlock: (kind: 'table' | 'tasks' | 'bullets' | 'numbers') => void | Promise<void>;
	openSoseinDialog: () => void | Promise<void>;
	checkForDesktopUpdate: () => void | Promise<void>;
}) {
	const commands: CommandPaletteEntry[] = [
		{
			id: 'command:new-document',
			kind: 'command',
			title: 'New Document',
			subtitle: 'File',
			group: 'Suggested',
			shortcut: shortcutLabel('N'),
			keywords: ['file', 'untitled'],
			action: args.createNewDocument
		},
		{
			id: 'command:open-document',
			kind: 'command',
			title: 'Open Document...',
			subtitle: 'File',
			group: 'Suggested',
			shortcut: shortcutLabel('O'),
			keywords: ['file', 'markdown'],
			action: args.openLocalMarkdown
		},
		{
			id: 'command:open-folder',
			kind: 'command',
			title: 'Open Folder...',
			subtitle: 'File',
			group: 'Suggested',
			shortcut: shortcutLabel('Shift+O'),
			keywords: ['workspace', 'files'],
			action: args.openLocalFolder
		},
		{
			id: 'command:quick-open',
			kind: 'command',
			title: 'Quick Open File',
			subtitle: 'File',
			group: 'Suggested',
			shortcut: shortcutLabel('P'),
			keywords: ['file', 'search', 'open'],
			action: args.openQuickOpen
		},
		{
			id: 'command:settings',
			kind: 'command',
			title: 'Settings',
			subtitle: 'Application',
			group: 'Suggested',
			shortcut: shortcutLabel(','),
			keywords: ['preferences'],
			action: args.openSettingsDialog
		},
		{
			id: 'command:save',
			kind: 'command',
			title: 'Save Document',
			subtitle: 'File',
			group: 'File',
			shortcut: shortcutLabel('S'),
			keywords: ['write'],
			disabled: args.soseinActiveDocument,
			action: args.saveLocalMarkdown
		},
		{
			id: 'command:save-as',
			kind: 'command',
			title: 'Save Document As...',
			subtitle: 'File',
			group: 'File',
			shortcut: shortcutLabel('Shift+S'),
			keywords: ['write', 'copy'],
			action: args.saveLocalMarkdownAs
		},
		{
			id: 'command:print',
			kind: 'command',
			title: 'Print Document',
			subtitle: 'File',
			group: 'File',
			keywords: ['export'],
			disabled: !args.documentData,
			action: args.requestPrintDocument
		},
		{
			id: 'command:close-tab',
			kind: 'command',
			title: 'Close Tab',
			subtitle: 'File',
			group: 'File',
			shortcut: shortcutLabel('W'),
			keywords: ['document'],
			action: args.closeActiveDocumentTab
		},
		{
			id: 'command:previous-tab',
			kind: 'command',
			title: 'Show Previous Tab',
			subtitle: 'Window',
			group: 'Navigation',
			shortcut: shortcutLabel('Shift+['),
			keywords: ['tabs'],
			disabled: args.documentTabsLength <= 1,
			action: args.activatePreviousTab
		},
		{
			id: 'command:next-tab',
			kind: 'command',
			title: 'Show Next Tab',
			subtitle: 'Window',
			group: 'Navigation',
			shortcut: shortcutLabel('Shift+]'),
			keywords: ['tabs'],
			disabled: args.documentTabsLength <= 1,
			action: args.activateNextTab
		},
		{
			id: 'command:toggle-file-tree',
			kind: 'command',
			title: args.fileTreePanelOpen ? 'Hide File Tree' : 'Show File Tree',
			subtitle: 'View',
			group: 'Navigation',
			shortcut: shortcutLabel('B'),
			keywords: ['folder', 'sidebar', 'explorer'],
			action: args.toggleFileTreePanel
		},
		{
			id: 'command:find',
			kind: 'command',
			title: 'Find',
			subtitle: 'Edit',
			group: 'Edit',
			shortcut: shortcutLabel('F'),
			keywords: ['search'],
			action: args.openFindPanel
		},
		{
			id: 'command:find-replace',
			kind: 'command',
			title: 'Find and Replace',
			subtitle: 'Edit',
			group: 'Edit',
			shortcut: shortcutLabel('Alt+F'),
			keywords: ['search'],
			action: args.openFindAndReplacePanel
		},
		{
			id: 'command:edit-mode',
			kind: 'command',
			title: 'Edit Directly',
			subtitle: 'Editing Mode',
			group: 'Editing Mode',
			keywords: ['mode', 'write'],
			disabled: args.editMode === 'edit',
			action: () => args.setEditingMode('edit')
		},
		{
			id: 'command:suggest-mode',
			kind: 'command',
			title: 'Suggest Edits',
			subtitle: 'Editing Mode',
			group: 'Editing Mode',
			keywords: ['mode', 'track changes'],
			disabled: args.editMode === 'suggest' || args.soseinActiveDocument,
			action: () => args.setEditingMode('suggest')
		},
		{
			id: 'command:add-comment',
			kind: 'command',
			title: 'Add Comment',
			subtitle: args.selectedQuote.trim() ? 'Insert' : 'Select text first',
			group: 'Insert',
			shortcut: shortcutLabel('Alt+M'),
			keywords: ['annotation', 'note'],
			disabled: !args.selectedQuote.trim() || args.soseinActiveDocument,
			action: args.openCommentComposerForSelection
		},
		{
			id: 'command:insert-table',
			kind: 'command',
			title: 'Insert Table',
			subtitle: 'Insert',
			group: 'Insert',
			shortcut: shortcutLabel('Shift+T'),
			keywords: ['markdown'],
			action: () => args.insertMarkdownBlock('table')
		},
		{
			id: 'command:insert-tasks',
			kind: 'command',
			title: 'Insert Task List',
			subtitle: 'Insert',
			group: 'Insert',
			shortcut: shortcutLabel('Shift+X'),
			keywords: ['markdown', 'checkbox'],
			action: () => args.insertMarkdownBlock('tasks')
		},
		{
			id: 'command:insert-bullets',
			kind: 'command',
			title: 'Insert Bulleted List',
			subtitle: 'Insert',
			group: 'Insert',
			shortcut: shortcutLabel('Shift+8'),
			keywords: ['markdown'],
			action: () => args.insertMarkdownBlock('bullets')
		},
		{
			id: 'command:insert-numbers',
			kind: 'command',
			title: 'Insert Numbered List',
			subtitle: 'Insert',
			group: 'Insert',
			shortcut: shortcutLabel('Shift+7'),
			keywords: ['markdown'],
			action: () => args.insertMarkdownBlock('numbers')
		}
	];

	if (args.soseinCloudVisible) {
		commands.splice(4, 0, {
			id: 'command:sosein-cloud',
			kind: 'command',
			title: 'Sosein Cloud',
			subtitle: args.soseinSessionEmail || 'Connect',
			group: 'Suggested',
			keywords: ['cloud', 'sosein', 'sync'],
			action: args.openSoseinDialog
		});
	}

	if (args.desktopShell) {
		commands.push({
			id: 'command:check-updates',
			kind: 'command',
			title: 'Check for Updates',
			subtitle: 'Application',
			group: 'Application',
			keywords: ['version'],
			action: args.checkForDesktopUpdate
		});
	}

	return commands;
}

export function buildQuickOpenPaletteEntries(args: {
	visibleDocumentTabs: DocumentTab[];
	activeDocumentTabId: string;
	fileTreeRoot: { path: string; entries: NativeDirectoryEntry[] } | null;
	recentDocuments: RecentDocument[];
	activateDocumentTab: (tabId: string) => void | Promise<void>;
	openNativeMarkdownPath: (path: string, options?: { removeRecentOnFailure?: boolean }) => void | Promise<void>;
	openLocalFolder: () => void | Promise<void>;
	openLocalMarkdown: () => void | Promise<void>;
}): CommandPaletteEntry[] {
	const entries: CommandPaletteEntry[] = [];
	const seenPaths = new Set<string>();

	for (const tab of args.visibleDocumentTabs) {
		const path = tab.nativeFilePath;

		entries.push({
			id: `quick-open:tab:${tab.id}`,
			kind: 'tab',
			title: tab.title,
			subtitle: path ? undefined : 'Open tab',
			detail: path
				? compactLocalPath(path)
				: tab.id === args.activeDocumentTabId ? 'Current tab' : 'Tab',
			group: 'Open Tabs',
			keywords: ['tab', path || '', tab.localFileName || ''],
			action: () => args.activateDocumentTab(tab.id)
		});

		if (path) seenPaths.add(path);
	}

	if (args.fileTreeRoot) {
		for (const entry of markdownFileTreeEntries(args.fileTreeRoot.entries)) {
			if (seenPaths.has(entry.path)) continue;
			seenPaths.add(entry.path);

			const relativePath = relativeLocalPath(args.fileTreeRoot.path, entry.path);

			entries.push({
				id: `quick-open:file:${entry.path}`,
				kind: 'file',
				title: entry.name,
				detail: relativePath || compactLocalPath(entry.path),
				group: 'Files',
				keywords: ['markdown', entry.path, relativePath],
				action: () => args.openNativeMarkdownPath(entry.path)
			});
		}
	}

	for (const recentDocument of args.recentDocuments) {
		if (seenPaths.has(recentDocument.path)) continue;
		seenPaths.add(recentDocument.path);

		entries.push({
			id: `quick-open:recent:${recentDocument.path}`,
			kind: 'recent',
			title: recentDocument.title || fileNameFromPath(recentDocument.path),
			detail: compactLocalPath(recentDocument.path),
			group: 'Recent',
			keywords: ['recent', recentDocument.path],
			action: () => args.openNativeMarkdownPath(recentDocument.path, { removeRecentOnFailure: true })
		});
	}

	if (entries.length > 0) return entries;

	return [
		{
			id: 'quick-open:open-folder',
			kind: 'command' as const,
			title: 'Open Folder...',
			subtitle: 'Choose a folder to search Markdown files',
			group: 'Suggested',
			keywords: ['workspace'],
			action: args.openLocalFolder
		},
		{
			id: 'quick-open:open-document',
			kind: 'command' as const,
			title: 'Open Document...',
			subtitle: 'Choose a Markdown file',
			group: 'Suggested',
			keywords: ['file'],
			action: args.openLocalMarkdown
		}
	];
}

export function markdownFileTreeEntries(entries: NativeDirectoryEntry[]): NativeDirectoryEntry[] {
	const markdownEntries: NativeDirectoryEntry[] = [];

	for (const entry of entries) {
		if (entry.kind === 'markdown') {
			markdownEntries.push(entry);
		}

		if (entry.children.length > 0) {
			markdownEntries.push(...markdownFileTreeEntries(entry.children));
		}
	}

	return markdownEntries;
}

export function shortcutLabel(keys: string) {
	if (isApplePlatform()) {
		return `${platformCommandKeyLabel()}${keys.split('+').map(macShortcutPartLabel).join('')}`;
	}

	return `${platformCommandKeyLabel()}+${keys}`;
}

function platformCommandKeyLabel() {
	return isApplePlatform() ? '⌘' : 'Ctrl';
}

function isApplePlatform() {
	return typeof navigator !== 'undefined' && (/Mac|iPhone|iPad|iPod/).test(navigator.platform);
}

function macShortcutPartLabel(part: string) {
	if (part === 'Shift') return '⇧';
	if (part === 'Alt') return '⌥';
	if (part === 'Ctrl') return '⌃';
	if (part === 'Cmd') return '⌘';

	return part.toUpperCase();
}
