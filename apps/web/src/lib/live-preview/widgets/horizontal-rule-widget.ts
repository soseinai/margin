import { WidgetType, type EditorView } from '@codemirror/view';

export class HorizontalRuleWidget extends WidgetType {
	lineNumber = 1;

	constructor(lineNumber: number) {
		super();
		this.lineNumber = lineNumber;
	}

	eq(other: WidgetType) {
		return other instanceof HorizontalRuleWidget && other.lineNumber === this.lineNumber;
	}

	toDOM(view: EditorView) {
		const rule = document.createElement('div');

		rule.className = 'markdown-horizontal-rule-widget';
		rule.tabIndex = 0;
		rule.setAttribute('role', 'separator');
		rule.setAttribute('aria-label', 'Edit horizontal rule');

		const editRule = (event: Event) => {
			event.preventDefault();

			const line = view.state.doc.line(Math.min(this.lineNumber, view.state.doc.lines));

			view.dispatch({ selection: { anchor: line.from } });
			view.focus();
		};

		rule.addEventListener('mousedown', editRule);

		rule.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') editRule(event);
		});

		return rule;
	}

	ignoreEvent() {
		return false;
	}
}
