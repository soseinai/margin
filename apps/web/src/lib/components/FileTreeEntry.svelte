<script lang="ts">
	import FileIcon from '@lucide/svelte/icons/file';
	import FileArchiveIcon from '@lucide/svelte/icons/file-archive';
	import FileBracesIcon from '@lucide/svelte/icons/file-braces';
	import FileCodeIcon from '@lucide/svelte/icons/file-code';
	import FileCogIcon from '@lucide/svelte/icons/file-cog';
	import FileImageIcon from '@lucide/svelte/icons/file-image';
	import FileLockIcon from '@lucide/svelte/icons/file-lock';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import FileTextIcon from '@lucide/svelte/icons/file-text';

	type NativeDirectoryEntry = {
		path: string;
		name: string;
		kind: 'directory' | 'markdown' | 'file';
		children: NativeDirectoryEntry[]
	};

	type FileIconKind =
		| 'archive'
		| 'code'
		| 'config'
		| 'data'
		| 'image'
		| 'lock'
		| 'spreadsheet'
		| 'text'
		| 'default';

	const archiveExtensions = new Set(['7z', 'bz2', 'gz', 'rar', 'tar', 'tgz', 'xz', 'zip']);
	const codeExtensions = new Set([
		'astro',
		'bash',
		'c',
		'cc',
		'clj',
		'cpp',
		'cs',
		'css',
		'go',
		'h',
		'hpp',
		'html',
		'java',
		'js',
		'jsx',
		'kt',
		'lua',
		'mjs',
		'php',
		'py',
		'rb',
		'rs',
		'scss',
		'sh',
		'sql',
		'svelte',
		'swift',
		'ts',
		'tsx',
		'vue',
		'xml',
		'zsh'
	]);
	const configExtensions = new Set(['conf', 'config', 'editorconfig', 'env', 'ini', 'toml', 'yaml', 'yml']);
	const dataExtensions = new Set(['json', 'jsonc', 'ndjson']);
	const imageExtensions = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
	const spreadsheetExtensions = new Set(['csv', 'tsv', 'xls', 'xlsx']);
	const textExtensions = new Set(['adoc', 'log', 'pdf', 'rst', 'rtf', 'txt']);
	const lockFileNames = new Set([
		'cargo.lock',
		'package-lock.json',
		'pnpm-lock.yaml',
		'yarn.lock'
	]);

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

	function extensionForName(name: string) {
		const normalizedName = name.toLowerCase();
		const extensionIndex = normalizedName.lastIndexOf('.');

		if (extensionIndex <= 0 || extensionIndex === normalizedName.length - 1) return '';

		return normalizedName.slice(extensionIndex + 1);
	}

	function fileIconKind(target: NativeDirectoryEntry): FileIconKind {
		const name = target.name.toLowerCase();
		const extension = extensionForName(name);

		if (lockFileNames.has(name) || name.endsWith('.lock')) return 'lock';
		if (imageExtensions.has(extension)) return 'image';
		if (codeExtensions.has(extension)) return 'code';
		if (dataExtensions.has(extension)) return 'data';
		if (spreadsheetExtensions.has(extension)) return 'spreadsheet';
		if (archiveExtensions.has(extension)) return 'archive';
		if (configExtensions.has(extension) || name.startsWith('.env')) return 'config';
		if (textExtensions.has(extension)) return 'text';

		return 'default';
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
		<span class="file-tree-md-icon" aria-hidden="true">MD</span>
		<span class="file-tree-entry-name">{entry.name}</span>
	</button>
{:else}
	<div
		class="file-tree-row file"
		title={entry.path}
		aria-label={`${entry.name}, ${entryLabel(entry)}`}
	>
		<span class={`file-tree-file-icon ${fileIconKind(entry)}`} aria-hidden="true">
			{#if fileIconKind(entry) === 'archive'}
				<FileArchiveIcon />
			{:else if fileIconKind(entry) === 'code'}
				<FileCodeIcon />
			{:else if fileIconKind(entry) === 'config'}
				<FileCogIcon />
			{:else if fileIconKind(entry) === 'data'}
				<FileBracesIcon />
			{:else if fileIconKind(entry) === 'image'}
				<FileImageIcon />
			{:else if fileIconKind(entry) === 'lock'}
				<FileLockIcon />
			{:else if fileIconKind(entry) === 'spreadsheet'}
				<FileSpreadsheetIcon />
			{:else if fileIconKind(entry) === 'text'}
				<FileTextIcon />
			{:else}
				<FileIcon />
			{/if}
		</span>
		<span class="file-tree-entry-name">{entry.name}</span>
	</div>
{/if}
