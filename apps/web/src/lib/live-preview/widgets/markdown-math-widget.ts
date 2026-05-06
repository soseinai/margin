import { WidgetType, type EditorView } from '@codemirror/view';
import katex from 'katex';

export class MarkdownMathWidget extends WidgetType {
	source = '';
	displayMode = false;
	lineNumber = 1;
	editPosition = 0;
	key = '';

	constructor(source: string, displayMode: boolean, lineNumber: number, editPosition: number) {
		super();
		this.source = source;
		this.displayMode = displayMode;
		this.lineNumber = lineNumber;
		this.editPosition = editPosition;
		this.key = `${displayMode}:${source}:${lineNumber}:${editPosition}`;
	}

	eq(other: WidgetType) {
		return other instanceof MarkdownMathWidget && other.key === this.key;
	}

	toDOM(view: EditorView) {
		const wrapper = document.createElement('span');

		wrapper.className = `markdown-math-widget ${this.displayMode ? 'display' : 'inline'}`;
		wrapper.tabIndex = 0;
		wrapper.setAttribute('role', 'button');
		wrapper.setAttribute('aria-label', this.displayMode ? 'Edit display math' : 'Edit inline math');

		try {
			katex.render(this.source, wrapper, {
				displayMode: this.displayMode,
				throwOnError: false,
				strict: 'ignore',
				trust: false
			});
		} catch (error) {
			wrapper.classList.add('is-error');
			wrapper.textContent = this.source;
			wrapper.title = error instanceof Error ? error.message : 'Unable to render math';
		}

		const editMath = (event: Event) => {
			event.preventDefault();

			const position = Math.min(this.editPosition, view.state.doc.length);

			view.dispatch({ selection: { anchor: position } });
			view.focus();
		};

		wrapper.addEventListener('mousedown', editMath);

		wrapper.addEventListener('keydown', (event) => {
			const keyboardEvent = event as KeyboardEvent;

			if (keyboardEvent.key === 'Enter') editMath(keyboardEvent);
		});

		return wrapper;
	}

	ignoreEvent() {
		return false;
	}
}
