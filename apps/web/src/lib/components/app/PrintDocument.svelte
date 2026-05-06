<script lang="ts">
	import type { ThreadView } from '$lib/app-types';

	export let printDocumentHtml = '';
	export let printableThreads: ThreadView[] = [];
</script>

<section class="print-document" aria-hidden="true">
	<div class="print-document-body">
		{@html printDocumentHtml}
	</div>

	{#if printableThreads.length > 0}
		<section class="print-annotations">
			<h2>Margin Notes</h2>

			{#each printableThreads as thread}
				<article class="print-annotation" class:print-suggestion={thread.kind === 'suggestion'}>
					<p class="print-annotation-label">
						{thread.kind === 'suggestion' ? 'Suggestion' : 'Comment'} by {thread.author}
						- line {thread.currentLine ?? thread.line}
					</p>

					{#if thread.quote}
						<blockquote>{thread.quote}</blockquote>
					{/if}

					<p>{thread.body}</p>
				</article>
			{/each}
		</section>
	{/if}
</section>
