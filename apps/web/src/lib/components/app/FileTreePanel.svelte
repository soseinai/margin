<script lang="ts">
	import FileTreeEntry from '$lib/components/FileTreeEntry.svelte';
	import { onDestroy } from 'svelte';
	import type { NativeDirectoryEntry, NativeDirectoryTree } from '$lib/app-types';

	type MaybePromise<T = void> = T | Promise<T>;

	const minWidth = 220;
	const maxWidth = 520;
	const resizeStep = 20;

	export let fileTreeRoot: NativeDirectoryTree | null = null;
	export let fileTreeLoading = false;
	export let fileTreeError = '';
	export let nativeFilePath = '';
	export let width = 300;
	export let openFileTreeEntry: (entry: NativeDirectoryEntry) => MaybePromise = () => {};

	let resizing = false;
	let activeResizeStop: (() => void) | null = null;

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
	class="file-tree-panel"
	class:resizing
	aria-label="Open folder"
>
	<button
		class="file-tree-resizer"
		type="button"
		aria-label="Resize file tree"
		onpointerdown={startResize}
		onkeydown={handleResizeKeydown}
	></button>

	<div class="file-tree-content">
		<header class="file-tree-header">
			<div class="file-tree-heading">
				<p class="file-tree-eyebrow">Folder</p>
				<h2>{fileTreeRoot?.name || 'Open folder'}</h2>
			</div>
		</header>

		<div class="file-tree-scroll">
			{#if fileTreeRoot}
				{#if fileTreeRoot.entries.length > 0}
					<ul class="file-tree-list root">
						{#each fileTreeRoot.entries as entry (entry.path)}
							<li>
								<FileTreeEntry
									{entry}
									activePath={nativeFilePath}
									onOpen={openFileTreeEntry}
								/>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="file-tree-empty">This folder is empty.</p>
				{/if}
			{:else if fileTreeLoading}
				<p class="file-tree-empty">Opening folder...</p>
			{:else}
				<p class="file-tree-empty">Open a folder to browse Markdown documents.</p>
			{/if}

			{#if fileTreeError}
				<p class="file-tree-error">{fileTreeError}</p>
			{/if}
		</div>
	</div>
</aside>
