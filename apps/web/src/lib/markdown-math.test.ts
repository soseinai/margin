import { describe, expect, it } from 'vitest';
import { inlineMarkdownMathSpans, markdownMathBlocksForLines } from './markdown-math';

describe('markdown math parsing', () => {
	it('finds inline dollar math spans', () => {
		expect(inlineMarkdownMathSpans('Energy is $E = mc^2$ in text.')).toEqual([
			{
				from: 10,
				to: 20,
				source: 'E = mc^2',
				displayMode: false
			}
		]);
	});

	it('trims padding inside inline math delimiters', () => {
		expect(inlineMarkdownMathSpans('Use $ x + y $ here.')).toEqual([
			{
				from: 4,
				to: 13,
				source: 'x + y',
				displayMode: false
			}
		]);
	});

	it('ignores empty padded inline math delimiters', () => {
		expect(inlineMarkdownMathSpans('Use $ $ here and $   $ before $y$.')).toEqual([
			{
				from: 30,
				to: 33,
				source: 'y',
				displayMode: false
			}
		]);
	});

	it('ignores escaped delimiters and likely currency', () => {
		expect(inlineMarkdownMathSpans(String.raw`Cost is $5 and literal \$x$ here.`)).toEqual([]);
	});

	it('does not treat display delimiters as inline math', () => {
		expect(inlineMarkdownMathSpans('Use $$x^2$$ as display math.')).toEqual([]);
	});

	it('respects a content offset from list or quote syntax', () => {
		expect(inlineMarkdownMathSpans('- $not-math$ then $x + y$', 2)).toEqual([
			{
				from: 2,
				to: 12,
				source: 'not-math',
				displayMode: false
			},
			{
				from: 18,
				to: 25,
				source: 'x + y',
				displayMode: false
			}
		]);
	});

	it('finds single-line display math blocks', () => {
		expect(markdownMathBlocksForLines(['# Title', '$$ a^2 + b^2 = c^2 $$'])).toEqual([
			{
				start: 2,
				end: 2,
				source: 'a^2 + b^2 = c^2',
				raw: '$$ a^2 + b^2 = c^2 $$'
			}
		]);
	});

	it('finds multiline display math blocks', () => {
		expect(markdownMathBlocksForLines(['$$', '\\int_0^1 x^2 dx', '$$', 'after'])).toEqual([
			{
				start: 1,
				end: 3,
				source: '\\int_0^1 x^2 dx',
				raw: '$$\n\\int_0^1 x^2 dx\n$$'
			}
		]);
	});

	it('skips ignored lines such as fenced code blocks', () => {
		expect(markdownMathBlocksForLines(['```', '$$ x $$', '```'], new Set([1, 2, 3]))).toEqual([]);
	});
});
