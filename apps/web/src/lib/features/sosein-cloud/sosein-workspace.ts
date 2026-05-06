import type { LocalDocument } from '$lib/types';

import type {
	DocumentTab,
	SoseinActiveDocument
} from '../../app-types';
import type { SoseinSyncStatus } from './sosein-codemirror-sync';

export function findExistingSoseinDocumentTab(
	documentTabs: DocumentTab[],
	serverUrl: string,
	documentId: string
) {
	return documentTabs.find((tab) => {
		const cloudDocument = tab.soseinDocument;

		if (!cloudDocument) return false;

		return cloudDocument.serverUrl === serverUrl && cloudDocument.id === documentId;
	});
}

export function createSoseinDocumentState(args: {
	serverUrl: string;
	document: {
		id: string;
		title: string;
		content_type: string;
		latest_snapshot: { version: number };
	};
	fileName: string;
	syncStatus: SoseinSyncStatus;
	syncStatusLabel: (status: SoseinSyncStatus) => string;
}): {
	soseinDocument: SoseinActiveDocument;
	documentSessionKey: string;
	documentData: LocalDocument;
	saveMessage: string;
} {
	const soseinDocument: SoseinActiveDocument = {
		serverUrl: args.serverUrl,
		id: args.document.id,
		title: args.document.title,
		contentType: args.document.content_type,
		snapshotVersion: args.document.latest_snapshot.version
	};
	const documentSessionKey = `sosein:${soseinDocument.serverUrl}:${soseinDocument.id}`;

	return {
		soseinDocument,
		documentSessionKey,
		documentData: {
			id: documentSessionKey,
			fileName: args.fileName,
			markdown: ''
		},
		saveMessage: args.syncStatusLabel(args.syncStatus)
	};
}
