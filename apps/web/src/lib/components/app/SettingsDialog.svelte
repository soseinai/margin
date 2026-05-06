<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import XIcon from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { authorInitials, avatarStyle } from '$lib/local-identity';
	import type {
		AppUpdateCheckState,
		AppUpdateMetadata,
		ThemeSetting
	} from '$lib/app-types';

	type MaybePromise<T = void> = T | Promise<T>;

	export let open = false;
	export let themeOptions: ThemeSetting[] = [];
	export let settingsDraftTheme: ThemeSetting = 'auto';
	export let settingsDraftLocalUserName = '';
	export let desktopShell = false;
	export let updateCheckState: AppUpdateCheckState = 'idle';
	export let updateStatusMessage = '';
	export let availableAppUpdate: AppUpdateMetadata | null = null;
	export let settingsError = '';
	export let closeSettingsDialog: () => void = () => {};
	export let updateSettingsTheme: (theme: ThemeSetting) => void = () => {};
	export let updateSettingsLocalUserName: (value: string) => void = () => {};
	export let checkForDesktopUpdate: (manual: boolean) => MaybePromise = () => {};
	export let installDesktopUpdate: () => MaybePromise = () => {};
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="settings-dialog app-settings-dialog"
		aria-labelledby="settings-title"
		showCloseButton={false}
	>
		<div class="settings-window-layout">
			<aside class="settings-sidebar" aria-label="Settings areas">
				<div class="settings-sidebar-list">
					<button class="settings-sidebar-item active" type="button" aria-current="page">
						<span class="settings-sidebar-icon">
							<SettingsIcon aria-hidden="true" />
						</span>
						<span>General</span>
					</button>
				</div>
			</aside>

			<section class="settings-pane" aria-labelledby="settings-title">
				<Dialog.Header class="settings-dialog-header settings-pane-header">
					<div>
						<p class="eyebrow">Margin</p>
						<Dialog.Title id="settings-title">General</Dialog.Title>
					</div>

					<Button
						variant="ghost"
						size="icon-sm"
						class="icon-button"
						aria-label="Close settings"
						onclick={closeSettingsDialog}
					>
						<XIcon aria-hidden="true" />
					</Button>
				</Dialog.Header>

				<div class="settings-pane-body">
					<section class="settings-group" aria-label="General settings">
						<div class="settings-row">
							<div class="settings-row-copy">
								<Label>Theme</Label>
							</div>

							<div class="settings-row-control">
								<ToggleGroup.Root
									class="theme-segmented-control"
									type="single"
									aria-label="Theme"
									value={settingsDraftTheme}
								>
									{#each themeOptions as theme}
										<ToggleGroup.Item
											class={`theme-option${settingsDraftTheme === theme ? ' active' : ''}`}
											value={theme}
											onclick={() => updateSettingsTheme(theme)}
										>
											<span>{theme === 'auto' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'}</span>
										</ToggleGroup.Item>
									{/each}
								</ToggleGroup.Root>
							</div>
						</div>

						<div class="settings-row">
							<div class="settings-row-copy">
								<Label for="settings-local-user-name">Local name</Label>
								<p>Shown on local comments and suggestions.</p>
							</div>

							<div class="settings-row-control">
								<div class="settings-user-control">
									<div class="avatar" style={avatarStyle(settingsDraftLocalUserName)}>{authorInitials(settingsDraftLocalUserName)}</div>
									<input
										id="settings-local-user-name"
										class="settings-text-input"
										value={settingsDraftLocalUserName}
										oninput={(event) => updateSettingsLocalUserName((event.currentTarget as HTMLInputElement).value)}
										autocomplete="name"
										maxlength="80"
									/>
								</div>
							</div>
						</div>
					</section>

					{#if desktopShell}
						<section class="settings-group" aria-label="Application updates">
							<div class="settings-row">
								<div class="settings-row-copy">
									<Label id="settings-updates-title">Updates</Label>
									<p class={`settings-update-status${updateCheckState === 'error' ? ' error' : ''}`}>
										{updateStatusMessage || 'Check for newer desktop builds.'}
									</p>
								</div>

								<div class="settings-row-control">
									<Button
										variant="outline"
										size="sm"
										class="ghost-button settings-update-check"
										onclick={() => checkForDesktopUpdate(true)}
										disabled={updateCheckState === 'checking' || updateCheckState === 'installing'}
									>
										<RefreshCwIcon aria-hidden="true" />
										<span>{updateCheckState === 'checking' ? 'Checking' : 'Check'}</span>
									</Button>
								</div>
							</div>

							{#if availableAppUpdate}
								<div class="settings-row">
									<div class="settings-row-copy">
										<Label>Available update</Label>
										<p>Version {availableAppUpdate.version} is available.</p>
									</div>

									<div class="settings-row-control">
										<div class="settings-update-available">
											{#if availableAppUpdate.notes}
												<p>{availableAppUpdate.notes}</p>
											{/if}
											<Button
												size="sm"
												class="primary settings-update-install"
												onclick={installDesktopUpdate}
												disabled={updateCheckState === 'installing'}
											>
												<DownloadIcon aria-hidden="true" />
												<span>{updateCheckState === 'installing' ? 'Installing' : 'Install and Relaunch'}</span>
											</Button>
										</div>
									</div>
								</div>
							{/if}
						</section>
					{/if}

					{#if settingsError}
						<p class="settings-error">{settingsError}</p>
					{/if}
				</div>
			</section>
		</div>
	</Dialog.Content>
</Dialog.Root>
