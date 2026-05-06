import { WidgetType } from '@codemirror/view';

export class CodeLanguageLabelWidget extends WidgetType {
	language = '';

	constructor(language: string) {
		super();
		this.language = language;
	}

	eq(other: WidgetType) {
		return other instanceof CodeLanguageLabelWidget && other.language === this.language;
	}

	toDOM() {
		const label = document.createElement('span');

		label.className = 'markdown-code-language-label';
		label.textContent = this.language;
		label.setAttribute('aria-label', `Code language: ${this.language}`);

		return label;
	}
}
