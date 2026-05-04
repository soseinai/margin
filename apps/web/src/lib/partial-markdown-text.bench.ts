import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	initializePartialMarkdownParser,
	parsePartialMarkdownTextCore
} from './partial-markdown-core';
import {
	MarkdownSourceModeDecider,
	PartialMarkdownTextModel
} from './partial-markdown-text';

type BenchmarkCase = {
	name: string;
	text: string;
	iterations: number
};

type BenchmarkResult = {
	case: string;
	lines: number;
	bytes: number;
	operation: string;
	iterations: number;
	meanMs: string;
	p95Ms: string;
	minMs: string;
	maxMs: string
};

let sink = 0;

describe('partial markdown text benchmark', () => {
	beforeAll(async () => {
		const wasm = await readFile(resolve(process.cwd(), 'src/lib/generated/markdown-core/margin_markdown_core.wasm'));

		await initializePartialMarkdownParser(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
	});

	it('measures parser and source-mode costs for realistic documents', () => {
		const cases = benchmarkCases();
		const results: BenchmarkResult[] = [];

		for (const benchmarkCase of cases) {
			const parsed = parsePartialMarkdownTextCore(benchmarkCase.text);
			const model = new PartialMarkdownTextModel(parsed);
			const selectionLine = Math.max(1, Math.floor(model.lineCount * 0.6));
			const selection = [{ startLine: selectionLine, endLine: selectionLine }];

			results.push(measure(benchmarkCase, 'wasm parse + JSON', () => {
				const nextParsed = parsePartialMarkdownTextCore(benchmarkCase.text);

				sink += nextParsed.lines.length + nextParsed.listItems.length;
			}));
			results.push(measure(benchmarkCase, 'model from cached parse', () => {
				const nextModel = new PartialMarkdownTextModel(parsed);

				sink += nextModel.lineCount + nextModel.listModel.items.size;
			}));
			results.push(measure(benchmarkCase, 'model fromText (parse + wrap)', () => {
				const nextModel = PartialMarkdownTextModel.fromText(benchmarkCase.text);

				sink += nextModel.lineCount + nextModel.listModel.items.size;
			}));
			results.push(measure(benchmarkCase, 'source decider scan, cached model', () => {
				const decider = new MarkdownSourceModeDecider(model, selection);

				for (let lineNumber = 1; lineNumber <= model.lineCount; lineNumber += 1) {
					if (decider.decisionForLine(lineNumber).active) sink += lineNumber;
				}
			}));
			results.push(measure(benchmarkCase, 'cached parse model + decider scan', () => {
				const nextModel = new PartialMarkdownTextModel(parsed);
				const decider = new MarkdownSourceModeDecider(nextModel, selection);

				for (let lineNumber = 1; lineNumber <= nextModel.lineCount; lineNumber += 1) {
					if (decider.decisionForLine(lineNumber).active) sink += lineNumber;
				}
			}));
			results.push(measure(benchmarkCase, 'fromText model + decider scan', () => {
				const nextModel = PartialMarkdownTextModel.fromText(benchmarkCase.text);
				const decider = new MarkdownSourceModeDecider(nextModel, selection);

				for (let lineNumber = 1; lineNumber <= nextModel.lineCount; lineNumber += 1) {
					if (decider.decisionForLine(lineNumber).active) sink += lineNumber;
				}
			}));
		}

		process.stdout.write(`\n${renderBenchmarkResults(results)}\n`);

		expect(sink).toBeGreaterThan(0);
	});
});

function benchmarkCases(): BenchmarkCase[] {
	const scale = Number(process.env.MARGIN_MARKDOWN_BENCH_SCALE ?? '1');

	return [
		{
			name: 'small',
			text: benchmarkDocument(12),
			iterations: Math.max(5, Math.round(80 * scale))
		},
		{
			name: 'medium',
			text: benchmarkDocument(90),
			iterations: Math.max(3, Math.round(25 * scale))
		},
		{
			name: 'large',
			text: benchmarkDocument(320),
			iterations: Math.max(2, Math.round(8 * scale))
		}
	];
}

function measure(benchmarkCase: BenchmarkCase, operation: string, run: () => void): BenchmarkResult {
	const timings: number[] = [];

	for (let index = 0; index < Math.min(5, benchmarkCase.iterations); index += 1) {
		run();
	}

	for (let index = 0; index < benchmarkCase.iterations; index += 1) {
		const start = performance.now();

		run();

		timings.push(performance.now() - start);
	}

	timings.sort((left, right) => left - right);

	return {
		case: benchmarkCase.name,
		lines: lineCount(benchmarkCase.text),
		bytes: new TextEncoder().encode(benchmarkCase.text).length,
		operation,
		iterations: benchmarkCase.iterations,
		meanMs: formatMs(mean(timings)),
		p95Ms: formatMs(percentile(timings, 0.95)),
		minMs: formatMs(timings[0]),
		maxMs: formatMs(timings[timings.length - 1])
	};
}

function benchmarkDocument(sections: number) {
	const lines = [
		'---',
		'title: Benchmark document',
		'tags:',
		'  - margin',
		'  - benchmark',
		'---',
		''
	];

	for (let index = 0; index < sections; index += 1) {
		lines.push(
			`# Section ${index + 1}`,
			`Paragraph ${index + 1} with **bold**, _italic_, \`code\`, [link](https://example.com/${index}), $x_${index}$, and ~~removed~~ text.`,
			'',
			'- Parent item',
			'  - Child item',
			'    - Grandchild item',
			'  continuation text under child item',
			'      code under child item',
			'',
			'1. Ordered item',
			'2. Ordered item',
			'   1. Nested ordered item',
			'',
			'| Name | Value |',
			'| --- | :---: |',
			`| Row ${index + 1} | ${index * 7} |`,
			'',
			'$$',
			`x_${index} + y_${index}`,
			'$$',
			'',
			'```ts',
			`const value${index} = ${index};`,
			'```',
			''
		);
	}

	return lines.join('\n');
}

function lineCount(text: string) {
	return text.split('\n').length;
}

function mean(values: number[]) {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number) {
	const index = Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1);

	return values[index];
}

function formatMs(value: number) {
	return value.toFixed(3);
}

function renderBenchmarkResults(results: BenchmarkResult[]) {
	const columns = [
		'case',
		'lines',
		'bytes',
		'operation',
		'iterations',
		'meanMs',
		'p95Ms',
		'minMs',
		'maxMs'
	] as const;
	const widths = Object.fromEntries(columns.map((column) => [
		column,
		Math.max(
			column.length,
			...results.map((result) => String(result[column]).length)
		)
	])) as Record<(typeof columns)[number], number>;
	const row = (values: Record<(typeof columns)[number], string | number>) => columns
		.map((column) => String(values[column]).padEnd(widths[column]))
		.join('  ');
	const separator = columns
		.map((column) => '-'.repeat(widths[column]))
		.join('  ');

	return [
		'Margin Markdown benchmark',
		row(Object.fromEntries(columns.map((column) => [column, column])) as Record<(typeof columns)[number], string>),
		separator,
		...results.map(row)
	].join('\n');
}
