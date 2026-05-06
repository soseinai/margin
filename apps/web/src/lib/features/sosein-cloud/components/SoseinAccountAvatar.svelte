<script lang="ts">
	import { authorInitials, avatarStyle } from '$lib/features/app/local-identity';
	import { soseinStoredUserDisplayName, type SoseinStoredUser } from '$lib/features/sosein-cloud/sosein-cloud';

	export let user: SoseinStoredUser | null = null;

	let imageFailed = false;
	let previousProfilePictureUrl = '';

	$: accountLabel = user ? soseinStoredUserDisplayName(user) : 'Sosein';
	$: profilePictureUrl = user?.profilePictureUrl ?? '';
	$: if (profilePictureUrl !== previousProfilePictureUrl) {
		previousProfilePictureUrl = profilePictureUrl;
		imageFailed = false;
	}
</script>

{#if profilePictureUrl && !imageFailed}
	<img
		class="sosein-account-avatar"
		src={profilePictureUrl}
		alt=""
		aria-hidden="true"
		draggable="false"
		referrerpolicy="no-referrer"
		onerror={() => imageFailed = true}
	/>
{:else}
	<span
		class="sosein-account-avatar sosein-account-avatar-fallback"
		style={avatarStyle(accountLabel)}
		aria-hidden="true"
	>{authorInitials(accountLabel)}</span>
{/if}
