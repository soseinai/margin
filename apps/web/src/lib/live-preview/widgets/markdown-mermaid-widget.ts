import { WidgetType, type EditorView } from '@codemirror/view';

import {
	mermaidThemeKey,
	renderMermaidIntoElement
} from '../mermaid';

export class MarkdownMermaidWidget extends WidgetType {
	source = '';
	lineNumber = 1;
	editPosition = 0;
	key = '';
	themeKey = '';
	onGeometryChange?: () => void;

	constructor(source: string, lineNumber: number, editPosition: number, onGeometryChange?: () => void) {
		super();
		this.source = source;
		this.lineNumber = lineNumber;
		this.editPosition = editPosition;
		this.themeKey = mermaidThemeKey();
		this.key = `${this.themeKey}:${source}:${lineNumber}:${editPosition}`;
		this.onGeometryChange = onGeometryChange;
	}

	eq(other: WidgetType) {
		return other instanceof MarkdownMermaidWidget && other.key === this.key;
	}

	toDOM(view: EditorView) {
		const wrapper = document.createElement('figure');
		const body = document.createElement('div');

		wrapper.className = 'markdown-mermaid-widget';
		wrapper.tabIndex = 0;
		wrapper.setAttribute('role', 'button');
		wrapper.setAttribute('aria-label', 'Edit Mermaid chart');
		body.className = 'markdown-mermaid-body';
		body.textContent = this.source.trim() ? 'Rendering Mermaid chart...' : 'Empty Mermaid chart';
		wrapper.append(body);

		void renderMermaidIntoElement(body, this.source, { view, onGeometryChange: this.onGeometryChange });

		const editMermaid = (event: Event) => {
			event.preventDefault();

			const position = Math.min(this.editPosition, view.state.doc.length);

			view.dispatch({ selection: { anchor: position } });
			view.focus();
		};

		wrapper.addEventListener('mousedown', editMermaid);

		wrapper.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') editMermaid(event);
		});

		return wrapper;
	}

	ignoreEvent() {
		return false;
	}
}
