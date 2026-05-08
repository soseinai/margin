<script lang="ts">
	import UnlinkIcon from '@lucide/svelte/icons/unlink';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	export let open = false;
	export let title = '';
	export let message = '';
	export let detail = '';
	export let closeDialog: () => void = () => {};
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="settings-dialog app-notice-dialog"
		aria-labelledby="app-notice-title"
		aria-describedby="app-notice-message"
		showCloseButton={false}
	>
		<section class="app-notice-body">
			<div class="app-notice-icon" aria-hidden="true">
				<UnlinkIcon />
			</div>

			<div class="app-notice-copy">
				<Dialog.Title id="app-notice-title">{title}</Dialog.Title>
				<Dialog.Description id="app-notice-message" class="app-notice-message">
					{message}
				</Dialog.Description>

				{#if detail}
					<p class="app-notice-detail">{detail}</p>
				{/if}
			</div>
		</section>

		<div class="app-notice-actions">
			<Button
				size="sm"
				class="app-notice-confirm"
				onclick={closeDialog}
			>OK</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
