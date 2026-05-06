<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import type { EditingMode } from '$lib/app-types';

	export let editMode: EditingMode;
	export let className = '';
	export let itemClassName = '';
	export let setEditingMode: (mode: EditingMode) => void = () => {};

	function itemClass(mode: EditingMode) {
		return `${itemClassName}${editMode === mode ? ' active' : ''}`;
	}
</script>

<ToggleGroup.Root
	class={className}
	aria-label="Editing mode"
	type="single"
	value={editMode}
>
	<ToggleGroup.Item
		class={itemClass('edit')}
		value="edit"
		aria-label="Edit directly"
		title="Edit directly"
		onclick={() => setEditingMode('edit')}
	>
		<span
			class="mode-icon mode-icon-edit"
			aria-hidden="true"
		>
			<span class="edit-glyph-letter">A</span>
			<span class="edit-glyph-caret"></span>
		</span>
	</ToggleGroup.Item>

	<ToggleGroup.Item
		class={itemClass('suggest')}
		value="suggest"
		aria-label="Suggest edits"
		title="Suggest edits"
		onclick={() => setEditingMode('suggest')}
	>
		<svg
			class="mode-icon mode-icon-suggest"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path d="M6 5v14"></path>
			<path d="M10 7h8"></path>
			<path d="M10 12h6"></path>
			<path d="M10 17h4"></path>
			<path d="M17 15l2 2 3-4"></path>
		</svg>
	</ToggleGroup.Item>
</ToggleGroup.Root>
