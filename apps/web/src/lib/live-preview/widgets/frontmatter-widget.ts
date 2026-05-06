import { WidgetType, type EditorView } from '@codemirror/view';

import type { MarkdownFrontmatter } from '../../markdown-frontmatter';

export class FrontmatterWidget extends WidgetType {
	frontmatter: MarkdownFrontmatter;
	startLine = 1;
	key = '';

	constructor(frontmatter: MarkdownFrontmatter, startLine: number) {
		super();
		this.frontmatter = frontmatter;
		this.startLine = startLine;
		this.key = JSON.stringify(frontmatter);
	}

	eq(other: WidgetType) {
		return other instanceof FrontmatterWidget && other.startLine === this.startLine && other.key === this.key;
	}

	toDOM(view: EditorView) {
		const wrapper = document.createElement('div');

		wrapper.className = 'markdown-frontmatter-widget';
		wrapper.tabIndex = 0;
		wrapper.setAttribute('role', 'button');
		wrapper.setAttribute('aria-label', 'Edit front matter');

		const title = document.createElement('div');

		title.className = 'markdown-frontmatter-title';
		title.textContent = 'front matter';
		wrapper.append(title);

		if (this.frontmatter.entries.length > 0) {
			const list = document.createElement('dl');

			list.className = 'markdown-frontmatter-list';

			this.frontmatter.entries.forEach((entry) => {
				const key = document.createElement('dt');
				const value = document.createElement('dd');

				key.textContent = entry.key;
				value.textContent = entry.value;
				list.append(key, value);
			});

			wrapper.append(list);
		} else {
			const raw = document.createElement('pre');

			raw.className = 'markdown-frontmatter-raw';
			raw.textContent = this.frontmatter.rawLines.filter((line) => line.trim()).join('\n');
			wrapper.append(raw);
		}

		const editFrontmatter = (event: Event) => {
			event.preventDefault();

			const line = view.state.doc.line(Math.min(this.startLine, view.state.doc.lines));

			view.dispatch({ selection: { anchor: line.from } });
			view.focus();
		};

		wrapper.addEventListener('mousedown', editFrontmatter);

		wrapper.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') editFrontmatter(event);
		});

		return wrapper;
	}

	ignoreEvent() {
		return false;
	}
}
