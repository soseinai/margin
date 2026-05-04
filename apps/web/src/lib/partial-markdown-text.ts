import type { MarkdownFrontmatter } from './markdown-frontmatter';
import {
	leadingMarkdownIndent,
	leadingMarkdownWhitespaceLength,
	markdownIndentWidth,
	sourceMarkdownIndentLengthForWidth
} from './markdown-indent';
import type { MarkdownMathBlock } from './markdown-math';
import type { MarkdownTable } from './markdown-tables';
import {
	parsePartialMarkdownTextCore,
	type ParsedMarkdownHeading,
	type ParsedMarkdownListItem,
	type ParsedPartialMarkdownTextCore
} from './partial-markdown-core';

export type SourceBlock = {
	start: number;
	end: number;
	kind: 'line' | 'frontmatter' | 'fenced-code' | 'list' | 'indented' | 'table' | 'math';
	listEditBaseSourceIndent?: number;
	listEditBaseVisualIndent?: number;
	language?: string;
	frontmatter?: MarkdownFrontmatter;
	math?: MarkdownMathBlock;
	table?: MarkdownTable
};

export type MarkdownHeadingLine = { level: number; text: string; syntaxLength: number };
export type MarkdownHeading = {
	blockEnd: number;
	collapseKey: string;
	level: number;
	lineNumber: number;
	text: string
};
export type MarkdownHeadingModel = {
	collapsedAncestorByLine: Map<number, number>;
	items: Map<number, MarkdownHeading>
};
export type ListInfo = { indent: number; contentIndent: number; marker: string; task: boolean };
export type ListContinuationInfo = {
	sourceIndentLength: number;
	sourceIndentWidth: number;
	visualIndent: number
};
export type ListContainerContext = {
	info: ListInfo;
	sourceIndent: number;
	visualIndent: number
};
export type MarkdownListLayout = {
	depth: number;
	marker: string;
	markerOffset: number;
	markerX: number;
	textX: number
};
export type MarkdownListItem = {
	blockEnd: number;
	childLines: number[];
	collapseKey: string;
	info: ListInfo;
	layout: MarkdownListLayout;
	lineNumber: number;
	parentLine: number | null
};
export type MarkdownListModel = {
	collapsedAncestorByLine: Map<number, number>;
	items: Map<number, MarkdownListItem>;
	ownerByLine: Map<number, MarkdownListItem>
};

export type PartialMarkdownTextModelOptions = {
	collapsedHeadingKeys?: ReadonlySet<string>;
	collapsedListItemKeys?: ReadonlySet<string>;
	documentSessionKey?: string
};

export type MarkdownLineRange = {
	startLine: number;
	endLine: number
};

export type SourceLineDecision = {
	active: boolean;
	block: SourceBlock | null;
	sourceClass: string;
	attributes?: Record<string, string>
};

export class PartialMarkdownTextModel {
	readonly collapsedHeadingKeys: ReadonlySet<string>;
	readonly collapsedListItemKeys: ReadonlySet<string>;
	readonly documentSessionKey: string;
	readonly fencedBlocks: SourceBlock[];
	readonly frontmatterBlocks: SourceBlock[];
	readonly headingModel: MarkdownHeadingModel;
	readonly ignoredContainerBlocks: SourceBlock[];
	readonly lines: string[];
	readonly listModel: MarkdownListModel;
	readonly mathBlocks: SourceBlock[];
	readonly orderedListMarkers: Map<number, string>;
	readonly tableBlocks: SourceBlock[];

	constructor(parsed: ParsedPartialMarkdownTextCore, options: PartialMarkdownTextModelOptions = {}) {
		this.lines = parsed.lines;
		this.collapsedHeadingKeys = options.collapsedHeadingKeys ?? new Set();
		this.collapsedListItemKeys = options.collapsedListItemKeys ?? new Set();
		this.documentSessionKey = options.documentSessionKey ?? '';
		this.frontmatterBlocks = parsed.frontmatterBlocks as SourceBlock[];
		this.fencedBlocks = parsed.fencedBlocks as SourceBlock[];
		this.tableBlocks = parsed.tableBlocks as SourceBlock[];
		this.mathBlocks = parsed.mathBlocks as SourceBlock[];
		this.ignoredContainerBlocks = [
			...this.frontmatterBlocks,
			...this.fencedBlocks,
			...this.tableBlocks,
			...this.mathBlocks
		];
		this.headingModel = markdownHeadingModelFromParsed(
			parsed.headingItems,
			this.collapsedHeadingKeys,
			(lineNumber) => this.headingCollapseKey(lineNumber)
		);
		this.orderedListMarkers = new Map(parsed.orderedListMarkers.map(({ lineNumber, marker }) => [lineNumber, marker]));
		this.listModel = markdownListModelFromParsed(
			parsed.listItems,
			parsed.listOwnerByLine,
			this.collapsedListItemKeys,
			(lineNumber) => this.listCollapseKey(lineNumber)
		);
	}

