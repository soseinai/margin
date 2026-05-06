import { WidgetType, type EditorView } from '@codemirror/view';

import { collapseToggleButton, type MarkdownCollapseToggle } from './shared';

export class HeadingCollapseToggleWidget extends WidgetType {
	key = '';
	collapsed = false;
	lineNumber = 1;
	onToggle: MarkdownCollapseToggle;

	constructor(key: string, collapsed: boolean, lineNumber: number, onToggle: MarkdownCollapseToggle) {
		super();
		this.key = key;
		this.collapsed = collapsed;
		this.lineNumber = lineNumber;
		this.onToggle = onToggle;
	}

	eq(other: WidgetType) {
		return other instanceof HeadingCollapseToggleWidget
			&& other.key === this.key
			&& other.collapsed === this.collapsed
			&& other.lineNumber === this.lineNumber;
	}

	toDOM(view: EditorView) {
		const button = collapseToggleButton(
			'heading-collapse-toggle',
			`markdown-heading-collapse-toggle${this.collapsed ? ' is-collapsed' : ''}`,
			this.collapsed ? 'Expand heading section' : 'Collapse heading section',
			!this.collapsed
		);

		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();

			this.onToggle(view, this.key, this.lineNumber);
			view.focus();
		});

		return button;
	}

	ignoreEvent() {
		return false;
	}
}
