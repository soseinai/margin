import { WidgetType } from '@codemirror/view';

import type { SuggestionStatus, SuggestionSurfaceKind } from '../../app-types';
import { suggestionBadgeElement } from './shared';

export class SuggestionWidget extends WidgetType {
	text = '';
	id = '';
	pending = false;
	status: SuggestionStatus = 'applied';
	focused = false;
	label = '';
	kind: SuggestionSurfaceKind = 'replace';

	constructor(
		text: string,
		id: string,
		pending = false,
		status: SuggestionStatus = 'applied',
		focused = false,
		label = 'edit',
		kind: SuggestionSurfaceKind = 'replace'
	) {
		super();
		this.text = text;
		this.id = id;
		this.pending = pending;
		this.status = status;
		this.focused = focused;
		this.label = label;
		this.kind = kind;
	}

	eq(other: WidgetType) {
		return other instanceof SuggestionWidget && other.text === this.text && other.id === this.id && other.pending === this.pending && other.status === this.status && other.focused === this.focused && other.label === this.label && other.kind === this.kind;
	}

	toDOM() {
		const mark = document.createElement('mark');

		mark.className = `annotation-mark suggestion suggestion-${this.kind}${this.text ? '' : ' empty-change'}${this.pending ? ' pending' : ''} is-${this.status}${this.focused ? ' is-focused' : ''}`;
		mark.dataset.threadAnchor = this.id;

		if (this.text) {
			mark.append(document.createTextNode(this.text));
		}

		mark.append(suggestionBadgeElement(this.label));

		return mark;
	}
}
