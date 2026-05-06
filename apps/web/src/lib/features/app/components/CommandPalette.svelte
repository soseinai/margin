<script lang="ts">
	import ClockIcon from '@lucide/svelte/icons/clock';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import CommandIcon from '@lucide/svelte/icons/command';
	import FilePlusIcon from '@lucide/svelte/icons/file-plus';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import FolderTreeIcon from '@lucide/svelte/icons/folder-tree';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import ListIcon from '@lucide/svelte/icons/list';
	import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
	import MessageSquarePlusIcon from '@lucide/svelte/icons/message-square-plus';
	import PanelLeftCloseIcon from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SaveIcon from '@lucide/svelte/icons/save';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import TableIcon from '@lucide/svelte/icons/table';
	import XIcon from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';

	import type {
		CommandPaletteEntry,
		CommandPaletteIconName,
		CommandPaletteInputMode,
		CommandPaletteMode,
		CommandPaletteOpenRequest,
		CommandPaletteRow
	} from '$lib/app-types';

	const visibleEntryLimit = 10;
	const windowEdgeBuffer = 2;
	const fileTitleMaxLength = 34;
	const fileDetailMaxLength = 54;

	export let getCommandEntries: () => CommandPaletteEntry[] = () => [];
	export let getFileEntries: () => CommandPaletteEntry[] = () => [];
	export let fileTreePanelOpen = false;
	export let openRequest: CommandPaletteOpenRequest | null = null;
	export let onOpenChange: (open: boolean) => void = () => {};

	let openState = false;
	let mode: CommandPaletteMode = 'commands';
	let query = '';
	let input: HTMLInputElement | null = null;
	let activeIndex = 0;
	let windowStart = 0;
	let inputMode: CommandPaletteInputMode = 'keyboard';
	let lastPointerX = Number.NaN;
	let lastPointerY = Number.NaN;
	let handledOpenRequestId = 0;

	$: effectiveMode = modeForQuery(mode, query);
	$: searchQuery = queryForMode(mode, query);
	$: titleLabel = effectiveMode === 'commands' ? 'Command Palette' : 'Quick Open';
	$: placeholderLabel = effectiveMode === 'commands'
		? 'Type command'
		: 'Search files';
	$: searchAriaLabel = effectiveMode === 'commands'
		? 'Command palette search'
		: 'Quick open search';
	$: shortcutLabel = effectiveMode === 'commands'
		? shortcutForPlatform('Shift+P')
		: shortcutForPlatform('P');
	$: entries = openState
		? filteredEntries(effectiveMode, searchQuery)
		: [];
	$: activeIndex = normalizedIndex(entries, activeIndex);
	$: windowed = entries.length > visibleEntryLimit;
	$: listHeight = windowed
		? `${stableListHeight(entries, searchQuery)}px`
		: '';
	$: windowStart = normalizedWindowStart(entries, activeIndex, windowStart, inputMode);
	$: rows = displayRows(visibleEntries(entries, windowStart), searchQuery, windowStart);
	$: if (openRequest && openRequest.id !== handledOpenRequestId) {
		handledOpenRequestId = openRequest.id;
		void openPalette(openRequest.mode);
	}

	async function openPalette(nextMode: CommandPaletteMode) {
		mode = nextMode;
		query = '';
		activeIndex = 0;
		windowStart = 0;
		resetPointerTracking();
		setOpenState(true);
		await tick();
		input?.focus();
	}

	function closePalette() {
		setOpenState(false);
		query = '';
		activeIndex = 0;
		windowStart = 0;
		resetPointerTracking();
	}

	function setOpenState(nextOpenState: boolean) {
		if (openState === nextOpenState) return;

		openState = nextOpenState;
		onOpenChange(openState);
	}

	function modeForQuery(currentMode: CommandPaletteMode, currentQuery: string): CommandPaletteMode {
		return currentMode === 'files' && currentQuery.trimStart().startsWith('>') ? 'commands' : currentMode;
	}

	function queryForMode(currentMode: CommandPaletteMode, currentQuery: string) {
		if (currentMode !== 'files') return currentQuery;

		const trimmedStart = currentQuery.trimStart();
		if (!trimmedStart.startsWith('>')) return currentQuery;

		return trimmedStart.slice(1).trimStart();
	}

	function updateQuery(event: Event) {
		query = (event.currentTarget as HTMLInputElement).value;
		activeIndex = 0;
		windowStart = 0;
		resetPointerTracking();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			closePalette();

			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			moveSelection(1);

			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			moveSelection(-1);

			return;
		}

		if (event.key === 'Home') {
			event.preventDefault();
			setKeyboardIndex(firstEnabledIndex(entries));

			return;
		}

		if (event.key === 'End') {
			event.preventDefault();
			setKeyboardIndex(lastEnabledIndex(entries));

			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			void runEntry(entries[activeIndex]);
		}
	}

	function moveSelection(direction: -1 | 1) {
		if (entries.length === 0) return;

		let nextIndex = activeIndex;

		for (let step = 0; step < entries.length; step += 1) {
			nextIndex = (nextIndex + direction + entries.length) % entries.length;

			if (!entries[nextIndex]?.disabled) {
				setKeyboardIndex(nextIndex);

				return;
			}
		}
	}

	function setKeyboardIndex(index: number) {
		if (index < 0) return;

		inputMode = 'keyboard';
		activeIndex = index;
	}

	function resetPointerTracking() {
		inputMode = 'keyboard';
		lastPointerX = Number.NaN;
		lastPointerY = Number.NaN;
	}

	function handleOptionPointerMove(event: PointerEvent, index: number, disabled?: boolean) {
		if (disabled) return;

		const hasPreviousPointerPosition = Number.isFinite(lastPointerX)
			&& Number.isFinite(lastPointerY);
		const coordinateMoved = hasPreviousPointerPosition
			&& (event.clientX !== lastPointerX || event.clientY !== lastPointerY);
		const pointerActuallyMoved = event.movementX !== 0 || event.movementY !== 0 || coordinateMoved;

		lastPointerX = event.clientX;
		lastPointerY = event.clientY;

		if (inputMode === 'keyboard' && !pointerActuallyMoved) return;
		if (!pointerActuallyMoved) return;

		inputMode = 'pointer';
		activeIndex = index;
	}

	async function runEntry(entry: CommandPaletteEntry | undefined) {
		if (!entry || entry.disabled) return;

		closePalette();
		await tick();
		await entry.action();
	}

	function normalizedIndex(currentEntries: CommandPaletteEntry[], index: number) {
		if (currentEntries.length === 0) return 0;
		if (currentEntries[index] && !currentEntries[index].disabled) return index;

		const firstEnabled = firstEnabledIndex(currentEntries);
		if (firstEnabled >= 0) return firstEnabled;

		return clampNumber(index, 0, currentEntries.length - 1);
	}

	function normalizedWindowStart(
		currentEntries: CommandPaletteEntry[],
		currentActiveIndex: number,
		currentStart: number,
		currentInputMode: CommandPaletteInputMode
	) {
		if (currentEntries.length <= visibleEntryLimit) return 0;

		const maxStart = currentEntries.length - visibleEntryLimit;
		const start = clampNumber(currentStart, 0, maxStart);

		if (currentActiveIndex < start) {
			return clampNumber(currentActiveIndex - windowEdgeBuffer, 0, maxStart);
		}

		if (currentActiveIndex >= start + visibleEntryLimit) {
			return clampNumber(
				currentActiveIndex - visibleEntryLimit + windowEdgeBuffer + 1,
				0,
				maxStart
			);
		}

		if (currentInputMode === 'pointer') return start;

		if (currentActiveIndex < start + windowEdgeBuffer) {
			return clampNumber(currentActiveIndex - windowEdgeBuffer, 0, maxStart);
		}

		if (currentActiveIndex >= start + visibleEntryLimit - windowEdgeBuffer) {
			return clampNumber(
				currentActiveIndex - visibleEntryLimit + windowEdgeBuffer + 1,
				0,
				maxStart
			);
		}

		return start;
	}

	function visibleEntries(currentEntries: CommandPaletteEntry[], start: number) {
		return currentEntries.slice(start, start + visibleEntryLimit);
	}

	function firstEnabledIndex(currentEntries: CommandPaletteEntry[]) {
		return currentEntries.findIndex((entry) => !entry.disabled);
	}

	function lastEnabledIndex(currentEntries: CommandPaletteEntry[]) {
		for (let index = currentEntries.length - 1; index >= 0; index -= 1) {
			if (!currentEntries[index].disabled) return index;
		}

		return 0;
	}

	function filteredEntries(currentMode: CommandPaletteMode, currentQuery: string) {
		const sourceEntries = currentMode === 'commands'
			? getCommandEntries()
			: getFileEntries();
		const normalizedQuery = normalizeSearchValue(currentQuery);

		if (!normalizedQuery) return sourceEntries.slice(0, 60);

		const matches = sourceEntries
			.map((entry, index) => ({
				entry,
				index,
				score: entryScore(entry, normalizedQuery)
			}))
			.filter((match) => Number.isFinite(match.score))
			.sort((a, b) => a.score - b.score || a.index - b.index)
			.map((match) => match.entry)
			.slice(0, 60);

		return matches.length > 0
			? matches
			: [{
				id: 'empty:no-matches',
				kind: 'empty' as const,
				title: 'No matches',
				subtitle: 'Try another search',
				group: 'Suggested',
				disabled: true,
				action: () => {}
			}];
	}

	function displayRows(
		currentEntries: CommandPaletteEntry[],
		currentQuery: string,
		entryOffset = 0
	): CommandPaletteRow[] {
		const showHeadings = !normalizeSearchValue(currentQuery);
		const nextRows: CommandPaletteRow[] = [];
		let previousGroup = '';

		currentEntries.forEach((entry, localIndex) => {
			const index = entryOffset + localIndex;
			const group = showHeadings ? entryGroup(entry) : '';

			if (group && group !== previousGroup) {
				nextRows.push({
					type: 'heading',
					id: `command-palette-heading:${group}:${index}`,
					title: group
				});
				previousGroup = group;
			}

			nextRows.push({
				type: 'entry',
				id: `command-palette-entry:${entry.id}`,
				entry,
				index
			});
		});

		return nextRows;
	}

	function stableListHeight(currentEntries: CommandPaletteEntry[], currentQuery: string) {
		if (currentEntries.length === 0) return 0;

		const lastWindowStart = Math.max(0, currentEntries.length - visibleEntryLimit);
		let height = 0;

		for (let start = 0; start <= lastWindowStart; start += 1) {
			const nextRows = displayRows(visibleEntries(currentEntries, start), currentQuery, start);
			height = Math.max(height, rowsHeight(nextRows));
		}

		return height;
	}

	function rowsHeight(currentRows: CommandPaletteRow[]) {
		const optionHeight = 32;
		const optionWithSubtitleHeight = 38;
		const firstHeadingHeight = 17;
		const headingHeight = 22;
		const rowGap = 1;
		const listPaddingBottom = 8;
		let height = listPaddingBottom + Math.max(0, currentRows.length - 1) * rowGap;

		currentRows.forEach((row, index) => {
			if (row.type === 'entry') {
				height += showsSubtitle(row.entry) ? optionWithSubtitleHeight : optionHeight;
			} else {
				height += index === 0 ? firstHeadingHeight : headingHeight;
			}
		});

		return height;
	}

	function entryGroup(entry: CommandPaletteEntry) {
		if (entry.group) return entry.group;
		if (entry.kind === 'tab') return 'Open Tabs';
		if (entry.kind === 'file') return 'Files';
		if (entry.kind === 'recent') return 'Recent';
		if (entry.kind === 'empty') return '';

		return 'Suggested';
	}

	function entryScore(entry: CommandPaletteEntry, currentQuery: string) {
		const terms = currentQuery.split(/\s+/).filter(Boolean);
		let score = 0;

		for (const term of terms) {
			const termScore = Math.min(
				textScore(entry.title, term, 0),
				textScore(entry.subtitle || '', term, 24),
				textScore(entry.detail || '', term, 40),
				textScore((entry.keywords || []).join(' '), term, 46)
			);

			if (!Number.isFinite(termScore)) return Number.POSITIVE_INFINITY;

			score += termScore;
		}

		return score + (entry.disabled ? 200 : 0);
	}

	function textScore(value: string, term: string, offset: number) {
		const text = normalizeSearchValue(value);

		if (!text) return Number.POSITIVE_INFINITY;
		if (text.startsWith(term)) return offset;

		const exactIndex = text.indexOf(term);
		if (exactIndex >= 0) return offset + 10 + exactIndex;

		const fuzzyScore = fuzzyScoreForTerm(term, text);
		return Number.isFinite(fuzzyScore)
			? offset + 80 + fuzzyScore
			: Number.POSITIVE_INFINITY;
	}

	function fuzzyScoreForTerm(term: string, text: string) {
		let previousIndex = -1;
		let score = 0;

		for (const character of term) {
			const nextIndex = text.indexOf(character, previousIndex + 1);

			if (nextIndex < 0) return Number.POSITIVE_INFINITY;

			score += nextIndex;
			if (previousIndex >= 0) score += Math.max(0, nextIndex - previousIndex - 1);
			previousIndex = nextIndex;
		}

		return score;
	}

	function normalizeSearchValue(value: string) {
		return value.trim().toLowerCase().replace(/[_-]+/g, ' ');
	}

	function entryIcon(entry: CommandPaletteEntry): CommandPaletteIconName {
		if (entry.kind === 'file' || entry.kind === 'tab') return 'file-text';
		if (entry.kind === 'recent') return 'clock';
		if (entry.kind === 'empty') return 'search';

		if (entry.id === 'command:new-document') return 'file-plus';
		if (entry.id === 'command:open-document' || entry.id === 'quick-open:open-document') return 'file-text';
		if (entry.id === 'command:open-folder' || entry.id === 'quick-open:open-folder') return 'folder-open';
		if (entry.id === 'command:quick-open') return 'search';
		if (entry.id === 'command:sosein-cloud') return 'cloud';
		if (entry.id === 'command:settings') return 'settings';
		if (entry.id === 'command:save' || entry.id === 'command:save-as') return 'save';
		if (entry.id === 'command:print') return 'printer';
		if (entry.id === 'command:close-tab') return 'x';
		if (entry.id === 'command:toggle-file-tree') return fileTreePanelOpen ? 'panel-left-close' : 'panel-left';
		if (
			entry.id === 'command:previous-tab'
			|| entry.id === 'command:next-tab'
		) return 'panel-left-close';
		if (entry.id === 'command:find' || entry.id === 'command:find-replace') return 'search';
		if (entry.id === 'command:edit-mode' || entry.id === 'command:suggest-mode') return 'pencil';
		if (entry.id === 'command:add-comment') return 'message-square-plus';
		if (entry.id === 'command:insert-table') return 'table';
		if (entry.id === 'command:insert-tasks') return 'list-checks';
		if (entry.id === 'command:insert-bullets') return 'list';
		if (entry.id === 'command:insert-numbers') return 'list-ordered';
		if (entry.id === 'command:check-updates') return 'refresh';

		return 'command';
	}

	function showsSubtitle(entry: CommandPaletteEntry) {
		if (!entry.subtitle) return false;
		if (entry.kind === 'empty') return true;
		if (entry.kind !== 'command') return true;

		return Boolean(entry.disabled);
	}

	function displayTitle(entry: CommandPaletteEntry) {
		return isFileLikeEntry(entry)
			? middleTruncateText(entry.title, fileTitleMaxLength)
			: entry.title;
	}

	function displayDetail(entry: CommandPaletteEntry) {
		if (!entry.detail) return '';

		return isFileLikeEntry(entry)
			? middleTruncateText(entry.detail, fileDetailMaxLength)
			: entry.detail;
	}

	function optionTooltip(entry: CommandPaletteEntry) {
		return [entry.title, entry.subtitle, entry.detail].filter(Boolean).join(' - ');
	}

	function isFileLikeEntry(entry: CommandPaletteEntry) {
		return entry.kind === 'file' || entry.kind === 'recent' || entry.kind === 'tab';
	}

	function middleTruncateText(value: string, maxLength: number) {
		if (value.length <= maxLength) return value;
		if (maxLength <= 3) return value.slice(0, maxLength);

		const separator = '...';
		const remainingLength = maxLength - separator.length;
		const startLength = Math.ceil(remainingLength * 0.45);
		const endLength = Math.floor(remainingLength * 0.55);

		return `${value.slice(0, startLength)}${separator}${value.slice(value.length - endLength)}`;
	}

	function shortcutForPlatform(keys: string) {
		if (isApplePlatform()) {
			return `${platformCommandKeyLabel()}${keys.split('+').map(macShortcutPartLabel).join('')}`;
		}

		return `${platformCommandKeyLabel()}+${keys}`;
	}

	function platformCommandKeyLabel() {
		return isApplePlatform() ? '⌘' : 'Ctrl';
	}

	function isApplePlatform() {
		return typeof navigator !== 'undefined' && (/Mac|iPhone|iPad|iPod/).test(navigator.platform);
	}

	function macShortcutPartLabel(part: string) {
		if (part === 'Shift') return '⇧';
		if (part === 'Alt') return '⌥';
		if (part === 'Ctrl') return '⌃';
		if (part === 'Cmd') return '⌘';

		return part.toUpperCase();
	}

	function clampNumber(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}