	static fromText(text: string, options: PartialMarkdownTextModelOptions = {}) {
		return new PartialMarkdownTextModel(parsePartialMarkdownTextCore(text), options);
	}

	get lineCount() {
		return this.lines.length;
	}

	lineText(lineNumber: number) {
		return this.lines[lineNumber - 1] ?? '';
	}

	blockForLine(blocks: SourceBlock[], lineNumber: number) {
		return blockForLine(blocks, lineNumber);
	}

	sourceBlockForLine(lineNumber: number): SourceBlock {
		const frontmatterBlock = blockForLine(this.frontmatterBlocks, lineNumber);

		if (frontmatterBlock) return frontmatterBlock;

		const fencedBlock = blockForLine(this.fencedBlocks, lineNumber);

		if (fencedBlock) return fencedBlock;

		const tableBlock = blockForLine(this.tableBlocks, lineNumber);

		if (tableBlock) return tableBlock;

		const mathBlock = blockForLine(this.mathBlocks, lineNumber);

		if (mathBlock) return mathBlock;

		const listBlock = this.activeListBlockForLine(lineNumber);

		if (listBlock) return listBlock;

		const indentedBlock = this.indentedBlockForLine(lineNumber);

		if (indentedBlock) return indentedBlock;

		return { start: lineNumber, end: lineNumber, kind: 'line' };
	}

