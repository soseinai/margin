import {
	fileNameFromPath,
	normalizeRecentDocuments,
	type RecentDocument
} from './local-documents';

import type { NativeMarkdownDocument } from '../../app-types';

export function readBrowserRecentDocuments(storageKey: string) {
	try {
		const raw = window.localStorage.getItem(storageKey);

		if (!raw) return [];

		return normalizeRecentDocuments(JSON.parse(raw));
	} catch {
		return [];
	}
}

export function writeBrowserRecentDocuments(storageKey: string, documents: RecentDocument[]) {
	try {
		window.localStorage.setItem(storageKey, JSON.stringify(documents));
	} catch {
		// Recent documents are a convenience; failures here should not block editing.
	}
}

export function addRecentDocumentEntry(
	recentDocuments: RecentDocument[],
	document: NativeMarkdownDocument,
	openedAt = Date.now()
) {
	if (!document.path) return normalizeRecentDocuments(recentDocuments);

	const nextEntry = {
		path: document.path,
		title: document.name || fileNameFromPath(document.path),
		openedAt
	};

	return normalizeRecentDocuments([
		nextEntry,
		...recentDocuments.filter((entry) => entry.path !== document.path)
	]);
}

export function removeRecentDocumentEntry(recentDocuments: RecentDocument[], path: string) {
	return normalizeRecentDocuments(recentDocuments.filter((entry) => entry.path !== path));
}
