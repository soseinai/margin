<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import type { Action } from 'svelte/action';

	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { authorInitials, avatarStyle } from '$lib/features/app/local-identity';
	import type { MarginItem, ThreadView } from '$lib/app-types';

	type MaybePromise<T = void> = T | Promise<T>;

	export let marginRailOpen = false;
	export let stageHeight = 720;
	export let marginItems: MarginItem[] = [];
	export let activeThreadId = '';
	export let selectedThreadId = '';
	export let commentComposerAttention = false;
	export let localAuthor = '';
	export let commentTextarea: HTMLElement | null = null;
	export let commentBody = '';
	export let selectionReady: unknown = false;
	export let editingCommentId = '';
	export let editingCommentTextarea: HTMLElement | null = null;
	export let editingCommentBody = '';
	export let measureHeight: Action<HTMLElement, string> = () => {};
	export let threadIsResolving: (threadId: string) => boolean = () => false;
	export let connectorPath: (item: MarginItem, focused?: boolean) => string = () => '';
	export let connectorSourceRadius: (item: MarginItem, focused?: boolean) => number = () => 0;
	export let clearSelection: () => void = () => {};
	export let submitComment: () => MaybePromise = () => {};
	export let goToThread: (thread: ThreadView) => void = () => {};
	export let previewThread: (threadId: string) => void = () => {};
	export let clearThreadPreview: () => void = () => {};
	export let startEditingComment: (thread: ThreadView) => void = () => {};
	export let resolveComment: (thread: ThreadView) => MaybePromise = () => {};
	export let cancelCommentEdit: () => void = () => {};
	export let saveEditedComment: (commentId: string) => MaybePromise = () => {};
	export let suggestionStatusLabel: (thread: ThreadView) => string = () => '';
	export let diffQuote: (thread: ThreadView) => string = () => '';
	export let diffLines: (value: string) => string[] = () => [];
	export let diffBody: (thread: ThreadView) => string = () => '';
	export let acceptSuggestion: (thread: ThreadView) => MaybePromise = () => {};
	export let rejectSuggestion: (thread: ThreadView) => MaybePromise = () => {};
	export let resolveSuggestion: (thread: ThreadView) => MaybePromise = () => {};
</script>

<aside
	class="margin-rail"
	class:open={marginRailOpen}
	class:empty={!marginRailOpen}
	aria-label="Document comments"
