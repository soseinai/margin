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

The web test lanes are:

```sh
npm run test:web:unit
npm run test:web:integration
npm run test:web:e2e
```

`test:web:e2e` is reserved for real outer-system coverage. It currently runs the opt-in live Sosein Cloud tests in `apps/web/tests/e2e`, and skips unless `MARGIN_SOSEIN_LIVE_URL` and `MARGIN_SOSEIN_E2E_AUTH_TOKEN` are set. Install the browser used by Playwright tests with `just setup-web-integration` on local machines; CI installs Chromium before running the test gate.

## Performance Profiling

Use the typing profiler when editor input feels slow or when changing CodeMirror live preview, parser, source-mode, or decoration code:

```sh
just profile
```

The recipe delegates to `npm run profile:typing`. It starts the web app in desktop-preview mode, loads generated Markdown documents, types into the editor, and prints timing summaries for parse, model, decoration, and total transaction cost.

Useful overrides:

```sh
MARGIN_TYPING_PROFILE_SECTIONS=320,800 just profile
MARGIN_TYPING_PROFILE_TEXT=abcdefghijklmnopqrst just profile
MARGIN_TYPING_PROFILE_DELAY_MS=15 just profile
```

Treat the output as a local performance signal, not a deterministic test gate. If `decorationsMean` dominates, look at live-preview decoration scope; if `parseMean` dominates on very large documents, look at parser incrementality or moving parsing off the main thread.

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

Command: `npm run test:web:unit`.

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

Command: `npm run test:web:integration`.

### E2E Tests

E2E tests live in `apps/web/tests/e2e` and use `apps/web/playwright.e2e.config.ts`.

Reserve E2E for flows that include the real outer systems, such as the Tauri desktop shell, filesystem/native commands, or a real cloud backend. Browser-level Playwright coverage with mocked native/cloud adapters belongs in integration testing.

The Sosein live E2E lane is opt-in. It authenticates through the Sosein Cloud E2E session mint contract:

```sh
MARGIN_SOSEIN_LIVE_URL=https://api-staging.sosein.ai \
MARGIN_SOSEIN_E2E_AUTH_TOKEN=... \
just test-web-e2e
```

Release preflight should exercise the same live lane through:

```sh
MARGIN_SOSEIN_LIVE_URL=https://api-staging.sosein.ai \
MARGIN_SOSEIN_E2E_AUTH_TOKEN=... \
just release-preflight
```

Required live E2E variables:

- `MARGIN_SOSEIN_LIVE_URL`
- `MARGIN_SOSEIN_E2E_AUTH_TOKEN`

### Sosein Cloud Staging Handoff

Margin expects Sosein Cloud to provide the same E2E auth shape locally and in staging:

- `POST /v1/e2e/session` with `Authorization: Bearer <token>` should mint a normal short-lived user session for release E2E.
- The mechanism should be disabled by default, enabled for local/staging E2E, and impossible to enable accidentally in production.
- Public staging should authenticate the E2E mint path with a high-entropy secret stored outside the repo.
- The mint path should create sessions only for a fixed E2E account/workspace, not accept arbitrary email or workspace input from the caller.
- The minted session should have ordinary user privileges only, with no admin or internal-admin capabilities.
- The session and any E2E-created documents should be easy to identify and clean up, for example by a fixed workspace plus `e2e-` document prefixes.
- The API should log/audit mint requests with request id and account/workspace/user ids.

## Native Boundary

The web app should not need a real Tauri shell for most tests. Treat native functionality as an adapter boundary:

- Unit-test path and payload normalization in TypeScript.
- Mock `window.__TAURI__.core.invoke` for frontend adapter tests.
- Keep Rust command tests in the desktop crate for filesystem permissions, recent-documents persistence, watchers, and menu/deep-link command behavior.

## What To Add With New Work

- Unit: pure Markdown/editor model changes and isolated components should add or update Vitest coverage.
- Integration: flows spanning several components, app state, adapter behavior, CodeMirror interactions, selections, and decorations should get integration coverage.
- E2E: use only when the change intentionally automates real desktop shell, native filesystem, or cloud backend behavior.
- File persistence change: test the serialized Markdown body and embedded comment/suggestion block round trip.
- Future cloud storage change: test provider contracts separately from local embedded comment blocks. In cloud mode, cloud state remains the source of truth; embedded Markdown metadata is only a local/export compatibility format.

<!-- margin:comments
{
  "schema": "margin.markdown-comments",
  "version": 1,
  "annotations_id": "local-annotations:1777740670506",
  "author": "aishfenton",
  "comments": [
    {
      "id": "local-comment-1777740724801",
      "author": "aishfenton",
      "body": "ABC",
      "resolved": false,
      "anchor": {
        "start_line": 11,
        "end_line": 11,
        "quote": "Verification Gates",
        "prefix": "atting/lint checks, the Svelte typecheck, and web unit/property tests before the web build.\n\n## ",
        "suffix": "\n\nThese commands are not all tests, but they should run for every frontend PR:\n\n```sh\ncargo fmt ",
        "heading_path": [
          "Frontend Testing Strategy",
          "Current State"
        ],
        "content_hash": "local-jd4lt6"
      },
      "created_at": "2026-05-02T16:52:04.801Z"
    },
    {
      "id": "local-comment-1777740730150",
      "author": "aishfenton",
      "body": "ASVABVA",
      "resolved": false,
      "anchor": {
        "start_line": 24,
        "end_line": 24,
        "quote": "buildability gate, not a test; it",
        "prefix": "egration failures that Vite can miss. `vitest` is the fast test gate. The production build is a ",
        "suffix": "catches bundling, asset, dynamic import, and browser-entry issues.\n\nThere is no dedicated fronte",
        "heading_path": [
          "Frontend Testing Strategy",
          "Verification Gates"
        ],
        "content_hash": "local-1ydecke"
      },
      "created_at": "2026-05-02T16:52:10.151Z"
    }
  ],
  "suggestions": [],
  "updated_at": "2026-05-02T16:52:38.986Z"
}
-->
