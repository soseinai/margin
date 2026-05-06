import { WidgetType, type EditorView } from '@codemirror/view';

export class TaskCheckboxWidget extends WidgetType {
	checked = false;
	checkPosition = 0;

	constructor(checked: boolean, checkPosition: number) {
		super();
		this.checked = checked;
		this.checkPosition = checkPosition;
	}

	eq(other: WidgetType) {
		return other instanceof TaskCheckboxWidget && other.checked === this.checked && other.checkPosition === this.checkPosition;
	}

	toDOM(view: EditorView) {
		const button = document.createElement('button');

		button.type = 'button';
		button.dataset.slot = 'task-checkbox';
		button.className = `task-checkbox-widget${this.checked ? ' checked' : ''}`;
		button.setAttribute('aria-label', this.checked ? 'Mark task incomplete' : 'Mark task complete');
		button.setAttribute('aria-checked', String(this.checked));
		button.setAttribute('role', 'checkbox');
		button.addEventListener('mousedown', (event) => event.preventDefault());

		button.addEventListener('click', (event) => {
			event.preventDefault();

			view.dispatch({
				changes: {
					from: this.checkPosition,
					to: this.checkPosition + 1,
					insert: this.checked ? ' ' : 'x'
				}
			});

			view.focus();
		});

		return button;
	}

	ignoreEvent() {
		return false;
	}
}
