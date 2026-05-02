export type MarkdownMathSpan = {
	from: number;
	to: number;
	source: string;
	displayMode: boolean
};

export type MarkdownMathBlock = {
	start: number;
	end: number;
	source: string;
	raw: string
};

export function inlineMarkdownMathSpans(text: string, contentOffset = 0): MarkdownMathSpan[] {
	const spans: MarkdownMathSpan[] = [];
	let index = Math.max(0, contentOffset);

	while (index < text.length) {
		if (!canOpenInlineMath(text, index)) {
			index += 1;
			continue;
		}

		const closeIndex = closingInlineMathDelimiter(text, index + 1);

		if (closeIndex < 0) {
			index += 1;
			continue;
		}

		const source = text.slice(index + 1, closeIndex).trim();

		if (!source) {
			index = closeIndex + 1;
			continue;
		}

		spans.push({
			from: index,
			to: closeIndex + 1,
			source,
			displayMode: false
		});

		index = closeIndex + 1;
	}

	return spans;
}

export function markdownMathBlocksForLines(
	lines: string[],
	ignoredLines = new Set<number>()
): MarkdownMathBlock[] {
	const blocks: MarkdownMathBlock[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const lineNumber = index + 1;

		if (ignoredLines.has(lineNumber)) continue;

		const line = lines[index];
		const singleLine = /^[ \t]{0,3}\$\$([\s\S]*?)\$\$[ \t]*$/.exec(line);

		if (singleLine && singleLine[1].trim()) {
			blocks.push({
				start: lineNumber,
				end: lineNumber,
				source: singleLine[1].trim(),
				raw: line
			});

			continue;
		}

		const opening = /^[ \t]{0,3}\$\$(.*)$/.exec(line);

		if (!opening) continue;

		const sourceLines = [opening[1]];
		let endIndex = -1;

		for (let closingIndex = index + 1; closingIndex < lines.length; closingIndex += 1) {
			const closingLineNumber = closingIndex + 1;

			if (ignoredLines.has(closingLineNumber)) break;

			if (/^[ \t]{0,3}\$\$[ \t]*$/.test(lines[closingIndex])) {
				endIndex = closingIndex;
				break;
			}

			sourceLines.push(lines[closingIndex]);
		}

		if (endIndex < 0) continue;

		const source = sourceLines.join('\n').trim();

		if (!source) continue;

		blocks.push({
			start: lineNumber,
			end: endIndex + 1,
			source,
			raw: lines.slice(index, endIndex + 1).join('\n')
		});

		index = endIndex;
	}

	return blocks;
}

function canOpenInlineMath(text: string, index: number) {
	if (
		text[index] !== '$'
		|| isEscaped(text, index)
		|| text[index - 1] === '$'
		|| text[index + 1] === '$'
	) return false;

	const next = text[index + 1];

	return Boolean(next) && !/\d/.test(next);
}

function closingInlineMathDelimiter(text: string, startIndex: number) {
	for (let index = startIndex; index < text.length; index += 1) {
		if (text[index] !== '$' || text[index + 1] === '$' || isEscaped(text, index)) continue;
		if (!canCloseInlineMath(text, index)) continue;

		return index;
	}

	return -1;
}

function canCloseInlineMath(text: string, index: number) {
	const previous = text[index - 1];
	const next = text[index + 1];

	return Boolean(previous) && previous !== '$' && !/\d/.test(next ?? '');
}

function isEscaped(text: string, index: number) {
	let slashCount = 0;

	for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
		slashCount += 1;
	}

	return slashCount % 2 === 1;
}
