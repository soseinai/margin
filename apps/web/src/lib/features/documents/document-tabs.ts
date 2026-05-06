import type { ChangeSet } from '@codemirror/state';

import type { LocalAnnotations, LocalDocument } from '$lib/types';

import type {
	DocumentTab,
	EditingMode,
	ExternalDocumentChange,
	MarkdownFileHandle,
	SaveState,
	SoseinActiveDocument,
	ThreadView
} from '../../app-types';

export type DocumentTabSnapshot = {
	documentData: LocalDocument | null;
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
	syncedEditKeys: Iterable<string>;
};

export function tabFromSnapshot(
	snapshot: DocumentTabSnapshot,
	activeDocumentTabId: string,
	previous?: DocumentTab
): DocumentTab {
	const nextDocumentData = snapshot.documentData
		? { ...snapshot.documentData, markdown: snapshot.editorMarkdown }
		: previous?.documentData ?? {
			id: snapshot.documentSessionKey,
			fileName: 'Untitled.md',
			markdown: snapshot.editorMarkdown
		};

	return {
		id: previous?.id ?? (activeDocumentTabId || snapshot.documentSessionKey),
		title: nextDocumentData.fileName,
		documentData: nextDocumentData,
		annotations: snapshot.annotations,
		editorMarkdown: snapshot.editorMarkdown,
		baseMarkdown: snapshot.baseMarkdown,
		draftBaseMarkdown: snapshot.draftBaseMarkdown,
		pendingEditThreads: snapshot.pendingEditThreads,
		draftChanges: snapshot.draftChanges,
		editMode: snapshot.editMode,
		localFileMode: snapshot.localFileMode,
		localFileHandle: snapshot.localFileHandle,
		localFileName: snapshot.localFileName,
		localMetadataDirty: snapshot.localMetadataDirty,
		nativeFilePath: snapshot.nativeFilePath,
		lastPersistedSerializedMarkdown: snapshot.lastPersistedSerializedMarkdown,
		externalChange: snapshot.externalChange,
		saveState: snapshot.saveState,
		saveMessage: snapshot.saveMessage,
		soseinDocument: snapshot.soseinDocument,
		documentSessionKey: snapshot.documentSessionKey,
		syncedEditKeys: [...snapshot.syncedEditKeys]
	};
}

export function syncDocumentTab(
	documentTabs: DocumentTab[],
	activeDocumentTabId: string,
	snapshot: DocumentTabSnapshot
): DocumentTab[] {
	if (!activeDocumentTabId || !snapshot.documentData) return documentTabs;

	const nextTab = tabFromSnapshot(snapshot, activeDocumentTabId);
	const existingIndex = documentTabs.findIndex((tab) => tab.id === activeDocumentTabId);

	if (existingIndex >= 0) {
		return [
			...documentTabs.slice(0, existingIndex),
			nextTab,
			...documentTabs.slice(existingIndex + 1)
		];
	}

	return [...documentTabs, nextTab];
}

export function visibleDocumentTabs(
	documentTabs: DocumentTab[],
	activeDocumentTabId: string,
	snapshot: DocumentTabSnapshot
) {
	return documentTabs.map((tab) =>
		tab.id === activeDocumentTabId ? tabFromSnapshot(snapshot, activeDocumentTabId, tab) : tab
	);
}

export function nextUntitledFileName(documentTabs: DocumentTab[]) {
	const usedNames = new Set(documentTabs.map((tab) => tab.localFileName || tab.title));

	if (!usedNames.has('Untitled.md')) return 'Untitled.md';

	for (let index = 2; index < 1000; index += 1) {
		const candidate = `Untitled ${index}.md`;

		if (!usedNames.has(candidate)) return candidate;
	}

	return `Untitled ${Date.now()}.md`;
}

export function adjacentDocumentTab(
	documentTabs: DocumentTab[],
	activeDocumentTabId: string,
	direction: -1 | 1
) {
	if (documentTabs.length <= 1) return null;

	const activeIndex = Math.max(0, documentTabs.findIndex((tab) => tab.id === activeDocumentTabId));
	const nextIndex = (activeIndex + direction + documentTabs.length) % documentTabs.length;

	return documentTabs[nextIndex] ?? null;
}

export function tabHasDiscardableWork(tab: DocumentTab) {
	if (tab.soseinDocument) {
		return tab.pendingEditThreads.length > 0 || tab.localMetadataDirty;
	}

	return (
		tab.saveState === 'dirty'
		|| tab.saveState === 'conflict'
		|| tab.pendingEditThreads.length > 0
		|| tab.editorMarkdown !== tab.baseMarkdown
		|| (tab.localMetadataDirty
			&& Boolean((tab.annotations?.comments.length ?? 0) + (tab.annotations?.suggestions.length ?? 0)))
	);
}

export function closeDocumentTabs(
	documentTabs: DocumentTab[],
	activeDocumentTabId: string,
	tabId: string
) {
	const tabIndex = documentTabs.findIndex((tab) => tab.id === tabId);

	if (tabIndex < 0) {
		return {
			closedTab: null,
			nextActiveTab: null,
			nextTabs: documentTabs
		};
	}

	const closedTab = documentTabs[tabIndex];
	const nextTabs = documentTabs.filter((candidate) => candidate.id !== tabId);
	const nextActiveTab = tabId === activeDocumentTabId
		? (nextTabs[Math.max(0, tabIndex - 1)] ?? nextTabs[0] ?? null)
		: null;

	return { closedTab, nextActiveTab, nextTabs };
}
