# Frontend Testing Strategy

Margin's frontend risk is concentrated in the editor workflow: Markdown editing, live preview decorations, comments, suggestions, local file persistence, tabs, and the native shell bridge. The test suite should protect those workflows without making every change depend on a full desktop app run.

## Current State

- `apps/web/src/lib/*.test.ts` runs with Vitest and covers extracted helpers for embedded comment blocks, draft suggestions, ordered list markers, and fragile editor CSS metrics.
- Most user-visible behavior still lives inside `apps/web/src/App.svelte`, which makes it hard to test without browser automation.
- CI now runs Rust formatting/lint checks, the Svelte typecheck, and web unit/property tests before the web build.

## Verification Gates

These commands are not all tests, but they should run for every frontend PR:

```sh
cargo fmt --all -- --check
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
npm --workspace @margin/web run check
npm run test:web
npm run build:web
```

Rust formatting and Clippy catch desktop-shell drift before it reaches packaging. `svelte-check` catches Svelte/TypeScript integration failures that Vite can miss. `vitest` is the fast test gate. The production build is a buildability gate, not a test; it catches bundling, asset, dynamic import, and browser-entry issues.

There is no dedicated frontend lint command configured yet. Until one is added, `svelte-check` is the frontend static-analysis gate.

## Test Groups

### Unit Tests

Use Vitest for deterministic logic and `fast-check` for document transformations where examples miss edge cases.

Pure logic candidates:

- Markdown/comment block round trips.
- Suggestion diff generation and reconstruction.
- Anchor calculation and relocation.
- List, table, image, footnote, and frontmatter parsing.
- Local persistence snapshots and dirty-state decisions.
- Path normalization and local/native file destination handling.

Component unit candidates:

- Tab bar state: active tab, dirty marker, close behavior.
- Settings dialog: selected theme, saved/error states.
- Margin rail cards: comment, pending composer, applied/rejected/resolved suggestions.
- Topbar actions: enabled/disabled save/open/new affordances.

Component unit tests should mount one bounded component with mocked dependencies and assert accessible roles, labels, and visible state rather than component internals.

Rule of thumb: when changing behavior currently embedded in `App.svelte`, extract the pure part into `apps/web/src/lib/` and add focused Vitest coverage there. Keep CodeMirror/Svelte wiring thin and test the underlying model directly.

### Integration Tests

Use integration tests for behavior that spans several components or frontend subsystems.

Non-browser integration candidates:

- Editor shell plus margin rail state: selection creates a composer and submit creates a visible card.
- Tab bar plus document state: dirty state follows edits, tab switches, and close decisions.
- Settings dialog plus app theme state: saved theme updates the document theme and survives reload setup.
- Browser/Tauri adapter plus document loading state, using mocked `window.__TAURI__`, picker APIs, and local storage.

Use Playwright for browser integration flows that only become trustworthy in a real browser with CodeMirror mounted.

Browser integration candidates:

- Start on a blank document, type Markdown, and see the live-preview surface update.
- Add a selected-text comment and verify the margin card anchors to the text.
- Switch to suggest mode, edit selected text, then accept and reject suggestions.
- Save/reopen Markdown with embedded local comments and suggestions intact.
- Manage multiple tabs without losing unsaved work.
- Change theme settings and verify persistence across reload.

Keep the first browser suite small and deterministic. It should run against `npm run dev:web` and cover the happy path plus one persistence regression. Larger visual/layout checks can remain local or release-gated until they are stable in CI.

### E2E Tests

No tests belong in this group yet.

Reserve E2E for flows that include the real outer systems, such as the Tauri desktop shell, filesystem/native commands, or a future real cloud backend. Until those are part of the automated path, browser-level Playwright coverage should stay classified as integration testing.

## Native Boundary

The web app should not need a real Tauri shell for most tests. Treat native functionality as an adapter boundary:

- Unit-test path and payload normalization in TypeScript.
- Mock `window.__TAURI__.core.invoke` for frontend adapter tests.
- Keep Rust command tests in the desktop crate for filesystem permissions, recent-documents persistence, watchers, and menu/deep-link command behavior.

## What To Add With New Work

- Unit: pure Markdown/editor model changes and isolated components should add or update Vitest coverage.
- Integration: flows spanning several components, app state, adapter behavior, CodeMirror interactions, selections, and decorations should get integration coverage.
- E2E: leave empty for now unless the change intentionally automates real desktop shell, native filesystem, or future cloud backend behavior.
- File persistence change: test the serialized Markdown body and embedded comment/suggestion block round trip.
- Future cloud storage change: test provider contracts separately from local embedded comment blocks. In cloud mode, cloud state remains the source of truth; embedded Markdown metadata is only a local/export compatibility format.
