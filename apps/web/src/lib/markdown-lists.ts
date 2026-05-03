import {
	leadingMarkdownIndent,
	markdownIndentWidth
} from './markdown-indent';

type OrderedListContext = { indent: number; value: number };

export function orderedListMarkersForLines(lines: string[], ignoredLines = new Set<number>()) {
	const markers = new Map<number, string>();
	const stack: OrderedListContext[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const lineNumber = index + 1;

		if (ignoredLines.has(lineNumber)) continue;

		const text = lines[index];
		const ordered = orderedListItemInfo(text);

		if (ordered) {
			while (stack.length && stack[stack.length - 1].indent > ordered.indent) stack.pop();

			const current = stack[stack.length - 1];

			if (current?.indent === ordered.indent) {
				current.value += 1;
			} else {
				stack.push({
					indent: ordered.indent,
					value: ordered.value
				});
			}

			markers.set(lineNumber, `${stack[stack.length - 1].value}.`);

			continue;
		}

		const unordered = (/^(\s*)[-*+]\s+/).exec(text);

		if (unordered) {
			const indent = markdownIndentWidth(unordered[1]);
			while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

			continue;
		}

		if (text.trim()) {
			const indent = leadingMarkdownIndent(text);
			while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
		}
	}

	return markers;
}

function orderedListItemInfo(text: string) {
	const match = (/^(\s*)(\d+)[.)]\s+(?:\[[ xX]\]\s+)?/).exec(text);

	if (!match) return null;

	return {
		indent: markdownIndentWidth(match[1]),
		value: Number(match[2])
	};
}
