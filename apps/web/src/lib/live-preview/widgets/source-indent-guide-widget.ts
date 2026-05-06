import { WidgetType } from '@codemirror/view';

export class SourceIndentGuideWidget extends WidgetType {
	toDOM() {
		const guide = document.createElement('span');

		guide.className = 'cm-source-indent-guide';
		guide.setAttribute('aria-hidden', 'true');

		return guide;
	}
}
