<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import XIcon from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/ui/button/index.js';
	import type { AppUpdateCheckState, AppUpdateMetadata } from '$lib/app-types';

	type MaybePromise<T = void> = T | Promise<T>;

	export let availableAppUpdate: AppUpdateMetadata;
	export let updateCheckState: AppUpdateCheckState = 'idle';
	export let updateNoticeVisible = true;
	export let installDesktopUpdate: () => MaybePromise = () => {};
</script>

<div class="app-update-notice" role="status" aria-live="polite">
	<div class="app-update-copy">
		<span class="app-update-title">Update {availableAppUpdate.version}</span>
		<span class="app-update-detail">
			{updateCheckState === 'installing' ? 'Installing' : 'Ready to install'}
		</span>
	</div>

	<Button
		size="sm"
		class="primary app-update-install"
		onclick={installDesktopUpdate}
		disabled={updateCheckState === 'installing'}
	>
		<DownloadIcon aria-hidden="true" />
		<span>{updateCheckState === 'installing' ? 'Installing' : 'Install'}</span>
	</Button>

	<Button
		variant="ghost"
		size="icon-sm"
		class="icon-button app-update-dismiss"
		aria-label="Dismiss update"
		onclick={() => updateNoticeVisible = false}
		disabled={updateCheckState === 'installing'}
	>
		<XIcon aria-hidden="true" />
	</Button>
</div>
