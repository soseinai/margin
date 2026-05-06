import { WidgetType, type EditorView } from '@codemirror/view';

import type { MarkdownTable, MarkdownTableAlignment } from '../../markdown-tables';

export class MarkdownTableWidget extends WidgetType {
	table: MarkdownTable;
	startLine = 1;
	key = '';

	constructor(table: MarkdownTable, startLine: number) {
		super();
		this.table = table;
		this.startLine = startLine;
		this.key = JSON.stringify(table);
	}

	eq(other: WidgetType) {
		return other instanceof MarkdownTableWidget && other.startLine === this.startLine && other.key === this.key;
	}

	toDOM(view: EditorView) {
		const wrapper = document.createElement('div');

		wrapper.className = 'markdown-table-widget';
		wrapper.tabIndex = 0;
		wrapper.setAttribute('role', 'button');
		wrapper.setAttribute('aria-label', 'Edit Markdown table');

		const table = document.createElement('table');
		const thead = document.createElement('thead');
		const headerRow = document.createElement('tr');

		this.table.headers.forEach((header, index) => {
			const cell = document.createElement('th');

			cell.textContent = header;
			setTableCellAlignment(cell, this.table.alignments[index]);
			headerRow.append(cell);
		});

		thead.append(headerRow);
		table.append(thead);

		const tbody = document.createElement('tbody');

		this.table.rows.forEach((row) => {
			const tableRow = document.createElement('tr');

			for (let index = 0; index < this.table.headers.length; index += 1) {
				const cell = document.createElement('td');

				cell.textContent = row[index] ?? '';
				setTableCellAlignment(cell, this.table.alignments[index]);
				tableRow.append(cell);
			}

			tbody.append(tableRow);
		});

		table.append(tbody);
		wrapper.append(table);

		const editTable = (event: Event) => {
			event.preventDefault();

			const line = view.state.doc.line(Math.min(this.startLine, view.state.doc.lines));

			view.dispatch({ selection: { anchor: line.from } });
			view.focus();
		};

		wrapper.addEventListener('mousedown', editTable);

		wrapper.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') editTable(event);
		});

		return wrapper;
	}

	ignoreEvent() {
		return false;
	}
}

function setTableCellAlignment(
	cell: HTMLTableCellElement,
	alignment: MarkdownTableAlignment
) {
	if (alignment) cell.dataset.align = alignment;
}
