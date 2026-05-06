import type { LocalDocument } from '$lib/types';

import type {
	ExternalDocumentChange,
	MarkdownFileHandle,
	NativeMarkdownDocument,
	SaveState,
	ThreadView
} from '../../app-types';
import type { MarginCommentBlock } from '../../embedded-margin';

export type EmbeddedMarkdownDocument = {
	markdown: string;
	comments: MarginCommentBlock | null;
};

export type LocalDocumentSessionState = {
	documentData: LocalDocument;
	embeddedComments: MarginCommentBlock | null;
	editorMarkdown: string;
	baseMarkdown: string;
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
};

export function createUntitledLocalDocumentSession(
	fileName: string,
	documentSessionKey: string
): LocalDocumentSessionState {
	return {
		documentData: {
			id: documentSessionKey,
			fileName,
			markdown: ''
		},
		embeddedComments: null,
		editorMarkdown: '',
		baseMarkdown: '',
		localFileMode: true,
		localFileHandle: null,
		localFileName: fileName,
		localMetadataDirty: false,
		nativeFilePath: '',
		lastPersistedSerializedMarkdown: '',
		externalChange: null,
		saveState: 'idle',
		saveMessage: 'Unsaved document',
		documentSessionKey
	};
}

export function createNativeLocalDocumentSession(args: {
	nativeDocument: NativeMarkdownDocument;
	fileName: string;
	splitDocument: EmbeddedMarkdownDocument;
	message?: string;
	documentSessionKey: string;
}): LocalDocumentSessionState {
	const { nativeDocument, fileName, splitDocument, message = 'Saved', documentSessionKey } = args;

	return {
		documentData: {
			id: documentSessionKey,
			fileName,
			markdown: splitDocument.markdown
		},
		embeddedComments: splitDocument.comments,
		editorMarkdown: splitDocument.markdown,
		baseMarkdown: splitDocument.markdown,
		localFileMode: true,
		localFileHandle: null,
		localFileName: fileName,
		localMetadataDirty: false,
		nativeFilePath: nativeDocument.path,
		lastPersistedSerializedMarkdown: nativeDocument.markdown,
		externalChange: null,
		saveState: 'saved',
		saveMessage: message,
		documentSessionKey
	};
}

export function createBrowserLocalDocumentSession(args: {
	serializedMarkdown: string;
	splitDocument: EmbeddedMarkdownDocument;
	fileName: string;
	handle: MarkdownFileHandle | null;
	documentSessionKey: string;
}): LocalDocumentSessionState {
	const { serializedMarkdown, splitDocument, fileName, handle, documentSessionKey } = args;

	return {
		documentData: {
			id: documentSessionKey,
			fileName,
			markdown: splitDocument.markdown
		},
		embeddedComments: splitDocument.comments,
		editorMarkdown: splitDocument.markdown,
		baseMarkdown: splitDocument.markdown,
		localFileMode: true,
		localFileHandle: handle,
		localFileName: fileName,
		localMetadataDirty: false,
		nativeFilePath: '',
		lastPersistedSerializedMarkdown: serializedMarkdown,
		externalChange: null,
		saveState: 'saved',
		saveMessage: handle?.createWritable ? 'Saved' : 'Opened read-only; use Save As',
		documentSessionKey
	};
}

export function hasWritableLocalSaveTarget(args: {
	localFileMode: boolean;
	desktopShell: boolean;
	nativeFilePath: string;
	localFileHandle: MarkdownFileHandle | null;
}) {
	return (
		args.localFileMode
		&& ((args.desktopShell && Boolean(args.nativeFilePath)) || Boolean(args.localFileHandle?.createWritable))
	);
}

export function hasUnsavedLocalChanges(args: {
	markdown: string;
	baseMarkdown: string;
	localMetadataDirty: boolean;
	pendingEditThreads: ThreadView[];
	commentBody: string;
}) {
	return (
		args.markdown !== args.baseMarkdown
		|| args.localMetadataDirty
		|| args.pendingEditThreads.length > 0
		|| args.commentBody.trim().length > 0
	);
}

export function hasAutosavableLocalChanges(args: {
	markdown: string;
	baseMarkdown: string;
	localMetadataDirty: boolean;
	pendingEditThreads: ThreadView[];
}) {
	return (
		args.markdown !== args.baseMarkdown
		|| args.localMetadataDirty
		|| args.pendingEditThreads.length > 0
	);
}

export function shouldAutosaveLocalDocument(args: {
	documentData: LocalDocument | null;
	localFileMode: boolean;
	desktopShell: boolean;
	nativeFilePath: string;
	localFileHandle: MarkdownFileHandle | null;
	externalChange: ExternalDocumentChange | null;
	saveMessage: string;
	markdown: string;
	baseMarkdown: string;
	localMetadataDirty: boolean;
	pendingEditThreads: ThreadView[];
}) {
	return Boolean(
		args.documentData
		&& hasWritableLocalSaveTarget(args)
		&& !args.externalChange
		&& args.saveMessage !== 'Save failed'
		&& hasAutosavableLocalChanges(args)
	);
}

export function refreshLocalSaveState(args: {
	markdown: string;
	baseMarkdown: string;
	localMetadataDirty: boolean;
	externalChange: ExternalDocumentChange | null;
}) {
	if (args.externalChange) {
		return {
			saveState: 'conflict' as const,
			saveMessage: 'Changed on disk'
		};
	}

	const dirty = args.markdown !== args.baseMarkdown || args.localMetadataDirty;

	return {
		saveState: dirty ? 'dirty' as const : 'saved' as const,
		saveMessage: dirty ? 'Unsaved changes' : 'Saved'
	};
}