	activeListBlockForLine(lineNumber: number): SourceBlock | null {
		const item = this.listModel.ownerByLine.get(lineNumber);

		if (!item) return null;

		const text = this.lineText(lineNumber);

		if (!text.trim() && leadingMarkdownIndent(text) < item.info.contentIndent) return null;

		const itemBlock: SourceBlock = {
			start: item.lineNumber,
			end: item.blockEnd,
			kind: 'list'
		};

		if (item.info.indent === 0 || item.parentLine === null) return itemBlock;

		const parent = this.listModel.items.get(item.parentLine);

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

	headingControlLineNumbersForRanges(lineRanges: MarkdownLineRange[]) {
		const lines = new Set<number>();

		for (const range of lineRanges) {
			for (const heading of this.headingModel.items.values()) {
				if (
					heading.blockEnd <= heading.lineNumber
					|| heading.blockEnd < range.startLine
					|| heading.lineNumber > range.endLine
					|| this.headingModel.collapsedAncestorByLine.has(heading.lineNumber)
				) {
					continue;
				}

				lines.add(heading.lineNumber);
			}
		}

		return lines;
	}

	listControlLineNumbersForRanges(lineRanges: MarkdownLineRange[]) {
		const lines = new Set<number>();

		for (const range of lineRanges) {
			for (let lineNumber = range.startLine; lineNumber <= range.endLine; lineNumber += 1) {
				const item = this.listModel.ownerByLine.get(lineNumber);

				if (!item) continue;

				const root = rootMarkdownListItem(item, this.listModel);

				for (const candidate of this.listModel.items.values()) {
					if (
						candidate.childLines.length > 0
						&& candidate.lineNumber >= root.lineNumber
						&& candidate.lineNumber <= root.blockEnd
						&& !this.listModel.collapsedAncestorByLine.has(candidate.lineNumber)
					) {
						lines.add(candidate.lineNumber);
					}
				}
			}
		}

		return lines;
	}

	listContinuationInfo(lineNumber: number): ListContinuationInfo | null {
		const text = this.lineText(lineNumber);

		if (!text.trim() || markdownListInfo(text)) return null;

		const context = this.nearestListContainer(lineNumber);

		if (!context || context.sourceIndent >= context.info.contentIndent + 4) return null;

		return {
			sourceIndentLength: leadingMarkdownWhitespaceLength(text),
			sourceIndentWidth: context.sourceIndent,
			visualIndent: context.visualIndent
		};
	}

	indentedCodeInfo(lineNumber: number): ListContinuationInfo | null {
		const text = this.lineText(lineNumber);

		if (!text.trim()) return null;

		const listCode = this.listIndentedCodeInfo(lineNumber);

		if (listCode) return listCode;
		if (leadingMarkdownIndent(text) < 4 || this.listModel.ownerByLine.has(lineNumber)) return null;

		return {
			sourceIndentLength: sourceMarkdownIndentLengthForWidth(text, 4),
			sourceIndentWidth: 4,
			visualIndent: 0
		};
	}

	listContainerInfo(lineNumber: number): ListContinuationInfo | null {
		const text = this.lineText(lineNumber);
		const context = this.nearestListContainer(lineNumber);

		if (!context) return null;

		return {
			sourceIndentLength: sourceMarkdownIndentLengthForWidth(text, context.info.contentIndent),
			sourceIndentWidth: context.info.contentIndent,
			visualIndent: context.visualIndent
		};
	}

	listCollapseKey(lineNumber: number) {
		return `${this.documentSessionKey}:${lineNumber}:${this.lineText(lineNumber)}`;
	}

	headingCollapseKey(lineNumber: number) {
		return `${this.documentSessionKey}:${lineNumber}:${this.lineText(lineNumber)}`;
	}

	private nearestListContainer(lineNumber: number): ListContainerContext | null {
		const text = this.lineText(lineNumber);
		const sourceIndent = leadingMarkdownIndent(text);
		const item = this.listModel.ownerByLine.get(lineNumber);

		if (!item || lineNumber === item.lineNumber || sourceIndent < item.info.contentIndent) return null;

		return {
			info: item.info,
			sourceIndent,
			visualIndent: item.layout.textX
		};
	}

	private listIndentedCodeInfo(lineNumber: number): ListContinuationInfo | null {
		const text = this.lineText(lineNumber);
		const context = this.nearestListContainer(lineNumber);

		if (!context) return null;

		const codeIndent = context.info.contentIndent + 4;

		if (context.sourceIndent < codeIndent) return null;

		return {
			sourceIndentLength: sourceMarkdownIndentLengthForWidth(text, codeIndent),
			sourceIndentWidth: codeIndent,
			visualIndent: context.visualIndent
		};
	}

	private indentedBlockForLine(lineNumber: number): SourceBlock | null {
		const text = this.lineText(lineNumber);

		if (!text.trim() || leadingMarkdownIndent(text) < 4) return null;

		let start = lineNumber;
		let end = lineNumber;

		for (let previous = lineNumber - 1; previous >= 1; previous -= 1) {
			const previousText = this.lineText(previous);

			if (previousText.trim() && leadingMarkdownIndent(previousText) < 4) break;

			start = previous;
		}

		for (let next = lineNumber + 1; next <= this.lineCount; next += 1) {
			const nextText = this.lineText(next);

			if (nextText.trim() && leadingMarkdownIndent(nextText) < 4) break;

			end = next;
		}

		return { start, end, kind: 'indented' };
	}
}

export class MarkdownSourceModeDecider {
	readonly activeBlocks: SourceBlock[];
	readonly activeHeadingControlLines: Set<number>;
	readonly activeListControlLines: Set<number>;
	readonly model: PartialMarkdownTextModel;

	constructor(model: PartialMarkdownTextModel, lineRanges: MarkdownLineRange[]) {
		this.model = model;
		this.activeBlocks = activeSourceBlocksForLineRanges(model, lineRanges);
		this.activeHeadingControlLines = model.headingControlLineNumbersForRanges(lineRanges);
		this.activeListControlLines = model.listControlLineNumbersForRanges(lineRanges);
	}

