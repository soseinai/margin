<script lang="ts">
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import XIcon from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { SoseinActiveDocument } from '$lib/app-types';
	import type {
		SoseinDocument,
		SoseinDocumentSummary,
		SoseinStoredSession
	} from '$lib/sosein-cloud';
	import type { SoseinSyncStatus } from '$lib/sosein-codemirror-sync';

	type MaybePromise<T = void> = T | Promise<T>;

	export let open = false;
	export let session: SoseinStoredSession | null = null;
	export let documents: SoseinDocumentSummary[] = [];
	export let documentsLoading = false;
	export let authLoading = false;
	export let documentOpening = false;
	export let error = '';
	export let newDocumentTitle = 'Untitled';
	export let activeDocument: SoseinActiveDocument | null = null;
	export let syncStatus: SoseinSyncStatus = 'disconnected';
	export let closeDialog: () => void = () => {};
	export let disconnectSession: () => void = () => {};
	export let startOAuthLogin: () => MaybePromise = () => {};
	export let refreshDocuments: () => MaybePromise = () => {};
	export let createDocument: () => MaybePromise = () => {};
	export let openDocument: (document: SoseinDocumentSummary | SoseinDocument) => MaybePromise = () => {};
	export let syncStatusLabel: (status: SoseinSyncStatus) => string = (status) => status;
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="settings-dialog sosein-dialog"
		aria-labelledby="sosein-cloud-title"
		showCloseButton={false}
	>
		<Dialog.Header class="settings-dialog-header">
			<div>
				<p class="eyebrow">Sosein Cloud</p>
				<Dialog.Title id="sosein-cloud-title">Cloud Documents</Dialog.Title>
			</div>

			<Button
				variant="ghost"
				size="icon-sm"
				class="icon-button"
				aria-label="Close Sosein Cloud"
				onclick={closeDialog}
			>
				<XIcon aria-hidden="true" />
			</Button>
		</Dialog.Header>

		<div class="settings-pane-body">
			<section class="settings-group" aria-label="Sosein Cloud connection">
				<div class="settings-row sosein-session-row">
					<div class="settings-row-copy">
						<Label>Account</Label>
						<p>{session ? session.user.email : 'Not connected'}</p>
					</div>

					<div class="settings-row-control">
						{#if session}
							<Button
								variant="outline"
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
								<span>{authLoading ? 'Connecting' : 'Connect with Google'}</span>
							</Button>
						{/if}
					</div>
				</div>
			</section>

			<section class="settings-group sosein-document-group" aria-label="Cloud documents">
				<div class="sosein-document-toolbar">
					<div class="settings-row-copy">
						<Label>Documents</Label>
						<p>{syncStatusLabel(syncStatus)}</p>
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
				</div>

				<div class="sosein-new-document">
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

				<div class="sosein-document-list" role="listbox" aria-label="Cloud documents">
					{#if !session}
						<p class="sosein-empty">Connect to list documents</p>
					{:else if documentsLoading}
						<p class="sosein-empty">Loading...</p>
					{:else if documents.length === 0}
						<p class="sosein-empty">No documents</p>
					{:else}
						{#each documents as document (document.id)}
							<button
								class="sosein-document-row"
								class:active={activeDocument?.id === document.id}
								type="button"
								role="option"
								aria-selected={activeDocument?.id === document.id}
								onclick={() => openDocument(document)}
								disabled={documentOpening}
							>
								<span>{document.title}</span>
								<small>v{document.current_snapshot_version}</small>
							</button>
						{/each}
					{/if}
				</div>
			</section>

			{#if error}
				<p class="settings-error">{error}</p>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