</script>

{#if openState}
	<div
		class="command-palette-backdrop"
		role="presentation"
		onpointerdown={(event) => {
			if (event.target === event.currentTarget) closePalette();
		}}
	>
		<div
			class="command-palette"
			class:keyboard-input={inputMode === 'keyboard'}
			class:pointer-input={inputMode === 'pointer'}
			role="dialog"
			aria-modal="true"
			aria-labelledby="command-palette-title"
			tabindex="-1"
			onkeydown={handleKeydown}
		>
			<header class="command-palette-search">
				<SearchIcon aria-hidden="true" />

				<div class="command-palette-field">
					<h2 id="command-palette-title">{titleLabel}</h2>
					<input
						bind:this={input}
						value={query}
						type="text"
						role="combobox"
						aria-label={searchAriaLabel}
						aria-expanded="true"
						aria-controls="command-palette-listbox"
						aria-activedescendant={entries[activeIndex] ? `command-palette-option-${activeIndex}` : undefined}
						autocomplete="off"
						autocapitalize="off"
						autocorrect="off"
						spellcheck="false"
						placeholder={placeholderLabel}
						oninput={updateQuery}
						onkeydown={handleKeydown}
					/>
				</div>

				<kbd class="command-palette-shortcut">{shortcutLabel}</kbd>
			</header>

			<div
				id="command-palette-listbox"
				class="command-palette-list"
				class:windowed={windowed}
				style={windowed ? `--command-palette-list-height: ${listHeight};` : ''}
				role="listbox"
				aria-label={titleLabel}
			>
				{#each rows as row (row.id)}
					{#if row.type === 'heading'}
						<div class="command-palette-section-label" role="presentation">{row.title}</div>
					{:else}
						<button
							id={`command-palette-option-${row.index}`}
							class="command-palette-option"
							class:active={row.index === activeIndex}
							class:empty={row.entry.kind === 'empty'}
							type="button"
							role="option"
							aria-selected={row.index === activeIndex}
							disabled={row.entry.disabled}
							title={optionTooltip(row.entry)}
							onpointermove={(event) => handleOptionPointerMove(event, row.index, row.entry.disabled)}
							onclick={() => runEntry(row.entry)}
						>
							<span class={`command-palette-icon ${row.entry.kind}`} aria-hidden="true">
								{#if entryIcon(row.entry) === 'clock'}
									<ClockIcon />
								{:else if entryIcon(row.entry) === 'cloud'}
									<CloudIcon />
								{:else if entryIcon(row.entry) === 'file-plus'}
									<FilePlusIcon />
								{:else if entryIcon(row.entry) === 'file-text'}
									<FileTextIcon />
								{:else if entryIcon(row.entry) === 'folder-open'}
									<FolderOpenIcon />
								{:else if entryIcon(row.entry) === 'folder-tree'}
									<FolderTreeIcon />
								{:else if entryIcon(row.entry) === 'list'}
									<ListIcon />
								{:else if entryIcon(row.entry) === 'list-checks'}
									<ListChecksIcon />
								{:else if entryIcon(row.entry) === 'list-ordered'}
									<ListOrderedIcon />
								{:else if entryIcon(row.entry) === 'message-square-plus'}
									<MessageSquarePlusIcon />
								{:else if entryIcon(row.entry) === 'panel-left'}
									<PanelLeftIcon />
								{:else if entryIcon(row.entry) === 'panel-left-close'}
									<PanelLeftCloseIcon />
								{:else if entryIcon(row.entry) === 'pencil'}
									<PencilIcon />
								{:else if entryIcon(row.entry) === 'printer'}
									<PrinterIcon />
								{:else if entryIcon(row.entry) === 'refresh'}
									<RefreshCwIcon />
								{:else if entryIcon(row.entry) === 'save'}
									<SaveIcon />
								{:else if entryIcon(row.entry) === 'search'}
									<SearchIcon />
								{:else if entryIcon(row.entry) === 'settings'}
									<SettingsIcon />
								{:else if entryIcon(row.entry) === 'table'}
									<TableIcon />
								{:else if entryIcon(row.entry) === 'x'}
									<XIcon />
								{:else}
									<CommandIcon />
								{/if}
							</span>

							<span class="command-palette-copy">
								<span class="command-palette-name">{displayTitle(row.entry)}</span>
								{#if showsSubtitle(row.entry)}
									<span class="command-palette-subtitle">{row.entry.subtitle}</span>
								{/if}
							</span>

							{#if row.entry.detail}
								<span class="command-palette-detail">{displayDetail(row.entry)}</span>
							{/if}

							{#if row.entry.shortcut}
								<kbd>{row.entry.shortcut}</kbd>
							{/if}
						</button>
					{/if}
				{/each}
			</div>
		</div>
	</div>
{/if}
