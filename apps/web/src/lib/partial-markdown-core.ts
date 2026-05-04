import wasmUrl from './generated/markdown-core/margin_markdown_core.wasm?url';

export type ParsedPartialMarkdownTextCore = {
	lines: string[];
	frontmatterBlocks: ParsedSourceBlock[];
	fencedBlocks: ParsedSourceBlock[];
	tableBlocks: ParsedSourceBlock[];
	mathBlocks: ParsedSourceBlock[];
	headingItems: ParsedMarkdownHeading[];
	orderedListMarkers: Array<{ lineNumber: number; marker: string }>;
	listItems: ParsedMarkdownListItem[];
	listOwnerByLine: Array<{ lineNumber: number; itemLineNumber: number }>
};

export type ParsedSourceBlock = {
	start: number;
	end: number;
	kind: 'frontmatter' | 'fenced-code' | 'table' | 'math';
	language?: string;
	frontmatter?: {
		entries: Array<{ key: string; value: string }>;
		rawLines: string[]
	};
	math?: {
		start: number;
		end: number;
		source: string;
		raw: string
	};
	table?: {
		headers: string[];
		alignments: Array<'left' | 'center' | 'right' | null>;
		rows: string[][]
	}
};

export type ParsedMarkdownHeading = {
	blockEnd: number;
	level: number;
	lineNumber: number;
	text: string
};

export type ParsedMarkdownListItem = {
	blockEnd: number;
	childLines: number[];
	info: {
		indent: number;
		contentIndent: number;
		marker: string;
		task: boolean
	};
	layout: {
		depth: number;
		marker: string;
		markerOffset: number;
		markerX: number;
		textX: number
	};
	lineNumber: number;
	parentLine: number | null
};

type MarkdownCoreExports = {
	memory: WebAssembly.Memory;
	margin_markdown_alloc(size: number): number;
	margin_markdown_dealloc(pointer: number, size: number): void;
	margin_markdown_parse(pointer: number, size: number): number
};

let parser: MarkdownCoreParser | null = null;
let initialization: Promise<void> | null = null;

export function parsePartialMarkdownTextCore(text: string): ParsedPartialMarkdownTextCore {
	if (!parser) {
		throw new Error('Margin Markdown core is not initialized.');
	}

	return parser.parse(text);
}

export function initializePartialMarkdownParser(bytes?: BufferSource) {
	initialization ??= initializeParser(bytes);

	return initialization;
}

async function initializeParser(bytes?: BufferSource) {
	bytes ??= await loadWasmBytes();
	const { instance } = await WebAssembly.instantiate(bytes, {});

	parser = new MarkdownCoreParser(instance.exports as MarkdownCoreExports);
}

async function loadWasmBytes() {
	const response = await fetch(wasmUrl);

	if (!response.ok) {
		throw new Error(`Failed to load Margin Markdown core from ${wasmUrl}: ${response.status}`);
	}

	return response.arrayBuffer();
}

class MarkdownCoreParser {
	#decoder = new TextDecoder();
	#encoder = new TextEncoder();
	#exports: MarkdownCoreExports;

	constructor(exports: MarkdownCoreExports) {
		this.#exports = exports;
	}

	parse(text: string): ParsedPartialMarkdownTextCore {
		const input = this.#encoder.encode(text);
		const inputPointer = this.#exports.margin_markdown_alloc(input.length);

		new Uint8Array(this.#exports.memory.buffer, inputPointer, input.length).set(input);

		const outputPointer = this.#exports.margin_markdown_parse(inputPointer, input.length);

		this.#exports.margin_markdown_dealloc(inputPointer, input.length);

		const outputLength = new DataView(this.#exports.memory.buffer, outputPointer, 4).getUint32(0, true);
		const outputBytes = new Uint8Array(this.#exports.memory.buffer, outputPointer + 4, outputLength);
		const json = this.#decoder.decode(outputBytes.slice());

		this.#exports.margin_markdown_dealloc(outputPointer, outputLength + 4);

		return JSON.parse(json) as ParsedPartialMarkdownTextCore;
	}
}
