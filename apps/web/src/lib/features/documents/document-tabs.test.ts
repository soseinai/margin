import { ChangeSet } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import type { DocumentTab } from '../../app-types';
import {
	adjacentDocumentTab,
	closeDocumentTabs,
	nextUntitledFileName,
	syncDocumentTab,
	tabFromSnapshot,
	tabHasDiscardableWork,
	visibleDocumentTabs,
	type DocumentTabSnapshot
} from './document-tabs';

function snapshot(overrides: Partial<DocumentTabSnapshot> = {}): DocumentTabSnapshot {
	return {
		documentData: {
			id: 'doc-1',
			fileName: 'Draft.md',
			markdown: 'Base body'
		},
		annotations: null,
		editorMarkdown: 'Base body',
		baseMarkdown: 'Base body',
		draftBaseMarkdown: 'Base body',
		pendingEditThreads: [],
		draftChanges: ChangeSet.empty(0),
		editMode: 'edit',
		localFileMode: true,
		localFileHandle: null,
		localFileName: 'Draft.md',
		localMetadataDirty: false,
		nativeFilePath: '',
		lastPersistedSerializedMarkdown: '',
		externalChange: null,
		saveState: 'saved',
		saveMessage: 'Saved',
		soseinDocument: null,
		documentSessionKey: 'local:draft',
		syncedEditKeys: [],
		...overrides
	};
}

function tab(id: string, overrides: Partial<DocumentTab> = {}): DocumentTab {
	return {
		id,
		title: `${id}.md`,
		documentData: {
			id,
			fileName: `${id}.md`,
			markdown: `${id} body`
		},
		annotations: null,
		editorMarkdown: `${id} body`,
		baseMarkdown: `${id} body`,
		draftBaseMarkdown: `${id} body`,
		pendingEditThreads: [],
		draftChanges: ChangeSet.empty(0),
		editMode: 'edit',
		localFileMode: true,
		localFileHandle: null,
		localFileName: `${id}.md`,
		localMetadataDirty: false,
		nativeFilePath: '',
		lastPersistedSerializedMarkdown: '',
		externalChange: null,
		saveState: 'saved',
		saveMessage: 'Saved',
		soseinDocument: null,
		documentSessionKey: id,
		syncedEditKeys: [],
		...overrides
	};
}

describe('document tab helpers', () => {
	it('builds a tab from the current editor snapshot', () => {
		expect(
			tabFromSnapshot(
				snapshot({
					editorMarkdown: 'Edited body',
					syncedEditKeys: ['comment:1']
				}),
				'active-tab'
			)
		).toMatchObject({
			id: 'active-tab',
			title: 'Draft.md',
			documentData: {
				fileName: 'Draft.md',
				markdown: 'Edited body'
			},
			editorMarkdown: 'Edited body',
			syncedEditKeys: ['comment:1']
		});
	});

	it('syncs the active tab in place and appends when missing', () => {
		const current = snapshot({ editorMarkdown: 'Fresh body' });
		const existingTabs = [tab('first'), tab('active-tab', { editorMarkdown: 'Stale body' })];

		expect(syncDocumentTab(existingTabs, 'active-tab', current)[1]).toMatchObject({
			id: 'active-tab',
			editorMarkdown: 'Fresh body'
		});

		expect(syncDocumentTab([tab('first')], 'active-tab', current)).toHaveLength(2);
	});

	it('projects the live active tab without mutating the stored inactive tabs', () => {
		const active = tab('active-tab', { editorMarkdown: 'Old body' });
		const inactive = tab('other-tab', { editorMarkdown: 'Other body' });

		expect(visibleDocumentTabs([active, inactive], 'active-tab', snapshot({ editorMarkdown: 'New body' }))).toEqual([
			expect.objectContaining({ id: 'active-tab', editorMarkdown: 'New body' }),
			inactive
		]);
	});

	it('picks the next untitled file name from existing tabs', () => {
		expect(nextUntitledFileName([tab('a', { localFileName: 'Untitled.md' })])).toBe('Untitled 2.md');
		expect(
			nextUntitledFileName([
				tab('a', { localFileName: 'Untitled.md' }),
				tab('b', { localFileName: 'Untitled 2.md' })
			])
		).toBe('Untitled 3.md');
	});

	it('selects adjacent tabs with wraparound behavior', () => {
		const tabs = [tab('first'), tab('second'), tab('third')];

		expect(adjacentDocumentTab(tabs, 'second', 1)?.id).toBe('third');
		expect(adjacentDocumentTab(tabs, 'first', -1)?.id).toBe('third');
	});

	it('detects discardable work from dirty state, content drift, and annotation metadata', () => {
		expect(tabHasDiscardableWork(tab('dirty', { saveState: 'dirty' }))).toBe(true);
		expect(tabHasDiscardableWork(tab('edited', { editorMarkdown: 'Changed', baseMarkdown: 'Base' }))).toBe(true);
		expect(
			tabHasDiscardableWork(
				tab('annotated', {
					localMetadataDirty: true,
					annotations: {
						id: 'id',
						fileName: 'annotated.md',
						author: 'Me',
						comments: [
							{
								id: 'c1',
								author: 'Me',
								body: 'Needs review',
								resolved: false,
								anchor: {
									start_line: 1,
									end_line: 1,
									quote: 'Annotated',
									prefix: '',
									suffix: '',
									heading_path: [],
									content_hash: 'hash'
								},
								created_at: '2026-05-06T00:00:00.000Z'
							}
						],
						suggestions: [],
						created_at: '2026-05-06T00:00:00.000Z'
					}
				})
			)
		).toBe(true);
		expect(tabHasDiscardableWork(tab('clean'))).toBe(false);
	});

	it('closes a tab and selects the previous surviving active tab', () => {
		const tabs = [tab('first'), tab('second'), tab('third')];
		const result = closeDocumentTabs(tabs, 'second', 'second');

		expect(result.closedTab?.id).toBe('second');
		expect(result.nextTabs.map((item) => item.id)).toEqual(['first', 'third']);
		expect(result.nextActiveTab?.id).toBe('first');
	});
});
