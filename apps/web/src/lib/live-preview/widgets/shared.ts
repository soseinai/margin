import type { EditorView } from '@codemirror/view';

export type MarkdownCollapseToggle = (view: EditorView, key: string, lineNumber: number) => void;

export type MarkdownImageWidgetOptions = {
	resolveImageSrc: (src: string) => string;
	onGeometryChange?: () => void
};

export function suggestionBadgeElement(label: string) {
	const badge = document.createElement('span');

	badge.className = 'annotation-badge';
	badge.textContent = label;

	return badge;
}

export function collapseToggleButton(
	slot: string,
	className: string,
	label: string,
	expanded: boolean
) {
	const button = document.createElement('button');

	button.type = 'button';
	button.dataset.slot = slot;
	button.className = className;
	button.setAttribute('aria-label', label);
	button.setAttribute('aria-expanded', String(expanded));

	const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

	icon.classList.add(slot === 'list-collapse-toggle' ? 'markdown-list-collapse-icon' : 'markdown-heading-collapse-icon');
	icon.setAttribute('aria-hidden', 'true');
	icon.setAttribute('focusable', 'false');
	icon.setAttribute('viewBox', '0 0 16 16');
	path.setAttribute('d', 'M4.75 6.25L8 9.5L11.25 6.25');
	icon.append(path);
	button.append(icon);

	button.addEventListener('mousedown', (event) => event.preventDefault());

	return button;
}
