<script lang="ts">
	type NativeDirectoryEntry = {
		path: string;
		name: string;
		kind: 'directory' | 'markdown' | 'file';
		children: NativeDirectoryEntry[]
	};

	export let entry: NativeDirectoryEntry;
	export let activePath = '';
	export let onOpen: (entry: NativeDirectoryEntry) => void | Promise<void> = () => {};

	function entryLabel(target: NativeDirectoryEntry) {
		if (target.kind === 'directory') return 'Folder';
		if (target.kind === 'markdown') return 'Markdown document';

		return 'File';
	}

	function openEntry(target: NativeDirectoryEntry) {
		if (target.kind !== 'markdown') return;

		void onOpen(target);
	}

	function handleEntryKeydown(event: KeyboardEvent, target: NativeDirectoryEntry) {
		if (target.kind !== 'markdown') return;
		if (event.key !== 'Enter' && event.key !== ' ') return;

		event.preventDefault();
		openEntry(target);
	}
</script>

{#if entry.kind === 'directory'}
	<details class="file-tree-directory" open>
		<summary
			class="file-tree-row directory"
			title={entry.path}
		>
			<span class="file-tree-twist" aria-hidden="true"></span>
			<span class="file-tree-entry-name">{entry.name}</span>
			<span class="file-tree-entry-kind">{entry.children.length}</span>
		</summary>

		{#if entry.children.length > 0}
			<ul class="file-tree-list">
				{#each entry.children as child (child.path)}
					<li>
						<svelte:self
							entry={child}
							{activePath}
							{onOpen}
						/>
					</li>
				{/each}
			</ul>
		{/if}
	</details>
{:else if entry.kind === 'markdown'}
	<button
		class="file-tree-row document"
		class:active={entry.path === activePath}
		type="button"
		title={entry.path}
		aria-label={`Open ${entry.name}`}
		onclick={() => openEntry(entry)}
		onkeydown={(event) => handleEntryKeydown(event, entry)}
	>
		<span class="file-tree-dot markdown" aria-hidden="true"></span>
		<span class="file-tree-entry-name">{entry.name}</span>
		<span class="file-tree-entry-kind">MD</span>
	</button>
{:else}
	<div
		class="file-tree-row file"
		title={entry.path}
		aria-label={`${entry.name}, ${entryLabel(entry)}`}
	>
		<span class="file-tree-dot" aria-hidden="true"></span>
		<span class="file-tree-entry-name">{entry.name}</span>
	</div>
{/if}
