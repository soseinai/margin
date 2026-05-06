<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import type { ThreadView } from '$lib/app-types';

	type MaybePromise<T = void> = T | Promise<T>;

	export let open = false;
	export let includeMarginNotesAppendix = true;
	export let printAppendixCandidateThreads: ThreadView[] = [];
	export let confirmPrintDocument: () => MaybePromise = () => {};
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="settings-dialog print-options-dialog"
		aria-labelledby="print-options-title"
		showCloseButton={false}
	>
		<form onsubmit={(event) => {
			event.preventDefault();
			confirmPrintDocument();
		}}>
			<Dialog.Header class="settings-dialog-header">
				<div>
					<p class="eyebrow">Margin</p>
					<Dialog.Title id="print-options-title">Print</Dialog.Title>
				</div>

				<Button
					variant="ghost"
					size="icon-sm"
					class="icon-button"
					aria-label="Close print options"
					onclick={() => open = false}
				>
					<XIcon aria-hidden="true" />
				</Button>
			</Dialog.Header>

			<fieldset class="settings-fieldset print-options-fieldset">
				<label class="print-option-checkbox" for="print-include-margin-notes">
					<input
						id="print-include-margin-notes"
						type="checkbox"
						bind:checked={includeMarginNotesAppendix}
						disabled={printAppendixCandidateThreads.length === 0}
					/>
					<span>Include margin notes appendix</span>
				</label>
			</fieldset>

			<Dialog.Footer class="settings-actions">
				<Button
					variant="outline"
					size="sm"
					class="ghost-button"
					onclick={() => open = false}
				>Cancel</Button>

				<Button
					size="sm"
					class="primary"
					type="submit"
				>Print</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
