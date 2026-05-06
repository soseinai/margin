# Sosein Cloud Workspace Architecture

## Decision

Margin treats Sosein Cloud connection as account state, but treats local editing and cloud editing as separate window-scoped workspace modes.

Opening or creating a Sosein Cloud workspace should create or focus a Margin window in cloud mode. Opening Margin from the local filesystem, including via `margin path/to/file.md`, should create or focus a Margin window in local mode. A single window should not mix local filesystem tabs with Sosein Cloud tabs.

## Workspace Modes

Margin has two workspace modes:

```ts
type WorkspaceMode =
  | { kind: 'local'; rootPath?: string }
  | { kind: 'sosein'; serverUrl: string; workspaceId: string; userEmail: string };
```

Local mode owns local Markdown behavior:

- the left panel is a local folder tree
- tabs are local Markdown documents
- save state refers to disk or browser file handles
- native file watching and changed-on-disk prompts apply
- local relative paths, including image references, are resolved from the file location

Sosein mode owns cloud document behavior:

- the left panel is a Sosein document list for the active workspace
- tabs are Sosein Cloud documents only
- clicking a cloud document opens it in the existing Margin editor for live editing
- save state refers to Sosein sync status
- Yjs/Yrs document state is the cloud source of truth
- Markdown snapshots and embedded Margin metadata are compatibility/export artifacts, not the cloud system of record

## User Model

Connecting to Sosein Cloud does not convert the current local window. It enables cloud workspace actions such as "Open Cloud Workspace". Choosing that action should open or focus the user's Sosein workspace window and leave the local window untouched.

If a user opens a local file while a cloud workspace is already open, Margin should open or focus a local-mode window for that file. If a user opens Sosein Cloud from a local window, Margin should open or focus the cloud-mode window.

Crossing the local/cloud boundary should be explicit. Examples:

- `Import Local Markdown...` creates a new cloud document from a local Markdown snapshot.
- `Export Markdown...` writes a cloud document snapshot to a local Markdown file.
- `Save As...` from a cloud document should be framed as export, not as changing the document's storage provider.

## Rationale

The current editor can technically carry local and cloud metadata per tab, but mixed tabs make the product harder to reason about. A single window containing both local and cloud documents blurs important questions:

- does Save write to disk or sync to cloud?
- should the file tree or cloud document list be shown?
- do changed-on-disk prompts apply?
- how should local image references resolve in a cloud document?
- does closing or disconnecting from Sosein affect local work in the same tab set?

A window-scoped workspace mode keeps those answers stable and visible. It also preserves Sosein Cloud's storage boundary: cloud documents are Yjs-backed documents, while local documents are Markdown files.

## Implementation Shape

The frontend should move toward a workspace navigator abstraction instead of treating the file tree as a local-only permanent surface.

- `WorkspaceMode` determines which navigator is mounted.
- Local mode mounts the existing file tree and opens local Markdown documents.
- Sosein mode mounts a cloud document list and opens Sosein documents.
- Command palette entries should be mode-aware.
- Tab restore, close confirmation, save state, and titlebar location text should derive from the active window mode.
- Sosein account/session persistence should stay separate from window workspace mode, so signing in does not force every window into cloud mode.

The first implementation should prefer simple window-level separation over automatic conversion, tab migration, or mixed-mode tab sets.