	decisionForLine(lineNumber: number): SourceLineDecision {
		const block = blockForLine(this.activeBlocks, lineNumber);

		if (!block) {
			return {
				active: false,
				block: null,
				sourceClass: ''
			};
		}

		return {
			active: true,
			block,
			sourceClass: sourceBlockClass(block, lineNumber),
			attributes: sourceBlockAttributes(block)
		};
	}
}

export function blockForLine(blocks: SourceBlock[], lineNumber: number) {
	return blocks.find((block) => lineInBlock(lineNumber, block)) ?? null;
}

export function lineInBlock(lineNumber: number, block: SourceBlock) {
	return lineNumber >= block.start && lineNumber <= block.end;
}

export function markdownHeadingLine(text: string): MarkdownHeadingLine | null {
	const match = (/^(#{1,6})(\s+)(.*)/).exec(text);

	if (!match) return null;

	return {
		level: match[1].length,
		text: match[3].trim(),
		syntaxLength: match[1].length + match[2].length
	};
}

export function markdownListInfo(text: string): ListInfo | null {
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

export function markdownListContentOffset(text: string) {
	const match = (/^(\s*)((?:[-*+])|(?:\d+[.)]))(\s+)(?:\[([ xX])\]\s+)?/).exec(text);

	return match?.[0].length ?? 0;
}

export function markdownListInfoFallback(indent: string, marker: string): ListInfo {
	const indentWidthValue = markdownIndentWidth(indent);

	return {
		indent: indentWidthValue,
		contentIndent: indentWidthValue + markdownIndentWidth(`${marker} `),
		marker,
		task: false
	};
}

export function markdownListLayoutForItem(
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

export function isOrderedListMarker(marker: string) {
	return (/^\d+[.)]$/).test(marker);
}

export function ignoredLineNumbers(blocks: SourceBlock[]) {
	const lines = new Set<number>();

	for (const block of blocks) {
		for (let lineNumber = block.start; lineNumber <= block.end; lineNumber += 1) {
			lines.add(lineNumber);
		}
	}

	return lines;
}

function markdownHeadingModelFromParsed(
	headingItems: ParsedMarkdownHeading[],
	collapsedHeadingKeys: ReadonlySet<string>,
	collapseKey: (lineNumber: number) => string
): MarkdownHeadingModel {
	const headings = headingItems.map((heading) => ({
		...heading,
		collapseKey: collapseKey(heading.lineNumber)
	}));
	const items = new Map(headings.map((heading) => [heading.lineNumber, heading]));
	const collapsedAncestorByLine = new Map<number, number>();

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

function markdownListModelFromParsed(
	listItems: ParsedMarkdownListItem[],
	ownerEntries: Array<{ lineNumber: number; itemLineNumber: number }>,
	collapsedListItemKeys: ReadonlySet<string>,
	collapseKey: (lineNumber: number) => string
): MarkdownListModel {
	const itemEntries = listItems.map((item) => [
		item.lineNumber,
		{
			...item,
			collapseKey: collapseKey(item.lineNumber)
		}
	] as const);
	const items = new Map<number, MarkdownListItem>(itemEntries);
	const ownerByLine = new Map<number, MarkdownListItem>();
	const collapsedAncestorByLine = new Map<number, number>();

	for (const { lineNumber, itemLineNumber } of ownerEntries) {
		const item = items.get(itemLineNumber);

		if (item) ownerByLine.set(lineNumber, item);
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

function activeSourceBlocksForLineRanges(
	model: PartialMarkdownTextModel,
	lineRanges: MarkdownLineRange[]
) {
	const blocks: SourceBlock[] = [];

	for (const range of lineRanges) {
		for (let lineNumber = range.startLine; lineNumber <= range.endLine; lineNumber += 1) {
			const block = model.sourceBlockForLine(lineNumber);

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

function sourceBlockClass(block: SourceBlock, lineNumber: number) {
	const listSubtree = typeof block.listEditBaseVisualIndent === 'number'
		? ' cm-active-list-subtree-line'
		: '';

	if (block.start === block.end) return `cm-active-source-line${listSubtree}`;

	const edge = lineNumber === block.start
		? 'cm-active-block-start'
		: lineNumber === block.end ? 'cm-active-block-end' : 'cm-active-block-middle';

	return `cm-active-source-line cm-active-block-line ${edge}${listSubtree}`;
}

function sourceBlockAttributes(block: SourceBlock) {
	if (typeof block.listEditBaseVisualIndent !== 'number') return undefined;

	return {
		style: `--active-list-base-indent: ${block.listEditBaseVisualIndent}px;`
	};
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

function markdownListMarkerOffset(info: ListInfo, displayMarker = info.marker) {
	if (info.task) return 30;
	if (isOrderedListMarker(displayMarker)) return Math.max(22, displayMarker.length * 9 + 5);

	return 12;
}
