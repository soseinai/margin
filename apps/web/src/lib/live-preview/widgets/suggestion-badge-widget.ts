import { WidgetType } from '@codemirror/view';

import type { SuggestionStatus, SuggestionSurfaceKind } from '../../app-types';
import { suggestionBadgeElement } from './shared';

export class SuggestionBadgeWidget extends WidgetType {
	id = '';
	label = '';
	pending = false;
	status: SuggestionStatus = 'applied';
	focused = false;
	kind: SuggestionSurfaceKind = 'replace';

	constructor(
		id: string,
		label: string,
		pending = false,
		status: SuggestionStatus = 'applied',
		focused = false,
		kind: SuggestionSurfaceKind = 'replace'
	) {
		super();
		this.id = id;
		this.label = label;
		this.pending = pending;
		this.status = status;
		this.focused = focused;
		this.kind = kind;
	}

	eq(other: WidgetType) {
		return other instanceof SuggestionBadgeWidget && other.id === this.id && other.label === this.label && other.pending === this.pending && other.status === this.status && other.focused === this.focused && other.kind === this.kind;
	}

	toDOM() {
		const badge = suggestionBadgeElement(this.label);

		badge.classList.add('inline-suggestion-badge', `suggestion-${this.kind}`, `is-${this.status}`);

		if (this.pending) badge.classList.add('pending');
		if (this.focused) badge.classList.add('is-focused');

		badge.dataset.threadAnchor = this.id;

		return badge;
	}
}
