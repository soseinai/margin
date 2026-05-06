<script lang="ts">
	import CommandIcon from '@lucide/svelte/icons/command';
	import FilePlusIcon from '@lucide/svelte/icons/file-plus';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import PanelLeftCloseIcon from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import SaveIcon from '@lucide/svelte/icons/save';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import XIcon from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/ui/button/index.js';
	import type { CommandPaletteMode, DocumentTab, EditingMode } from '$lib/app-types';
	import EditingModeToggle from './EditingModeToggle.svelte';

	type MaybePromise<T = void> = T | Promise<T>;

	export let fileTreePanelOpen = false;
	export let visibleDocumentTabs: DocumentTab[] = [];
	export let activeDocumentTabId = '';
	export let editMode: EditingMode = 'edit';
	export let fileInput: HTMLInputElement | undefined = undefined;
	export let brandMarkUrl = '';
	export let brandMarkDarkUrl = '';
	export let titlebarEyebrowLabel = '';
	export let titlebarEyebrowPlaceholder = false;
	export let documentTitleLabel = 'Untitled.md';
	export let toggleFileTreePanel: () => void = () => {};
	export let tabHasDiscardableWork: (tab: DocumentTab) => boolean = () => false;
	export let activateDocumentTab: (tabId: string) => MaybePromise = () => {};
	export let closeDocumentTab: (tabId: string) => MaybePromise = () => {};
	export let openCommandPalette: (mode: CommandPaletteMode) => MaybePromise = () => {};
	export let setEditingMode: (mode: EditingMode) => void = () => {};
	export let handleLocalFileSelected: (event: Event) => void = () => {};
	export let createNewDocument: () => MaybePromise = () => {};
	export let openLocalMarkdown: () => MaybePromise = () => {};
	export let saveLocalMarkdown: () => MaybePromise = () => {};
	export let requestPrintDocument: () => MaybePromise = () => {};
	export let openSettingsDialog: () => void = () => {};
</script>

<Button
	variant="ghost"
	size="icon-sm"
	class="titlebar-file-tree-toggle"
	aria-label={fileTreePanelOpen ? 'Hide file tree' : 'Show file tree'}
	aria-pressed={fileTreePanelOpen}
	title={fileTreePanelOpen ? 'Hide file tree' : 'Show file tree'}
	onclick={toggleFileTreePanel}
>
	{#if fileTreePanelOpen}
		<PanelLeftCloseIcon aria-hidden="true" />
	{:else}
		<PanelLeftIcon aria-hidden="true" />
	{/if}
</Button>

<div class="window-tabbar" aria-label="Open documents">
	{#each visibleDocumentTabs as tab (tab.id)}
		<div
			class="document-tab-shell"
			class:active={tab.id === activeDocumentTabId}
		>
			<Button
				variant="ghost"
				size="sm"
				class="document-tab"
				aria-current={tab.id === activeDocumentTabId ? 'page' : undefined}
				onclick={() => activateDocumentTab(tab.id)}
			>
				<span class="document-tab-title">{tab.title}</span>

				{#if tabHasDiscardableWork(tab)}
					<span
						class="document-tab-dirty"
						aria-label="Unsaved changes"
					></span>
				{/if}
			</Button>

			<Button
				variant="ghost"
				size="icon-xs"
				class="document-tab-close"
				aria-label={`Close ${tab.title}`}
				onclick={(event) => {
					event.stopPropagation();
					closeDocumentTab(tab.id);
				}}
			>
				<XIcon aria-hidden="true" />
			</Button>
		</div>
	{/each}

	<div
		class="window-tabbar-drag"
		data-tauri-drag-region
		aria-hidden="true"
	></div>

	<Button
		variant="ghost"
		size="icon-sm"
		class="titlebar-command-button"
		aria-label="Open command palette"
		title="Command palette"
		onclick={() => openCommandPalette('commands')}
	>
		<CommandIcon aria-hidden="true" />
	</Button>

	<EditingModeToggle
		className="titlebar-mode-toggle"
		itemClassName="titlebar-mode-button"
		{editMode}
		{setEditingMode}
	/>
</div>

<div class="doc-titlebar-shell">
	<header class="doc-topbar">
		<input
			class="local-file-input"
			bind:this={fileInput}
			type="file"
			accept=".md,.markdown,text/markdown,text/plain"
			onchange={handleLocalFileSelected}
		/>

		<div class="brand-cluster" data-tauri-drag-region>
			<div class="brand-mark" aria-hidden="true">
				<img class="brand-mark-image brand-mark-image-light" src={brandMarkUrl} alt="" draggable="false" />
				<img class="brand-mark-image brand-mark-image-dark" src={brandMarkDarkUrl} alt="" draggable="false" />
			</div>

			<div class="brand-title" data-tauri-drag-region>
				<p
					class="eyebrow"
					class:eyebrow-placeholder={!titlebarEyebrowLabel}
					class:placeholder-eyebrow={titlebarEyebrowPlaceholder}
					aria-hidden={titlebarEyebrowLabel ? undefined : 'true'}
				>
					{titlebarEyebrowLabel}
				</p>
				<h1>{documentTitleLabel}</h1>
			</div>
		</div>

		<div
			class="window-drag-spacer"
			data-tauri-drag-region
			aria-hidden="true"
		></div>

		<div class="topbar-actions" aria-label="Document actions">
			<Button
				variant="ghost"
				size="icon-sm"
				class="topbar-icon-button"
				aria-label="Open command palette"
				title="Command palette"
				onclick={() => openCommandPalette('commands')}
			>
				<CommandIcon aria-hidden="true" />
			</Button>

			<Button
				variant="ghost"
				size="icon-sm"
				class="topbar-icon-button"
				aria-label="New document"
				title="New document"
				onclick={createNewDocument}
			>
				<FilePlusIcon aria-hidden="true" />
			</Button>

			<Button
				variant="ghost"
				size="icon-sm"
				class="topbar-icon-button"
				aria-label="Open document"
				title="Open document"
				onclick={openLocalMarkdown}
			>
				<FolderOpenIcon aria-hidden="true" />
			</Button>

			<Button
				variant="ghost"
				size="icon-sm"
				class="topbar-icon-button"
				aria-label="Save document"
				title="Save document"
				onclick={() => saveLocalMarkdown()}
			>
				<SaveIcon aria-hidden="true" />
			</Button>

			<Button
				variant="ghost"
				size="icon-sm"
				class="topbar-icon-button"
				aria-label="Print document"
				title="Print document"
				onclick={requestPrintDocument}
			>
				<PrinterIcon aria-hidden="true" />
			</Button>

			<Button
				variant="ghost"
				size="icon-sm"
				class="topbar-icon-button"
				aria-label="Settings"
				title="Settings"
				onclick={openSettingsDialog}
			>
				<SettingsIcon aria-hidden="true" />
			</Button>
		</div>
	</header>

	<div
		class="doc-toolbar"
		aria-label="Document tools"
		data-tauri-drag-region
	>
		<EditingModeToggle
			className="mobile-mode-toggle"
			itemClassName="mobile-mode-button"
			{editMode}
			{setEditingMode}
		/>
	</div>
</div>