>
	<div
		class="comment-stage"
		style={`min-height: ${stageHeight}px;`}
	>
		{#if marginItems.length > 0}
			<svg
				class="connector-layer"
				class:has-selected-thread={Boolean(selectedThreadId)}
				viewBox={`0 0 340 ${stageHeight}`}
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				{#each marginItems as item, index (item.id)}
					<path
						class="connector-shadow"
						class:connector-suggestion={item.connectorKind === 'suggestion'}
						class:connector-composer={item.type === 'composer'}
						class:connector-active={activeThreadId === item.id}
						class:connector-selected={selectedThreadId === item.id}
						class:connector-resolving={threadIsResolving(item.id)}
						d={connectorPath(item, activeThreadId === item.id)}
						style={`--thread-index: ${index};`}
					></path>

					<path
						class:connector-suggestion={item.connectorKind === 'suggestion'}
						class:connector-composer={item.type === 'composer'}
						class:connector-active={activeThreadId === item.id}
						class:connector-selected={selectedThreadId === item.id}
						class:connector-resolving={threadIsResolving(item.id)}
						d={connectorPath(item, activeThreadId === item.id)}
						style={`--thread-index: ${index};`}
					></path>

					<circle
						class="connector-source"
						class:connector-suggestion={item.connectorKind === 'suggestion'}
						class:connector-composer={item.type === 'composer'}
						class:connector-active={activeThreadId === item.id}
						class:connector-selected={selectedThreadId === item.id}
						class:connector-resolving={threadIsResolving(item.id)}
						cx="0"
						cy={Math.max(12, item.anchorTop)}
						r={connectorSourceRadius(item, activeThreadId === item.id)}
						style={`--thread-index: ${index}; --connector-source-radius: ${connectorSourceRadius(item, activeThreadId === item.id)}px;`}
					></circle>
				{/each}
			</svg>
		{/if}

		{#each marginItems as item, index (item.id)}
			{#if item.type === 'composer'}
				<section
					class="inline-composer"
					class:needs-attention={commentComposerAttention}
					aria-label="New comment"
					style={`--thread-index: ${index}; top: ${item.top}px;`}
					use:measureHeight={item.id}
				>
					<div class="composer-author">
						<div class="avatar" style={avatarStyle(localAuthor)}>{authorInitials(localAuthor)}</div>
						<strong>{localAuthor}</strong>
					</div>

					<Textarea
						bind:ref={commentTextarea}
						bind:value={commentBody}
						autocapitalize="sentences"
						autocomplete="off"
						autocorrect="off"
						placeholder="Add a comment"
						spellcheck={true}
					/>

					<div class="composer-actions">
						<Button
							variant="outline"
							size="sm"
							class="ghost-button"
							onclick={clearSelection}
						>Cancel</Button>

						<Button
							size="sm"
							class="primary"
							onclick={submitComment}
							disabled={!selectionReady || !commentBody}
						>Comment</Button>
					</div>
				</section>
			{:else}
				<div
					class:thread-card={true}
					class:suggestion={item.thread.kind === 'suggestion'}
					class:pending={item.thread.pending}
					class:rejected={item.thread.status === 'rejected'}
					class:resolved={item.thread.status === 'resolved'}
					class:focused={activeThreadId === item.thread.id}
					class:selected={selectedThreadId === item.thread.id}
					class:resolving-comment={threadIsResolving(item.thread.id)}
					class:editing-comment={item.thread.kind === 'comment' && editingCommentId === item.thread.id}
					role="button"
					aria-label={item.thread.kind === 'comment' && editingCommentId === item.thread.id ? 'Edit comment' : `Go to ${item.thread.kind}`}
					tabindex={item.thread.kind === 'comment' && editingCommentId === item.thread.id ? -1 : 0}
					style={`--thread-index: ${index}; top: ${item.top}px;`}
					onclick={() => {
						if (item.thread.kind === 'comment' && editingCommentId === item.thread.id) return;

						goToThread(item.thread);
					}}
					onkeydown={(event) => {
						if (item.thread.kind === 'comment' && editingCommentId === item.thread.id) return;
						if (event.key === 'Enter') goToThread(item.thread);
					}}
					onmouseenter={() => previewThread(item.thread.id)}
					onmouseleave={clearThreadPreview}
					use:measureHeight={item.id}
				>
					{#if item.thread.kind === 'comment' && editingCommentId === item.thread.id}
						<section
							class="inline-composer comment-edit-form"
							aria-label="Edit comment"
						>
							<div class="composer-author">
								<div class="avatar" style={avatarStyle(item.thread.author)}>{authorInitials(item.thread.author)}</div>
								<strong>{item.thread.author}</strong>
							</div>

							<Textarea
								bind:ref={editingCommentTextarea}
								bind:value={editingCommentBody}
								aria-label="Edit comment"
								autocapitalize="sentences"
								autocomplete="off"
								autocorrect="off"
								placeholder="Edit comment"
								spellcheck={true}
							/>

							<div class="composer-actions">
								<Button
									variant="outline"
									size="sm"
									class="ghost-button"
									onclick={(event) => {
										event.stopPropagation();
										cancelCommentEdit();
									}}
								>Cancel</Button>

								<Button
									size="sm"
									class="primary"
									aria-label="Save comment"
									disabled={!editingCommentBody.trim() || editingCommentBody === item.thread.body}
									onclick={(event) => {
										event.stopPropagation();
										saveEditedComment(item.thread.id);
									}}
								>Save</Button>
							</div>
						</section>
					{:else}
						<div class="thread-header">
							<div class="avatar" style={avatarStyle(item.thread.author)}>{authorInitials(item.thread.author)}</div>

							<div>
								<strong>{item.thread.author}</strong>
							</div>

							{#if item.thread.kind === 'suggestion'}
								<Badge
									variant="outline"
									class="status-pill"
								>{suggestionStatusLabel(item.thread)}</Badge>
							{:else}
								<div class="thread-header-actions">
									<Button
										variant="ghost"
										size="icon-sm"
										class="thread-icon-button thread-edit-button"
										aria-label="Edit comment"
										title="Edit comment"
										onclick={(event) => {
											event.stopPropagation();
											startEditingComment(item.thread);
										}}
									>
										<PencilIcon aria-hidden="true" />
									</Button>

									<Button
										variant="ghost"
										size="icon-sm"
										class="thread-icon-button thread-resolve-button"
										aria-label="Resolve comment"
										title="Resolve comment"
										disabled={threadIsResolving(item.thread.id)}
										onclick={(event) => {
											event.stopPropagation();
											resolveComment(item.thread);
										}}
									>
										<CheckIcon aria-hidden="true" />
									</Button>
								</div>
							{/if}
						</div>

						{#if item.thread.kind === 'suggestion'}
							<div
								class="suggestion-diff"
								aria-label="Suggested change"
							>
								{#if diffQuote(item.thread)}
									<div class="diff-group removed">
										<span class="diff-label">Remove</span>

										{#each diffLines(diffQuote(item.thread)) as line}
											<pre><span>-</span><code>{line}</code></pre>
										{/each}
									</div>
								{/if}

								{#if diffBody(item.thread)}
									<div class="diff-group added">
										<span class="diff-label">Add</span>

										{#each diffLines(diffBody(item.thread)) as line}
											<pre><span>+</span><code>{line}</code></pre>
										{/each}
									</div>
								{/if}
							</div>
						{:else}
							<blockquote>{item.thread.quote}</blockquote>
							<p>{item.thread.body}</p>
						{/if}
					{/if}

					{#if item.thread.kind === 'suggestion'}
						<div class="thread-actions">
							<Button
								variant="ghost"
								size="sm"
								onclick={(event) => {
									event.stopPropagation();
									acceptSuggestion(item.thread);
								}}
								disabled={!item.thread.pending && item.thread.status === 'applied'}
							>Accept</Button>

							<Button
								variant="ghost"
								size="sm"
								onclick={(event) => {
									event.stopPropagation();
									rejectSuggestion(item.thread);
								}}
								disabled={item.thread.status === 'rejected'}
							>Reject</Button>

							<Button
								variant="ghost"
								size="sm"
								onclick={(event) => {
									event.stopPropagation();
									resolveSuggestion(item.thread);
								}}
								disabled={item.thread.status === 'resolved'}
							>Resolve</Button>
						</div>
					{/if}
				</div>
			{/if}
		{/each}
	</div>
</aside>
