<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { WordCountStats } from '$lib/app-types';

	const emptyWordCountStats: WordCountStats = {
		document: { words: 0, characters: 0, lines: 0 },
		selection: null,
		review: { open: 0, closed: 0 },
		tasks: { open: 0, total: 0 }
	};

	export let open = false;
	export let wordCountStats: WordCountStats = emptyWordCountStats;
	export let closeWordCountDialog: () => void = () => {};
	export let formatCount: (count: number) => string = (count) => String(count);
	export let formatReadingTime: (words: number) => string = () => '';
	export let formatReviewProgress: (stats: WordCountStats['review']) => string = () => '';
	export let formatTaskProgress: (stats: WordCountStats['tasks']) => string = () => '';
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="settings-dialog word-count-dialog"
		aria-labelledby="word-count-title"
		showCloseButton={false}
	>
		<Dialog.Header class="settings-dialog-header">
			<div>
				<p class="eyebrow">Margin</p>
				<Dialog.Title id="word-count-title">Word Count</Dialog.Title>
			</div>

			<Button
				variant="ghost"
				size="icon-sm"
				class="icon-button"
				aria-label="Close word count"
				onclick={closeWordCountDialog}
			>
				<XIcon aria-hidden="true" />
			</Button>
		</Dialog.Header>

		<section class="word-count-dashboard" aria-label="Document counts">
			<div class="word-count-hero">
				<div class="word-count-hero-copy">
					<span class="word-count-kicker">Document</span>
					<span class="word-count-primary-label">Words</span>
				</div>
				<strong data-word-count-value="document-words">{formatCount(wordCountStats.document.words)}</strong>
			</div>

			<dl class="word-count-grid">
				<div class="word-count-metric reading-time">
					<dt>Reading time</dt>
					<dd data-word-count-value="reading-time">{formatReadingTime(wordCountStats.document.words)}</dd>
				</div>
				<div class="word-count-metric characters">
					<dt>Characters</dt>
					<dd data-word-count-value="document-characters">{formatCount(wordCountStats.document.characters)}</dd>
				</div>
				<div class="word-count-metric lines">
					<dt>Lines</dt>
					<dd data-word-count-value="document-lines">{formatCount(wordCountStats.document.lines)}</dd>
				</div>
				<div class="word-count-metric review">
					<dt>Comments / suggestions</dt>
					<dd data-word-count-value="review-progress">{formatReviewProgress(wordCountStats.review)}</dd>
				</div>
				<div class="word-count-metric tasks">
					<dt>Tasks</dt>
					<dd data-word-count-value="task-progress">{formatTaskProgress(wordCountStats.tasks)}</dd>
				</div>
			</dl>
		</section>

		{#if wordCountStats.selection}
			<section class="word-count-panel word-count-selection" aria-label="Selection counts">
				<Label>Selection</Label>
				<dl class="word-count-grid compact">
					<div class="word-count-metric selection-words">
						<dt>Words</dt>
						<dd data-word-count-value="selection-words">{formatCount(wordCountStats.selection.words)}</dd>
					</div>
					<div class="word-count-metric selection-characters">
						<dt>Characters</dt>
						<dd data-word-count-value="selection-characters">{formatCount(wordCountStats.selection.characters)}</dd>
					</div>
				</dl>
			</section>
		{/if}

		<Dialog.Footer class="settings-actions">
			<Button
				size="sm"
				class="primary"
				onclick={closeWordCountDialog}
			>Done</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
