import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { initializePartialMarkdownParser } from './partial-markdown-core';
import {
	MarkdownSourceModeDecider,
	PartialMarkdownTextModel,
	markdownListContentOffset
} from './partial-markdown-text';

describe('partial markdown text model', () => {
	beforeAll(async () => {
		const wasm = await readFile(resolve(process.cwd(), 'src/lib/generated/markdown-core/margin_markdown_core.wasm'));

		await initializePartialMarkdownParser(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
	});

	it('keeps nested list source editing scoped to the nested subtree', () => {
		const model = PartialMarkdownTextModel.fromText([
			'- Parent',
			'  - Child',
			'    - Grandchild'
		].join('\n'));
		const decider = new MarkdownSourceModeDecider(model, [{ startLine: 2, endLine: 2 }]);

		expect(decider.decisionForLine(1).active).toBe(false);
		expect(decider.decisionForLine(2)).toMatchObject({
			active: true,
			block: {
				kind: 'list',
				start: 2,
				end: 3,
				listEditBaseSourceIndent: 2,
				listEditBaseVisualIndent: 12
			},
			sourceClass: 'cm-active-source-line cm-active-block-line cm-active-block-start cm-active-list-subtree-line'
		});
		expect(decider.decisionForLine(3).sourceClass).toBe(
			'cm-active-source-line cm-active-block-line cm-active-block-end cm-active-list-subtree-line'
		);
	});

	it('does not treat an outdented blank line after a list as part of the active list source', () => {
		const model = PartialMarkdownTextModel.fromText([
			'- Parent',
			'  - Child',
			''
		].join('\n'));
		const decider = new MarkdownSourceModeDecider(model, [{ startLine: 3, endLine: 3 }]);

		expect(decider.decisionForLine(2).active).toBe(false);
		expect(decider.decisionForLine(3)).toMatchObject({
			active: true,
			block: {
				kind: 'line',
				start: 3,
				end: 3
			}
		});
	});

	it('distinguishes list continuation text from list-indented code', () => {
		const model = PartialMarkdownTextModel.fromText([
			'- Parent',
			'  continuation',
			'      code'
		].join('\n'));

		expect(model.listContinuationInfo(2)).toMatchObject({
			sourceIndentLength: 2,
			sourceIndentWidth: 2,
			visualIndent: 12
		});
		expect(model.indentedCodeInfo(3)).toMatchObject({
			sourceIndentLength: 6,
			sourceIndentWidth: 6,
			visualIndent: 12
		});
	});

	it('parses task list source offsets through the model helper', () => {
		expect(markdownListContentOffset('  - [x] Done')).toBe(8);
	});
});
