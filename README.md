# Margin

Margin is a standalone Markdown editor with margin comments. The free desktop app opens local Markdown files directly, stores comments inside the Markdown file itself, and does not require a server.

A later paid product may add cloud-backed files. This app keeps that as a future storage-provider boundary for opening, saving, and commenting on cloud files without making the local editor depend on cloud infrastructure.

## Stack

- Svelte 5 + TypeScript + Vite SPA
- Tauri v2 desktop shell with local file IPC

## Run Locally

Install dependencies:

```sh
just setup
```

Start the desktop app:

```sh
just dev-desktop
```

Start the web app:

```sh
just dev-web
```

Open `http://127.0.0.1:5173`.

The standalone editor does not require an API server.

## Build and Deploy

Margin uses [`just`](https://github.com/casey/just) as the project CLI. Run `just` to list commands.

```sh
just check
just test
just build
just deploy local
```

`just build` builds the Svelte web app. `just build-all` also builds the Tauri desktop app. Remote deploy targets such as `staging` and `production` are reserved in the `justfile` but intentionally fail until hosting infrastructure is configured.

## Desktop

```sh
just dev-desktop
```

The desktop app is a Tauri wrapper around the same Svelte SPA. It supports native new/open/save, recent documents, drag-and-drop Markdown files, Finder Open With, and the `margin://` URL scheme.

Package a local unsigned macOS app bundle:

```sh
just package-mac-app
```

That produces `target/release/bundle/macos/Margin.app`. To create a shareable unsigned disk image instead, run `just package-mac-dmg`; it stages the app with an Applications symlink and creates `target/release/bundle/dmg/Margin_0.1.0_aarch64.dmg`. Signing and notarization are intentionally left for a release pipeline.

## Product Shape

The current free desktop slice includes:

- standalone local Markdown editing
- comments embedded at the bottom of the Markdown file
- selected-text comments
- selected-text replacement suggestions
- robust anchor payloads with lines, quote, context, heading path, and content hash

Cloud-backed opening, saving, and commenting are intentionally left as a future storage-provider boundary.
