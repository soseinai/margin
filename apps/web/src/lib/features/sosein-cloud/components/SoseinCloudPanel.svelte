<script lang="ts">
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	import { Button } from '$lib/components/ui/button/index.js';
	import type { SoseinActiveDocument } from '$lib/app-types';
	import type {
		SoseinDocument,
		SoseinDocumentSummary,
		SoseinStoredSession
	} from '$lib/features/sosein-cloud/sosein-cloud';
	import type { SoseinSyncStatus } from '$lib/features/sosein-cloud/sosein-codemirror-sync';
	import { onDestroy } from 'svelte';

	type MaybePromise<T = void> = T | Promise<T>;

	const minWidth = 220;
	const maxWidth = 520;
	const resizeStep = 20;

	export let session: SoseinStoredSession | null = null;
	export let documents: SoseinDocumentSummary[] = [];
	export let documentsLoading = false;
	export let authLoading = false;
	export let documentOpening = false;
	export let error = '';
	export let newDocumentTitle = 'Untitled';
	export let activeDocument: SoseinActiveDocument | null = null;
	export let syncStatus: SoseinSyncStatus = 'disconnected';
	export let width = 300;
	export let disconnectSession: () => void = () => {};
	export let startOAuthLogin: () => MaybePromise = () => {};
	export let refreshDocuments: () => MaybePromise = () => {};
	export let createDocument: () => MaybePromise = () => {};
	export let openDocument: (document: SoseinDocumentSummary | SoseinDocument) => MaybePromise = () => {};
	export let syncStatusLabel: (status: SoseinSyncStatus) => string = (status) => status;

	let resizing = false;
	let activeResizeStop: (() => void) | null = null;

	$: workspaceName = session?.defaultWorkspace.name || 'Cloud documents';
	$: accountLabel = session ? session.user.email : 'Not connected';

	onDestroy(() => {
		activeResizeStop?.();
	});

	function startResize(event: PointerEvent) {
		event.preventDefault();
		activeResizeStop?.();
		resizing = true;

		const startX = event.clientX;
		const startWidth = width;

		const resize = (moveEvent: PointerEvent) => {
			width = clampNumber(startWidth + moveEvent.clientX - startX, minWidth, maxWidth);
		};

		const stopResize = () => {
			resizing = false;
			window.removeEventListener('pointermove', resize);
			window.removeEventListener('pointerup', stopResize);
			window.removeEventListener('pointercancel', stopResize);
			activeResizeStop = null;
		};

		activeResizeStop = stopResize;
		window.addEventListener('pointermove', resize);
		window.addEventListener('pointerup', stopResize);
		window.addEventListener('pointercancel', stopResize);
	}

	function handleResizeKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			width = clampNumber(width - resizeStep, minWidth, maxWidth);
		}

		if (event.key === 'ArrowRight') {
			event.preventDefault();
			width = clampNumber(width + resizeStep, minWidth, maxWidth);
		}
	}

	function clampNumber(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}
</script>

<aside
	class="file-tree-panel sosein-cloud-panel"
	class:resizing
	aria-label="Sosein Cloud documents"
>
	<button
		class="file-tree-resizer"
		type="button"
		aria-label="Resize cloud documents"
		onpointerdown={startResize}
		onkeydown={handleResizeKeydown}
	></button>

	<div class="file-tree-content sosein-cloud-panel-content">
		<header class="file-tree-header">
			<div class="file-tree-heading">
				<p class="file-tree-eyebrow">Sosein Cloud</p>
				<h2>{workspaceName}</h2>
			</div>

			<Button
				variant="ghost"
				size="icon-sm"
				class="topbar-icon-button"
				aria-label="Refresh cloud documents"
				title="Refresh"
				onclick={refreshDocuments}
				disabled={!session || documentsLoading}
			>
				<RefreshCwIcon aria-hidden="true" />
			</Button>
		</header>

		<div class="sosein-cloud-account-row">
			<span class="sosein-cloud-account-icon" aria-hidden="true">
				<CloudIcon />
			</span>
			<span class="sosein-cloud-account-text">{accountLabel}</span>

			{#if session}
				<Button
					variant="ghost"
					size="sm"
					class="ghost-button"
					onclick={disconnectSession}
				>Disconnect</Button>
			{:else}
				<Button
					size="sm"
					class="primary"
					onclick={startOAuthLogin}
					disabled={authLoading}
				>
					<span>{authLoading ? 'Connecting' : 'Connect'}</span>
				</Button>
			{/if}
		</div>

		<div class="sosein-new-document sosein-panel-new-document">
			<input
				class="settings-text-input"
				value={newDocumentTitle}
				aria-label="New cloud document title"
				oninput={(event) => newDocumentTitle = (event.currentTarget as HTMLInputElement).value}
				onkeydown={(event) => {
					if (event.key === 'Enter') void createDocument();
				}}
				disabled={!session}
				spellcheck="true"
			/>

			<Button
				size="sm"
				class="primary"
				onclick={createDocument}
				disabled={!session || documentOpening}
			>New</Button>
		</div>

		<div class="file-tree-scroll sosein-cloud-document-scroll">
			{#if !session}
				<p class="file-tree-empty">Connect to browse Sosein Cloud documents.</p>
			{:else if documentsLoading}
				<p class="file-tree-empty">Loading cloud documents...</p>
			{:else if documents.length === 0}
				<p class="file-tree-empty">No cloud documents.</p>
			{:else}
				<ul class="file-tree-list root sosein-cloud-document-list">
					{#each documents as document (document.id)}
						<li>
							<button
								class="file-tree-row document sosein-cloud-document-row"
								class:active={activeDocument?.id === document.id}
								type="button"
								aria-current={activeDocument?.id === document.id ? 'page' : undefined}
								onclick={() => openDocument(document)}
								disabled={documentOpening}
							>
								<span class="file-tree-file-icon markdown" aria-hidden="true">
									<CloudIcon />
								</span>
								<span class="file-tree-entry-name">{document.title}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if error}
				<p class="file-tree-error">{error}</p>
			{/if}

			{#if session}
				<p class="sosein-cloud-sync-label">{syncStatusLabel(syncStatus)}</p>
			{/if}
		</div>
	</div>
</aside>
