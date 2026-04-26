<script lang="ts">
  import {
    defaultKeymap,
    history,
    historyKeymap,
    indentLess,
    indentMore,
    insertNewlineAndIndent
  } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { ChangeSet, EditorState, StateEffect, StateField, type Extension, type Line, type Range } from '@codemirror/state';
  import { Decoration, EditorView, WidgetType, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view';
  import { onMount, tick } from 'svelte';
  import { api } from './lib/api';
  import { draftMarkdownSuggestions, suggestionKey } from './lib/draft-suggestions';
  import type { ApiAnchor, DocumentResponse, PublishResponse, Review } from './lib/types';

  let documentData: DocumentResponse | null = null;
  let review: Review | null = null;
  let publishResult: PublishResponse | null = null;
  let editorMarkdown = '';
  let baseMarkdown = '';
  let pendingEditThreads: ThreadView[] = [];
  let selectedQuote = '';
  let commentBody = '';
  let replacementBody = '';
  let mode: 'comment' | 'suggest' = 'comment';
  let error = '';
  let saving = false;
  let liveStatus = 'offline';
  let documentSurface: HTMLElement;
  let fileInput: HTMLInputElement;
  let mainEditor: EditorView | null = null;
  let selectionToolbar = { visible: false, top: 0, left: 0 };
  let selectedLineTop = 0;
  let documentHeight = 720;
  let lineTops: Record<number, number> = {};
  let annotationTops: Record<string, number> = {};
  let cardHeights: Record<string, number> = {};
  let persistedThreads: ThreadView[] = [];
  let threads: ThreadView[] = [];
  let marginItems: MarginItem[] = [];
  let stageHeight = 720;
  let activeThreadId = '';
  let syncingEditorSuggestions = false;
  let draftChanges = ChangeSet.empty(0);
  let documentSessionKey = 'sample';
  let localFileMode = false;
  let localFileHandle: MarkdownFileHandle | null = null;
  let localFileName = '';
  let saveState: 'idle' | 'dirty' | 'saving' | 'saved' = 'idle';
  let saveMessage = '';
  let reviewEvents: EventSource | null = null;
  let unlistenNativeInsertMenu: (() => void) | null = null;
  const syncedEditKeys = new Set<string>();

  const reviewer = 'Aisha Fenton';
  const gutterCardGap = 14;
  const gutterReservedTop = 86;
  const markdownFileTypes = [
    {
      description: 'Markdown documents',
      accept: {
        'text/markdown': ['.md', '.markdown'],
        'text/plain': ['.md', '.markdown', '.txt']
      }
    }
  ];
  const insertBlocks: Record<InsertBlockKind, { label: string; markdown: string; cursorText: string }> = {
    table: {
      label: 'Table',
      markdown: '| Column | Owner | Status |\n| --- | --- | --- |\n| Item | Team | Draft |',
      cursorText: 'Column'
    },
    tasks: {
      label: 'Task list',
      markdown: '- [ ] Task\n- [ ] Task',
      cursorText: 'Task'
    },
    bullets: {
      label: 'Bullet list',
      markdown: '- Item\n- Item',
      cursorText: 'Item'
    },
    numbers: {
      label: 'Numbered list',
      markdown: '1. Item\n2. Item',
      cursorText: 'Item'
    }
  };

  type SuggestionStatus = 'applied' | 'rejected' | 'resolved';
  type InsertBlockKind = 'table' | 'tasks' | 'bullets' | 'numbers';

  type TauriEvent<T> = {
    payload: T;
  };

  type TauriWindow = Window &
    typeof globalThis & {
      __TAURI__?: {
        event?: {
          listen?: <T>(event: string, handler: (event: TauriEvent<T>) => void) => Promise<() => void>;
        };
      };
    };

  type MarkdownFileHandle = {
    kind?: string;
    name: string;
    getFile: () => Promise<File>;
    createWritable?: () => Promise<MarkdownWritableFile>;
  };

  type MarkdownWritableFile = {
    write: (contents: string) => Promise<void>;
    close: () => Promise<void>;
  };

  type FilePickerWindow = Window &
    typeof globalThis & {
      showOpenFilePicker?: (options?: {
        multiple?: boolean;
        types?: Array<{
          description: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<MarkdownFileHandle[]>;
      showSaveFilePicker?: (options?: {
        suggestedName?: string;
        types?: Array<{
          description: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<MarkdownFileHandle>;
    };

  type ThreadView = {
    id: string;
    kind: 'comment' | 'suggestion';
    author: string;
    quote: string;
    body: string;
    line: number;
    endLine: number;
    currentLine?: number;
    currentEndLine?: number;
    diffQuote?: string;
    diffBody?: string;
    pending?: boolean;
    applied?: boolean;
    resolved?: boolean;
    status?: SuggestionStatus;
  };

  type MarginItem =
    | {
        type: 'composer';
        id: 'composer';
        top: number;
        anchorTop: number;
        height: number;
        connectorKind: 'comment' | 'suggestion';
      }
    | {
        type: 'thread';
        id: string;
        top: number;
        anchorTop: number;
        height: number;
        connectorKind: 'comment' | 'suggestion';
        thread: ThreadView;
      };

  type SuggestionSurfaceKind = 'add' | 'replace' | 'remove';
  type ThreadRangeMatch = {
    from: number;
    to: number;
    matched: 'body' | 'quote' | 'deletion';
  };

  type LivePreviewState = {
    threads: ThreadView[];
    activeThreadId: string;
    decorations: DecorationSet;
  };

  type SourceBlock = {
    start: number;
    end: number;
    kind: 'line' | 'fenced-code' | 'list' | 'indented' | 'table';
    table?: MarkdownTable;
  };

  type FenceInfo = {
    marker: '`' | '~';
    length: number;
  };

  type ListInfo = {
    indent: number;
    contentIndent: number;
  };

  type MarkdownTable = {
    headers: string[];
    alignments: Array<'left' | 'center' | 'right' | null>;
    rows: string[][];
  };

  class SuggestionWidget extends WidgetType {
    text = '';
    id = '';
    pending = false;
    status: SuggestionStatus = 'applied';
    focused = false;
    label = '';
    kind: SuggestionSurfaceKind = 'replace';

    constructor(
      text: string,
      id: string,
      pending = false,
      status: SuggestionStatus = 'applied',
      focused = false,
      label = 'edit',
      kind: SuggestionSurfaceKind = 'replace'
    ) {
      super();
      this.text = text;
      this.id = id;
      this.pending = pending;
      this.status = status;
      this.focused = focused;
      this.label = label;
      this.kind = kind;
    }

    eq(other: WidgetType) {
      return (
        other instanceof SuggestionWidget &&
        other.text === this.text &&
        other.id === this.id &&
        other.pending === this.pending &&
        other.status === this.status &&
        other.focused === this.focused &&
        other.label === this.label &&
        other.kind === this.kind
      );
    }

    toDOM() {
      const mark = document.createElement('mark');
      mark.className = `annotation-mark suggestion suggestion-${this.kind}${this.text ? '' : ' empty-change'}${this.pending ? ' pending' : ''} is-${this.status}${this.focused ? ' is-focused' : ''}`;
      mark.dataset.threadAnchor = this.id;

      if (this.text) {
        mark.append(document.createTextNode(this.text));
      }

      mark.append(suggestionBadgeElement(this.label));
      return mark;
    }
  }

  class SuggestionBadgeWidget extends WidgetType {
    id = '';
    label = '';
    pending = false;
    status: SuggestionStatus = 'applied';
    focused = false;
    kind: SuggestionSurfaceKind = 'replace';

    constructor(
      id: string,
      label: string,
      pending = false,
      status: SuggestionStatus = 'applied',
      focused = false,
      kind: SuggestionSurfaceKind = 'replace'
    ) {
      super();
      this.id = id;
      this.label = label;
      this.pending = pending;
      this.status = status;
      this.focused = focused;
      this.kind = kind;
    }

    eq(other: WidgetType) {
      return (
        other instanceof SuggestionBadgeWidget &&
        other.id === this.id &&
        other.label === this.label &&
        other.pending === this.pending &&
        other.status === this.status &&
        other.focused === this.focused &&
        other.kind === this.kind
      );
    }

    toDOM() {
      const badge = suggestionBadgeElement(this.label);
      badge.classList.add('inline-suggestion-badge', `suggestion-${this.kind}`, `is-${this.status}`);
      if (this.pending) badge.classList.add('pending');
      if (this.focused) badge.classList.add('is-focused');
      badge.dataset.threadAnchor = this.id;
      return badge;
    }
  }

  function suggestionBadgeElement(label: string) {
    const badge = document.createElement('span');
    badge.className = 'annotation-badge';
    badge.textContent = label;
    return badge;
  }

  class TaskCheckboxWidget extends WidgetType {
    checked = false;
    checkPosition = 0;

    constructor(checked: boolean, checkPosition: number) {
      super();
      this.checked = checked;
      this.checkPosition = checkPosition;
    }

    eq(other: WidgetType) {
      return (
        other instanceof TaskCheckboxWidget &&
        other.checked === this.checked &&
        other.checkPosition === this.checkPosition
      );
    }

    toDOM(view: EditorView) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `task-checkbox-widget${this.checked ? ' checked' : ''}`;
      button.setAttribute('aria-label', this.checked ? 'Mark task incomplete' : 'Mark task complete');
      button.setAttribute('aria-checked', String(this.checked));
      button.setAttribute('role', 'checkbox');
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', (event) => {
        event.preventDefault();
        view.dispatch({
          changes: {
            from: this.checkPosition,
            to: this.checkPosition + 1,
            insert: this.checked ? ' ' : 'x'
          }
        });
        view.focus();
      });
      return button;
    }

    ignoreEvent() {
      return false;
    }
  }

  class MarkdownTableWidget extends WidgetType {
    table: MarkdownTable;
    startLine = 1;
    key = '';

    constructor(table: MarkdownTable, startLine: number) {
      super();
      this.table = table;
      this.startLine = startLine;
      this.key = JSON.stringify(table);
    }

    eq(other: WidgetType) {
      return (
        other instanceof MarkdownTableWidget &&
        other.startLine === this.startLine &&
        other.key === this.key
      );
    }

    toDOM(view: EditorView) {
      const wrapper = document.createElement('div');
      wrapper.className = 'markdown-table-widget';
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'button');
      wrapper.setAttribute('aria-label', 'Edit Markdown table');

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');

      this.table.headers.forEach((header, index) => {
        const cell = document.createElement('th');
        cell.textContent = header;
        setTableCellAlignment(cell, this.table.alignments[index]);
        headerRow.append(cell);
      });

      thead.append(headerRow);
      table.append(thead);

      const tbody = document.createElement('tbody');
      this.table.rows.forEach((row) => {
        const tableRow = document.createElement('tr');
        for (let index = 0; index < this.table.headers.length; index += 1) {
          const cell = document.createElement('td');
          cell.textContent = row[index] ?? '';
          setTableCellAlignment(cell, this.table.alignments[index]);
          tableRow.append(cell);
        }
        tbody.append(tableRow);
      });

      table.append(tbody);
      wrapper.append(table);

      const editTable = (event: Event) => {
        event.preventDefault();
        const line = view.state.doc.line(Math.min(this.startLine, view.state.doc.lines));
        view.dispatch({ selection: { anchor: line.from } });
        view.focus();
      };

      wrapper.addEventListener('mousedown', editTable);
      wrapper.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') editTable(event);
      });

      return wrapper;
    }

    ignoreEvent() {
      return false;
    }
  }

  function setTableCellAlignment(cell: HTMLTableCellElement, alignment: 'left' | 'center' | 'right' | null) {
    if (alignment) cell.dataset.align = alignment;
  }

  const setThreadsEffect = StateEffect.define<ThreadView[]>();
  const setActiveThreadEffect = StateEffect.define<string>();

  const livePreviewField = StateField.define<LivePreviewState>({
    create(state) {
      return { threads: [], activeThreadId: '', decorations: buildLivePreviewDecorations(state, [], '') };
    },
    update(value, transaction) {
      let threadsForState = value.threads;
      let activeThreadForState = value.activeThreadId;
      let threadChange = false;
      let activeThreadChange = false;

      for (const effect of transaction.effects) {
        if (effect.is(setThreadsEffect)) {
          threadsForState = effect.value;
          threadChange = true;
        }
        if (effect.is(setActiveThreadEffect)) {
          activeThreadForState = effect.value;
          activeThreadChange = true;
        }
      }

      if (transaction.docChanged || transaction.selection || threadChange || activeThreadChange) {
        return {
          threads: threadsForState,
          activeThreadId: activeThreadForState,
          decorations: buildLivePreviewDecorations(transaction.state, threadsForState, activeThreadForState)
        };
      }

      return value;
    },
    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
  });

  $: persistedThreads = review
    ? [
        ...review.comments.map((comment) => ({
          id: comment.id,
          kind: 'comment' as const,
          author: comment.author,
          quote: comment.anchor.quote,
          body: comment.body,
          line: comment.anchor.start_line,
          endLine: comment.anchor.end_line,
          diffQuote: comment.anchor.quote,
          diffBody: comment.body
        })),
        ...review.suggestions.map((suggestion) => ({
          id: suggestion.id,
          kind: 'suggestion' as const,
          author: suggestion.author,
          quote: suggestion.original,
          body: suggestion.replacement,
          line: suggestion.anchor.start_line,
          endLine: suggestion.anchor.end_line,
          diffQuote: suggestion.original,
          diffBody: suggestion.replacement,
          applied: suggestion.applied,
          resolved: suggestion.resolved,
          status: suggestion.resolved ? ('resolved' as const) : suggestion.applied ? ('applied' as const) : ('rejected' as const)
        }))
      ].sort((a, b) => a.line - b.line)
    : [];

  $: threads = [...persistedThreads, ...pendingEditThreads].sort((a, b) => a.line - b.line);
  $: selectionReady = selectedQuote.trim().length > 0 && review;
  $: marginItems = layoutMarginItems(
    threads,
    selectedQuote,
    selectedLineTop,
    mode,
    lineTops,
    annotationTops,
    cardHeights
  );
  $: stageHeight = Math.max(
    documentHeight,
    ...marginItems.map((item) => item.top + item.height + 24),
    240
  );
  $: if (mainEditor) {
    mainEditor.dispatch({
      effects: [setThreadsEffect.of(threads), setActiveThreadEffect.of(activeThreadId)]
    });
    requestAnimationFrame(updateAnchorPositions);
  }

  onMount(() => {
    async function load() {
      try {
        const doc = await api.document('sample');
        documentData = doc;
        editorMarkdown = doc.markdown;
        baseMarkdown = doc.markdown;
        documentSessionKey = `repo:${doc.id}:${doc.source_commit}`;
        draftChanges = ChangeSet.empty(doc.markdown.length);
        review = await api.createReview({
          repo: doc.repo,
          file_path: doc.file_path,
          source_commit: doc.source_commit,
          reviewer
        });
        connectEvents(review.id);
        await tick();
        updateAnchorPositions();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unable to load Margin';
      }
    }

    load();
    setupNativeInsertMenuListener();
    window.addEventListener('resize', updateAnchorPositions);
    window.addEventListener('keydown', handleGlobalShortcut);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('resize', updateAnchorPositions);
      window.removeEventListener('keydown', handleGlobalShortcut);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      unlistenNativeInsertMenu?.();
      reviewEvents?.close();
    };
  });

  function buildLivePreviewDecorations(
    state: EditorState,
    activeThreads: ThreadView[],
    focusedThreadId: string
  ) {
    const ranges: Range<Decoration>[] = [];
    const activeLineNumber = state.doc.lineAt(state.selection.main.head).number;
    const fencedBlocks = fencedCodeBlocks(state);
    const tableBlocks = markdownTableBlocks(state);
    const activeBlock = sourceBlockForLine(state, activeLineNumber, fencedBlocks, tableBlocks);

    for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      const text = line.text;
      const active = lineInBlock(line.number, activeBlock);
      const fencedBlock = blockForLine(fencedBlocks, line.number);
      const tableBlock = blockForLine(tableBlocks, line.number);

      if (fencedBlock) {
        const boundary = line.number === fencedBlock.start || line.number === fencedBlock.end;
        const classes = active
          ? `cm-live-codeblock-line ${activeSourceClass(activeBlock, line.number)}`
          : boundary
            ? 'cm-live-code-fence-hidden-line'
            : 'cm-live-codeblock-line';

        ranges.push(Decoration.line({ class: classes }).range(line.from));
        if (!active && boundary && line.from < line.to) {
          ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(line.from, line.to));
        }
        continue;
      }

      if (tableBlock?.table) {
        if (active) {
          ranges.push(
            Decoration.line({
              class: `cm-live-table-source-line ${activeSourceClass(activeBlock, line.number)}`
            }).range(line.from)
          );
          continue;
        }

        if (line.number === tableBlock.start) {
          const blockEnd = state.doc.line(tableBlock.end);
          ranges.push(
            Decoration.replace({
              widget: new MarkdownTableWidget(tableBlock.table, tableBlock.start),
              block: true
            }).range(line.from, blockEnd.to)
          );
          lineNumber = tableBlock.end;
        }
        continue;
      }

      const heading = /^(#{1,6})(\s+)(.*)/.exec(text);
      if (heading) {
        ranges.push(
          Decoration.line({
            class: `cm-live-heading cm-live-heading-${heading[1].length}${active ? ` ${activeSourceClass(activeBlock, line.number)}` : ''}`
          }).range(line.from)
        );
        if (active) {
          ranges.push(
            Decoration.mark({ class: 'cm-markdown-source-syntax cm-markdown-heading-syntax' }).range(
              line.from,
              line.from + heading[1].length + heading[2].length
            )
          );
        }
        if (!active) {
          ranges.push(
            Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(
              line.from,
              line.from + heading[1].length + heading[2].length
            )
          );
          addInlineMarkdownPreview(ranges, line, heading[0].length - heading[3].length);
        }
        continue;
      }

      const task = /^(\s*)([-*+])(\s+)\[([ xX])\](\s+)(.*)/.exec(text);
      if (task) {
        const markerStart = line.from + task[1].length;
        const checkPosition = markerStart + task[2].length + task[3].length + 1;
        const syntaxEnd = checkPosition + 2 + task[5].length;
        const contentOffset = syntaxEnd - line.from;
        const checked = task[4].toLowerCase() === 'x';
        ranges.push(
          Decoration.line({
            class: `cm-live-list-line cm-live-task-line ${checked ? 'cm-task-checked' : 'cm-task-open'}${active ? ` ${activeSourceClass(activeBlock, line.number)}` : ''}`
          }).range(line.from)
        );
        if (active) {
          ranges.push(
            Decoration.mark({ class: 'cm-markdown-source-syntax cm-markdown-list-syntax' }).range(
              markerStart,
              syntaxEnd
            )
          );
        }
        if (!active) {
          ranges.push(
            Decoration.widget({
              widget: new TaskCheckboxWidget(checked, checkPosition),
              side: -1
            }).range(markerStart)
          );
          ranges.push(Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(markerStart, syntaxEnd));
          addInlineMarkdownPreview(ranges, line, contentOffset);
        }
        continue;
      }

      const list = /^(\s*)([-*+])(\s+)(.*)/.exec(text);
      if (list) {
        const markerStart = line.from + list[1].length;
        ranges.push(
          Decoration.line({
            class: `cm-live-list-line${active ? ` ${activeSourceClass(activeBlock, line.number)}` : ''}`
          }).range(line.from)
        );
        if (active) {
          ranges.push(
            Decoration.mark({ class: 'cm-markdown-source-syntax cm-markdown-list-syntax' }).range(
              markerStart,
              markerStart + list[2].length + list[3].length
            )
          );
        }
        if (!active) {
          ranges.push(
            Decoration.mark({ class: 'cm-markdown-syntax-hidden' }).range(
              markerStart,
              markerStart + list[2].length + list[3].length
            )
          );
          addInlineMarkdownPreview(ranges, line, list[1].length + list[2].length + list[3].length);
        }
        continue;
      }

      if (active) {
        ranges.push(Decoration.line({ class: activeSourceClass(activeBlock, line.number) }).range(line.from));
      } else {
        addInlineMarkdownPreview(ranges, line);
      }
    }

    for (const thread of activeThreads) {
      const range = threadRangeInState(state, thread);
      if (!range) continue;

      const focused = focusedThreadId === thread.id ? ' is-focused' : '';
      const statusClass = thread.status ? ` is-${thread.status}` : '';
      const pendingClass = thread.pending ? ' pending' : '';
      const threadClass = `annotation-mark ${thread.kind === 'suggestion' ? 'suggestion' : ''}${pendingClass}${statusClass}${focused}`;
      const shouldReplaceQuote =
        thread.kind === 'suggestion' && thread.status !== 'rejected' && range.matched === 'quote';

      if (thread.kind === 'suggestion' && range.matched === 'deletion') {
        const kind = suggestionSurfaceKind(thread);
        ranges.push(
          Decoration.widget({
            widget: new SuggestionBadgeWidget(
              thread.id,
              suggestionAffordanceLabel(thread),
              thread.pending,
              thread.status ?? 'applied',
              focusedThreadId === thread.id,
              kind
            ),
            side: 1
          }).range(range.from)
        );
        continue;
      }

      if (shouldReplaceQuote) {
        const kind = suggestionSurfaceKind(thread);
        ranges.push(
          Decoration.replace({
            widget: new SuggestionWidget(
              thread.body,
              thread.id,
              thread.pending,
              thread.status ?? 'applied',
              focusedThreadId === thread.id,
              suggestionAffordanceLabel(thread),
              kind
            ),
            inclusive: false
          }).range(range.from, range.to)
        );
      } else {
        ranges.push(
          Decoration.mark({
            class: threadClass,
            attributes: { 'data-thread-anchor': thread.id }
          }).range(range.from, range.to)
        );

        if (thread.kind === 'suggestion' && thread.status !== 'rejected') {
          const kind = suggestionSurfaceKind(thread);
          ranges.push(
            Decoration.widget({
              widget: new SuggestionBadgeWidget(
                thread.id,
                suggestionAffordanceLabel(thread),
                thread.pending,
                thread.status ?? 'applied',
                focusedThreadId === thread.id,
                kind
              ),
              side: 1
            }).range(range.to)
          );
        }
      }
    }

    return Decoration.set(ranges, true);
  }

  function sourceBlockForLine(
    state: EditorState,
    lineNumber: number,
    fencedBlocks: SourceBlock[],
    tableBlocks: SourceBlock[]
  ): SourceBlock {
    const fencedBlock = blockForLine(fencedBlocks, lineNumber);
    if (fencedBlock) return fencedBlock;

    const tableBlock = blockForLine(tableBlocks, lineNumber);
    if (tableBlock) return tableBlock;

    const listBlock = listBlockForLine(state, lineNumber);
    if (listBlock) return listBlock;

    const indentedBlock = indentedBlockForLine(state, lineNumber);
    if (indentedBlock) return indentedBlock;

    return { start: lineNumber, end: lineNumber, kind: 'line' };
  }

  function activeSourceClass(block: SourceBlock, lineNumber: number) {
    if (block.start === block.end) return 'cm-active-source-line';

    const edge =
      lineNumber === block.start
        ? 'cm-active-block-start'
        : lineNumber === block.end
          ? 'cm-active-block-end'
          : 'cm-active-block-middle';

    return `cm-active-source-line cm-active-block-line ${edge}`;
  }

  function lineInBlock(lineNumber: number, block: SourceBlock) {
    return lineNumber >= block.start && lineNumber <= block.end;
  }

  function blockForLine(blocks: SourceBlock[], lineNumber: number) {
    return blocks.find((block) => lineInBlock(lineNumber, block)) ?? null;
  }

  function fencedCodeBlocks(state: EditorState): SourceBlock[] {
    const blocks: SourceBlock[] = [];
    let openFence: { line: number; fence: FenceInfo } | null = null;

    for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
      const text = state.doc.line(lineNumber).text;

      if (openFence) {
        if (isClosingFence(text, openFence.fence)) {
          blocks.push({ start: openFence.line, end: lineNumber, kind: 'fenced-code' });
          openFence = null;
        }
        continue;
      }

      const fence = openingFence(text);
      if (fence) openFence = { line: lineNumber, fence };
    }

    if (openFence) {
      blocks.push({ start: openFence.line, end: state.doc.lines, kind: 'fenced-code' });
    }

    return blocks;
  }

  function openingFence(text: string): FenceInfo | null {
    const match = /^\s*(`{3,}|~{3,})/.exec(text);
    if (!match) return null;

    const marker = match[1][0] as '`' | '~';
    return { marker, length: match[1].length };
  }

  function isClosingFence(text: string, fence: FenceInfo) {
    const trimmed = text.trim();
    if (!trimmed || trimmed[0] !== fence.marker || trimmed.length < fence.length) return false;
    return [...trimmed].every((character) => character === fence.marker);
  }

  function markdownTableBlocks(state: EditorState): SourceBlock[] {
    const blocks: SourceBlock[] = [];

    for (let lineNumber = 1; lineNumber < state.doc.lines; lineNumber += 1) {
      if (blockForLine(blocks, lineNumber)) continue;

      const header = tableCells(state.doc.line(lineNumber).text);
      const delimiter = tableCells(state.doc.line(lineNumber + 1).text);
      if (!header || !delimiter || !tableDelimiterCells(delimiter)) continue;

      const columnCount = Math.max(header.length, delimiter.length);
      const rows: string[][] = [];
      let end = lineNumber + 1;

      for (let rowLine = lineNumber + 2; rowLine <= state.doc.lines; rowLine += 1) {
        const cells = tableCells(state.doc.line(rowLine).text);
        if (!cells || tableDelimiterCells(cells)) break;
        rows.push(padTableCells(cells, columnCount));
        end = rowLine;
      }

      blocks.push({
        start: lineNumber,
        end,
        kind: 'table',
        table: {
          headers: padTableCells(header, columnCount),
          alignments: padTableAlignments(delimiter.map(tableAlignment), columnCount),
          rows
        }
      });
      lineNumber = end;
    }

    return blocks;
  }

  function tableCells(text: string) {
    const trimmed = text.trim();
    if (!trimmed.includes('|')) return null;

    let row = trimmed;
    if (row.startsWith('|')) row = row.slice(1);
    if (row.endsWith('|')) row = row.slice(0, -1);

    const cells: string[] = [];
    let current = '';
    let escaped = false;

    for (const character of row) {
      if (escaped) {
        current += character === '|' ? '|' : `\\${character}`;
        escaped = false;
        continue;
      }

      if (character === '\\') {
        escaped = true;
        continue;
      }

      if (character === '|') {
        cells.push(current.trim());
        current = '';
        continue;
      }

      current += character;
    }

    cells.push(current.trim());
    return cells.length > 1 ? cells : null;
  }

  function tableDelimiterCells(cells: string[]) {
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
  }

  function tableAlignment(cell: string): 'left' | 'center' | 'right' | null {
    const normalized = cell.replace(/\s+/g, '');
    const left = normalized.startsWith(':');
    const right = normalized.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  }

  function padTableCells(cells: string[], length: number) {
    return Array.from({ length }, (_, index) => cells[index] ?? '');
  }

  function padTableAlignments(
    alignments: Array<'left' | 'center' | 'right' | null>,
    length: number
  ) {
    return Array.from({ length }, (_, index) => alignments[index] ?? null);
  }

  function listBlockForLine(state: EditorState, lineNumber: number): SourceBlock | null {
    for (let candidateLine = lineNumber; candidateLine >= 1; candidateLine -= 1) {
      const candidate = state.doc.line(candidateLine);
      const info = listInfo(candidate.text);
      if (!info) {
        if (candidateLine !== lineNumber && candidate.text.trim() && leadingIndent(candidate.text) === 0) {
          break;
        }
        continue;
      }

      if (candidateLine === lineNumber || belongsToListContinuation(state, candidateLine + 1, lineNumber, info)) {
        let end = candidateLine;
        for (let nextLine = candidateLine + 1; nextLine <= state.doc.lines; nextLine += 1) {
          const text = state.doc.line(nextLine).text;
          if (!text.trim() || leadingIndent(text) >= info.contentIndent) {
            end = nextLine;
            continue;
          }
          break;
        }
        return { start: candidateLine, end, kind: 'list' };
      }
    }

    return null;
  }

  function belongsToListContinuation(
    state: EditorState,
    startLine: number,
    endLine: number,
    info: ListInfo
  ) {
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      const text = state.doc.line(lineNumber).text;
      if (text.trim() && leadingIndent(text) < info.contentIndent) return false;
    }

    return true;
  }

  function listInfo(text: string): ListInfo | null {
    const match = /^(\s*)((?:[-*+])|(?:\d+[.)]))(\s+)/.exec(text);
    if (!match) return null;

    const indent = indentWidth(match[1]);
    return {
      indent,
      contentIndent: indent + indentWidth(match[2] + match[3])
    };
  }

  function indentedBlockForLine(state: EditorState, lineNumber: number): SourceBlock | null {
    const line = state.doc.line(lineNumber);
    if (!line.text.trim() || leadingIndent(line.text) < 4) return null;

    let start = lineNumber;
    let end = lineNumber;

    for (let previous = lineNumber - 1; previous >= 1; previous -= 1) {
      const text = state.doc.line(previous).text;
      if (text.trim() && leadingIndent(text) < 4) break;
      start = previous;
    }

    for (let next = lineNumber + 1; next <= state.doc.lines; next += 1) {
      const text = state.doc.line(next).text;
      if (text.trim() && leadingIndent(text) < 4) break;
      end = next;
    }

    return { start, end, kind: 'indented' };
  }

  function leadingIndent(text: string) {
    const match = /^\s*/.exec(text);
    return indentWidth(match?.[0] ?? '');
  }

  function indentWidth(value: string) {
    let width = 0;
    for (const character of value) {
      width += character === '\t' ? 4 : 1;
    }
    return width;
  }

  function addInlineMarkdownPreview(
    ranges: Range<Decoration>[],
    line: Line,
    contentOffset = 0
  ) {
    const text = line.text;
    const occupied: Array<{ from: number; to: number }> = [];

    const overlaps = (from: number, to: number) =>
      occupied.some((range) => from < range.to && to > range.from);

    const claim = (from: number, to: number) => {
      if (from < contentOffset || from >= to || overlaps(from, to)) return false;
      occupied.push({ from, to });
      return true;
    };

    const addMark = (from: number, to: number, className: string) => {
      if (from >= to) return;
      ranges.push(Decoration.mark({ class: className }).range(line.from + from, line.from + to));
    };

    const hide = (from: number, to: number) => addMark(from, to, 'cm-markdown-syntax-hidden');

    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const from = match.index ?? 0;
      const to = from + match[0].length;
      if (!claim(from, to)) continue;
      hide(from, from + 1);
      addMark(from + 1, to - 1, 'cm-live-code');
      hide(to - 1, to);
    }

    for (const match of text.matchAll(/\[([^\]\n]+)\]\(([^)\n]+)\)/g)) {
      const from = match.index ?? 0;
      const to = from + match[0].length;
      const labelStart = from + 1;
      const labelEnd = labelStart + match[1].length;
      if (!claim(from, to)) continue;
      hide(from, labelStart);
      addMark(labelStart, labelEnd, 'cm-live-link');
      hide(labelEnd, to);
    }

    for (const match of text.matchAll(/\*\*([^*\n]+)\*\*/g)) {
      const from = match.index ?? 0;
      const to = from + match[0].length;
      if (!claim(from, to)) continue;
      hide(from, from + 2);
      addMark(from + 2, to - 2, 'cm-live-bold');
      hide(to - 2, to);
    }

    for (const match of text.matchAll(/(^|[\s(])_([^_\n]+)_/g)) {
      const prefixLength = match[1].length;
      const from = (match.index ?? 0) + prefixLength;
      const to = from + match[0].length - prefixLength;
      if (!claim(from, to)) continue;
      hide(from, from + 1);
      addMark(from + 1, to - 1, 'cm-live-italic');
      hide(to - 1, to);
    }
  }

  function threadRangeInState(state: EditorState, thread: ThreadView): ThreadRangeMatch | null {
    const candidates =
      thread.kind === 'suggestion'
        ? suggestionRangeCandidates(thread)
        : [{ value: thread.quote, matched: 'quote' as const }];
    const usableCandidates = candidates.filter((candidate) => candidate.value.trim().length > 0);
    const deletionOnly = thread.kind === 'suggestion' && thread.status !== 'rejected' && suggestionSurfaceKind(thread) === 'remove';
    const lineRange = currentLineRangeForThread(thread);
    const rangeMatch = rangeForCandidates(state, lineRange.start, lineRange.end, usableCandidates);
    if (rangeMatch) return rangeMatch;

    if (thread.pending && thread.currentLine) {
      return deletionOnly ? deletionAnchorInState(state, thread) : null;
    }

    const doc = state.doc.toString();
    for (const candidate of usableCandidates) {
      const index = doc.indexOf(candidate.value);
      if (index >= 0) {
        return {
          from: index,
          to: index + candidate.value.length,
          matched: candidate.matched
        };
      }
    }

    if (deletionOnly) return deletionAnchorInState(state, thread);

    return null;
  }

  function deletionAnchorInState(state: EditorState, thread: ThreadView): ThreadRangeMatch {
    const lineNumber = thread.currentLine ?? thread.line;
    if (lineNumber > state.doc.lines) {
      return { from: state.doc.length, to: state.doc.length, matched: 'deletion' };
    }

    const line = state.doc.line(Math.max(1, lineNumber));
    return { from: line.from, to: line.from, matched: 'deletion' };
  }

  function currentLineRangeForThread(thread: ThreadView) {
    return {
      start: Math.max(1, thread.currentLine ?? thread.line),
      end: Math.max(thread.currentLine ?? thread.line, thread.currentEndLine ?? thread.endLine)
    };
  }

  function rangeForCandidates(
    state: EditorState,
    startLine: number,
    endLine: number,
    candidates: Array<{ value: string; matched: 'body' | 'quote' }>
  ) {
    if (startLine > state.doc.lines) return null;

    const start = state.doc.line(startLine);
    const end = state.doc.line(Math.min(Math.max(startLine, endLine), state.doc.lines));
    const text = state.sliceDoc(start.from, end.to);

    for (const candidate of candidates) {
      const index = text.indexOf(candidate.value);
      if (index >= 0) {
        return {
          from: start.from + index,
          to: start.from + index + candidate.value.length,
          matched: candidate.matched
        };
      }
    }

    return null;
  }

  function suggestionRangeCandidates(thread: ThreadView) {
    if (thread.status === 'rejected') {
      return [
        { value: thread.diffQuote ?? thread.quote, matched: 'quote' as const },
        { value: thread.quote, matched: 'quote' as const }
      ];
    }

    return [
      { value: thread.diffBody ?? thread.body, matched: 'body' as const },
      { value: thread.body, matched: 'body' as const },
      { value: thread.diffQuote ?? thread.quote, matched: 'quote' as const },
      { value: thread.quote, matched: 'quote' as const }
    ];
  }

  function codeMirrorLiveEditor(
    node: HTMLElement,
    options: {
      value: string;
      threads: ThreadView[];
      documentKey: string;
    }
  ) {
    let lastExternalValue = options.value;
    let lastDocumentKey = options.documentKey;
    let applyingExternalValue = false;

    const view = new EditorView({
      parent: node,
      state: EditorState.create({
        doc: options.value,
        extensions: livePreviewExtensions()
      })
    });

    mainEditor = view;
    view.dispatch({ effects: setThreadsEffect.of(options.threads) });
    updateSelectionFromEditor(view);
    requestAnimationFrame(updateAnchorPositions);

    return {
      update(next: typeof options) {
        view.dispatch({ effects: setThreadsEffect.of(next.threads) });

        const currentDoc = view.state.doc.toString();
        const documentChanged = next.documentKey !== lastDocumentKey;
        if (documentChanged || (next.value !== currentDoc && currentDoc === lastExternalValue)) {
          applyingExternalValue = true;
          view.dispatch({ changes: { from: 0, to: currentDoc.length, insert: next.value } });
          applyingExternalValue = false;
        }
        lastExternalValue = next.value;
        lastDocumentKey = next.documentKey;
      },
      destroy() {
        if (mainEditor === view) mainEditor = null;
        view.destroy();
      }
    };

    function livePreviewExtensions(): Extension[] {
      return [
        history(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        livePreviewField,
        keymap.of([
          {
            key: 'Mod-Enter',
            run() {
              publish();
              return true;
            }
          },
          {
            key: 'Mod-s',
            run() {
              saveLocalMarkdown();
              return true;
            }
          },
          {
            key: 'Mod-o',
            run() {
              openLocalMarkdown();
              return true;
            }
          },
          {
            key: 'Enter',
            run: smartMarkdownEnter
          },
          {
            key: 'Backspace',
            run: smartMarkdownBackspace
          },
          {
            key: 'Tab',
            run: indentMore
          },
          {
            key: 'Shift-Tab',
            run: indentLess
          },
          ...defaultKeymap,
          ...historyKeymap
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.selectionSet || update.focusChanged) updateSelectionFromEditor(update.view);

          if (update.docChanged) {
            editorMarkdown = update.state.doc.toString();
            if (localFileMode) {
              saveState = editorMarkdown === baseMarkdown ? 'saved' : 'dirty';
              saveMessage = editorMarkdown === baseMarkdown ? 'Saved' : 'Unsaved changes';
            }
            if (applyingExternalValue) {
              draftChanges = ChangeSet.empty(editorMarkdown.length);
              pendingEditThreads = [];
            } else {
              draftChanges = composeDraftChanges(draftChanges, update);
              pendingEditThreads = draftMarkdownSuggestions(draftChanges, baseMarkdown, editorMarkdown, persistedThreads, {
                author: reviewer,
                syncedKeys: syncedEditKeys
              });
            }
          }

          if (update.docChanged || update.selectionSet || update.viewportChanged) {
            requestAnimationFrame(updateAnchorPositions);
          }
        }),
        EditorView.domEventHandlers({
          mousemove(event) {
            const threadId = threadAnchorFromEvent(event);
            if (activeThreadId !== threadId) activeThreadId = threadId;
          },
          mouseleave() {
            if (activeThreadId) activeThreadId = '';
          },
          blur() {
            selectionToolbar.visible = false;
          },
          focus() {
            updateSelectionFromEditor(view);
          }
        })
      ];
    }
  }

  function threadAnchorFromEvent(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return '';
    return target.closest<HTMLElement>('[data-thread-anchor]')?.dataset.threadAnchor ?? '';
  }

  function updateSelectionFromEditor(view: EditorView) {
    const selection = view.state.selection.main;
    if (selection.empty) {
      selectedQuote = '';
      selectionToolbar.visible = false;
      return;
    }

    const quote = view.state.sliceDoc(selection.from, selection.to).trim();
    const fromRect = view.coordsAtPos(selection.from);
    const toRect = view.coordsAtPos(selection.to);
    if (!quote || !fromRect || !toRect || !documentSurface) return;

    const documentRect = documentSurface.getBoundingClientRect();
    selectedQuote = displayTextForMarkdownLine(quote);
    replacementBody = selectedQuote;
    selectedLineTop = Math.max(0, fromRect.top - documentRect.top + (fromRect.bottom - fromRect.top) / 2);
    selectionToolbar = {
      visible: true,
      top: Math.max(116, fromRect.top + window.scrollY - 42),
      left: Math.min(
        window.innerWidth - 196,
        Math.max(16, (fromRect.left + toRect.right) / 2 + window.scrollX - 92)
      )
    };
  }

  function updateAnchorPositions() {
    if (!documentSurface) return;
    const nextLineTops: Record<number, number> = {};

    if (mainEditor) {
      const documentRect = documentSurface.getBoundingClientRect();
      for (let lineNumber = 1; lineNumber <= mainEditor.state.doc.lines; lineNumber += 1) {
        const line = mainEditor.state.doc.line(lineNumber);
        const coords = mainEditor.coordsAtPos(line.from);
        if (coords) nextLineTops[lineNumber] = Math.max(0, coords.top - documentRect.top);
      }
    }

    lineTops = nextLineTops;

    const nextAnnotationTops: Record<string, number> = {};
    for (const element of documentSurface.querySelectorAll<HTMLElement>('[data-thread-anchor]')) {
      const id = element.dataset.threadAnchor;
      if (id) nextAnnotationTops[id] = annotationTop(element);
    }
    annotationTops = nextAnnotationTops;
    documentHeight = Math.max(documentSurface.offsetHeight, mainEditor?.dom.offsetHeight ?? 0);
  }

  function annotationTop(element: HTMLElement) {
    const documentRect = documentSurface.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return Math.max(0, rect.top - documentRect.top + rect.height / 2);
  }

  function composeDraftChanges(currentDraftChanges: ChangeSet, update: ViewUpdate) {
    const draftIsAligned =
      currentDraftChanges.length === baseMarkdown.length &&
      currentDraftChanges.newLength === update.startState.doc.length;

    if (!draftIsAligned) {
      const startDoc = update.startState.doc.toString();
      return ChangeSet.of({ from: 0, to: baseMarkdown.length, insert: startDoc }, baseMarkdown.length).compose(
        update.changes
      );
    }

    return currentDraftChanges.compose(update.changes);
  }

  function smartMarkdownEnter(view: EditorView) {
    const selection = view.state.selection.main;
    if (!selection.empty) return insertNewlineAndIndent(view);

    const line = view.state.doc.lineAt(selection.head);
    const list = /^(\s*)((?:[-*+]|\d+[.)]))(\s+)(.*)$/.exec(line.text);
    if (!list) return insertNewlineAndIndent(view);

    const prefix = `${list[1]}${list[2]}${list[3]}`;
    const cursorOffset = selection.head - line.from;
    if (cursorOffset < prefix.length) return insertNewlineAndIndent(view);

    if (!list[4].trim()) {
      view.dispatch({
        changes: {
          from: line.from,
          to: line.from + prefix.length,
          insert: list[1]
        },
        selection: { anchor: line.from + list[1].length }
      });
      return true;
    }

    view.dispatch({
      changes: {
        from: selection.head,
        insert: `\n${list[1]}${nextListMarker(list[2])}${list[3]}`
      }
    });
    return true;
  }

  function smartMarkdownBackspace(view: EditorView) {
    const selection = view.state.selection.main;
    if (!selection.empty) return false;

    const line = view.state.doc.lineAt(selection.head);
    const list = /^(\s*)((?:[-*+]|\d+[.)]))(\s+)(.*)$/.exec(line.text);
    if (!list || list[4].length > 0) return false;

    const prefix = `${list[1]}${list[2]}${list[3]}`;
    if (selection.head - line.from !== prefix.length) return false;

    view.dispatch({
      changes: {
        from: line.from,
        to: line.from + prefix.length,
        insert: list[1]
      },
      selection: { anchor: line.from + list[1].length }
    });
    return true;
  }

  function nextListMarker(marker: string) {
    const ordered = /^(\d+)([.)])$/.exec(marker);
    if (!ordered) return marker;
    return `${Number(ordered[1]) + 1}${ordered[2]}`;
  }

  function displayTextForMarkdownLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return '';
    const heading = /^#{1,6}\s+(.+)$/.exec(trimmed);
    if (heading) return heading[1].trim();
    const list = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (list) return list[1].trim();
    return trimmed;
  }

  async function syncEditorSuggestions() {
    if (syncingEditorSuggestions || !review || pendingEditThreads.length === 0) return;
    syncingEditorSuggestions = true;

    try {
      let nextReview = review;
      for (const thread of pendingEditThreads) {
        if (thread.status === 'rejected') continue;
        const key = suggestionKey(thread.line, thread.endLine, thread.quote, thread.body);
        if (syncedEditKeys.has(key)) continue;
        nextReview = await api.addSuggestion(nextReview.id, {
          author: reviewer,
          original: thread.quote,
          replacement: thread.body
        });
        const savedSuggestion = newestMatchingSuggestion(nextReview, thread);
        if (savedSuggestion && thread.resolved) {
          nextReview = await api.updateSuggestionStatus(nextReview.id, savedSuggestion.id, {
            resolved: true
          });
        }
        syncedEditKeys.add(key);
      }
      review = nextReview;
      pendingEditThreads = [];
      await tick();
      updateAnchorPositions();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to save edit suggestion';
    } finally {
      syncingEditorSuggestions = false;
    }
  }

  function newestMatchingSuggestion(nextReview: Review, thread: ThreadView) {
    return [...nextReview.suggestions]
      .reverse()
      .find((suggestion) => suggestion.original === thread.quote && suggestion.replacement === thread.body);
  }

  function lineRangeLabel(thread: ThreadView) {
    const start = anchorLineForThread(thread);
    const end = thread.pending && thread.currentEndLine ? thread.currentEndLine : thread.endLine;
    return end && end !== start
      ? `Lines ${start}-${end}`
      : `Line ${start}`;
  }

  function anchorLineForThread(thread: ThreadView) {
    return thread.pending ? (thread.currentLine ?? thread.line) : thread.line;
  }

  function diffLines(value: string) {
    return value.split('\n');
  }

  function diffQuote(thread: ThreadView) {
    return thread.diffQuote ?? thread.quote;
  }

  function diffBody(thread: ThreadView) {
    return thread.diffBody ?? thread.body;
  }

  function suggestionStatusLabel(thread: ThreadView) {
    if (thread.pending) return 'Draft change';
    if (thread.status === 'resolved') return 'Resolved';
    if (thread.status === 'rejected') return 'Rejected';
    return 'Accepted';
  }

  function suggestionSurfaceKind(thread: ThreadView): SuggestionSurfaceKind {
    const removed = diffQuote(thread).trim().length > 0;
    const added = diffBody(thread).trim().length > 0;
    if (removed && !added) return 'remove';
    if (!removed && added) return 'add';
    return 'replace';
  }

  function suggestionAffordanceLabel(thread: ThreadView) {
    const kind = suggestionSurfaceKind(thread);
    if (kind === 'remove') return 'deleted';
    if (kind === 'add') return 'add';
    return 'edit';
  }

  function layoutMarginItems(
    items: ThreadView[],
    activeQuote: string,
    activeLineTop: number,
    activeMode: 'comment' | 'suggest',
    anchorTops: Record<number, number>,
    annotationAnchors: Record<string, number>,
    measuredHeights: Record<string, number>
  ): MarginItem[] {
    const rawItems: Array<Omit<MarginItem, 'top'>> = items.map((thread) => ({
      type: 'thread' as const,
      id: thread.id,
      anchorTop: annotationAnchors[thread.id] ?? anchorTops[anchorLineForThread(thread)] ?? gutterReservedTop,
      height: measuredHeights[thread.id] ?? estimateThreadHeight(thread),
      connectorKind: thread.kind,
      thread
    }));

    if (activeQuote) {
      rawItems.push({
        type: 'composer',
        id: 'composer',
        anchorTop: activeLineTop,
        height: measuredHeights.composer ?? estimateComposerHeight(activeQuote),
        connectorKind: activeMode === 'suggest' ? 'suggestion' : 'comment'
      });
    }

    return rawItems
      .sort((a, b) => a.anchorTop - b.anchorTop || (a.type === 'composer' ? -1 : 1))
      .reduce<MarginItem[]>((laidOut, item) => {
        const previous = laidOut.at(-1);
        const top = Math.max(
          gutterReservedTop,
          item.anchorTop - 18,
          previous ? previous.top + previous.height + gutterCardGap : gutterReservedTop
        );
        laidOut.push({ ...item, top } as MarginItem);
        return laidOut;
      }, []);
  }

  function estimateThreadHeight(thread: ThreadView) {
    const quoteLines = Math.min(4, Math.ceil(thread.quote.length / 48));
    const bodyLines = Math.min(5, Math.ceil(thread.body.length / 52));
    const suggestionExtra = thread.kind === 'suggestion' ? 18 : 0;
    const pendingExtra = thread.pending ? 18 : 0;
    return 104 + quoteLines * 18 + bodyLines * 19 + suggestionExtra + pendingExtra;
  }

  function estimateComposerHeight(quote: string) {
    const quoteLines = Math.min(4, Math.ceil(quote.length / 48));
    return 214 + quoteLines * 18;
  }

  function connectorPath(anchorTop: number, cardTop: number) {
    const anchorY = Math.max(12, anchorTop);
    const cardY = cardTop + 24;
    return `M 0 ${anchorY} C 12 ${anchorY}, 14 ${cardY}, 38 ${cardY}`;
  }

  function measureHeight(node: HTMLElement, id: string) {
    const updateHeight = () => {
      const height = Math.ceil(node.offsetHeight);
      if (height > 0 && cardHeights[id] !== height) {
        cardHeights = { ...cardHeights, [id]: height };
      }
    };

    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    updateHeight();

    return {
      update(nextId: string) {
        id = nextId;
        updateHeight();
      },
      destroy() {
        observer.disconnect();
      }
    };
  }

  function openComposer(nextMode: 'comment' | 'suggest') {
    mode = nextMode;
    if (nextMode === 'comment') {
      commentBody = '';
    }
  }

  function clearSelection() {
    selectedQuote = '';
    commentBody = '';
    replacementBody = '';
    selectionToolbar.visible = false;
    mainEditor?.dispatch({ selection: { anchor: mainEditor.state.selection.main.head } });
  }

  function isInsertBlockKind(value: unknown): value is InsertBlockKind {
    return value === 'table' || value === 'tasks' || value === 'bullets' || value === 'numbers';
  }

  async function setupNativeInsertMenuListener() {
    const listen = (window as TauriWindow).__TAURI__?.event?.listen;
    if (!listen) return;

    try {
      unlistenNativeInsertMenu = await listen<InsertBlockKind>('margin://insert-block', (event) => {
        if (isInsertBlockKind(event.payload)) {
          insertMarkdownBlock(event.payload);
        }
      });
    } catch (err) {
      console.warn('Unable to connect native Insert menu', err);
    }
  }

  function insertMarkdownBlock(kind: InsertBlockKind) {
    if (!mainEditor) return;

    const block = insertBlocks[kind];
    const selection = mainEditor.state.selection.main;
    const doc = mainEditor.state.doc.toString();
    const prefix = insertionPrefix(doc, selection.from);
    const suffix = insertionSuffix(doc, selection.to);
    const insert = `${prefix}${block.markdown}${suffix}`;
    const cursorOffset = block.markdown.indexOf(block.cursorText);
    const anchor = selection.from + prefix.length + Math.max(0, cursorOffset);

    selectedQuote = '';
    commentBody = '';
    replacementBody = '';
    selectionToolbar.visible = false;

    mainEditor.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert
      },
      selection: { anchor }
    });
    mainEditor.focus();
  }

  function insertionPrefix(doc: string, from: number) {
    const before = doc.slice(0, from);
    if (!before || before.endsWith('\n\n')) return '';
    if (before.endsWith('\n')) return '\n';
    return '\n\n';
  }

  function insertionSuffix(doc: string, to: number) {
    const after = doc.slice(to);
    if (!after) return '\n';
    if (after.startsWith('\n\n')) return '';
    if (after.startsWith('\n')) return '\n';
    return '\n\n';
  }

  async function openLocalMarkdown() {
    error = '';
    const picker = window as FilePickerWindow;

    if (picker.showOpenFilePicker) {
      try {
        const [handle] = await picker.showOpenFilePicker({
          multiple: false,
          types: markdownFileTypes
        });
        if (!handle) return;
        await loadLocalMarkdownFile(await handle.getFile(), handle);
      } catch (err) {
        if (isAbortError(err)) return;
        error = err instanceof Error ? err.message : 'Unable to open Markdown file';
      }
      return;
    }

    fileInput.value = '';
    fileInput.click();
  }

  async function handleLocalFileSelected(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      await loadLocalMarkdownFile(file, null);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to open Markdown file';
    }
  }

  async function loadLocalMarkdownFile(file: File, handle: MarkdownFileHandle | null) {
    const markdown = await file.text();
    const fileName = handle?.name || file.name || 'Untitled.md';

    reviewEvents?.close();
    reviewEvents = null;
    localFileMode = true;
    localFileHandle = handle;
    localFileName = fileName;
    liveStatus = 'local';
    saveState = 'saved';
    saveMessage = handle?.createWritable ? 'Saved' : 'Opened read-only; use Save As';
    documentSessionKey = `local:${Date.now()}:${fileName}`;
    documentData = {
      id: documentSessionKey,
      repo: 'Local file',
      file_path: fileName,
      source_commit: 'standalone',
      markdown
    };
    review = emptyLocalReview(fileName);
    resetDraftState(markdown);
    clearSelection();
    await tick();
    updateAnchorPositions();
  }

  async function saveLocalMarkdown() {
    if (!documentData) return;
    if (!localFileMode || !localFileHandle?.createWritable) {
      await saveLocalMarkdownAs();
      return;
    }

    saveState = 'saving';
    saveMessage = 'Saving...';
    error = '';

    try {
      const writable = await localFileHandle.createWritable();
      await writable.write(editorMarkdown);
      await writable.close();
      markLocalFileSaved(editorMarkdown, localFileHandle.name);
    } catch (err) {
      if (isAbortError(err)) return;
      saveState = 'dirty';
      saveMessage = 'Save failed';
      error = err instanceof Error ? err.message : 'Unable to save Markdown file';
    }
  }

  async function saveLocalMarkdownAs() {
    if (!documentData) return;
    error = '';
    const picker = window as FilePickerWindow;

    if (picker.showSaveFilePicker) {
      saveState = 'saving';
      saveMessage = 'Saving...';
      try {
        const handle = await picker.showSaveFilePicker({
          suggestedName: localFileName || documentData.file_path || 'document.md',
          types: markdownFileTypes
        });
        const writable = await handle.createWritable?.();
        if (!writable) throw new Error('This environment cannot write to that file directly');
        await writable.write(editorMarkdown);
        await writable.close();
        localFileMode = true;
        localFileHandle = handle;
        markLocalFileSaved(editorMarkdown, handle.name);
      } catch (err) {
        if (isAbortError(err)) return;
        saveState = 'dirty';
        saveMessage = 'Save failed';
        error = err instanceof Error ? err.message : 'Unable to save Markdown file';
      }
      return;
    }

    downloadMarkdown(editorMarkdown, localFileName || documentData.file_path || 'document.md');
    localFileMode = true;
    markLocalFileSaved(editorMarkdown, localFileName || documentData.file_path || 'document.md', 'Downloaded copy');
  }

  function markLocalFileSaved(markdown: string, fileName: string, message = 'Saved') {
    localFileName = fileName;
    saveState = 'saved';
    saveMessage = message;
    if (documentData) {
      documentData = { ...documentData, file_path: fileName, markdown };
    }
    resetDraftState(markdown);
  }

  function resetDraftState(markdown: string) {
    editorMarkdown = markdown;
    baseMarkdown = markdown;
    draftChanges = ChangeSet.empty(markdown.length);
    pendingEditThreads = [];
    syncedEditKeys.clear();
  }

  function downloadMarkdown(markdown: string, fileName: string) {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function isAbortError(err: unknown) {
    return err instanceof DOMException && err.name === 'AbortError';
  }

  function emptyLocalReview(fileName: string): Review {
    return {
      id: `local-review:${Date.now()}`,
      repo: 'Local file',
      file_path: fileName,
      source_commit: 'standalone',
      reviewer,
      approval: null,
      comments: [],
      suggestions: [],
      created_at: new Date().toISOString()
    };
  }

  function handleGlobalShortcut(event: KeyboardEvent) {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod || event.altKey || event.shiftKey) return;

    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveLocalMarkdown();
    }

    if (event.key.toLowerCase() === 'o') {
      event.preventDefault();
      openLocalMarkdown();
    }
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!localFileMode || saveState !== 'dirty') return;
    event.preventDefault();
    event.returnValue = '';
  }

  function connectEvents(reviewId: string) {
    reviewEvents?.close();
    const events = new EventSource(api.eventsUrl(reviewId));
    reviewEvents = events;
    liveStatus = 'live';
    events.onerror = () => {
      liveStatus = 'reconnecting';
    };
    events.addEventListener('heartbeat', () => {
      liveStatus = 'live';
    });
  }

  async function submitComment() {
    if (!review || !selectedQuote || !commentBody) return;
    if (localFileMode) {
      review = {
        ...review,
        comments: [
          ...review.comments,
          {
            id: `local-comment-${Date.now()}`,
            author: reviewer,
            body: commentBody,
            resolved: false,
            anchor: localAnchorForSelection(selectedQuote),
            created_at: new Date().toISOString()
          }
        ]
      };
      await tick();
      updateAnchorPositions();
      clearSelection();
      return;
    }

    saving = true;
    error = '';
    try {
      review = await api.addComment(review.id, {
        author: reviewer,
        body: commentBody,
        quote: selectedQuote
      });
      await tick();
      updateAnchorPositions();
      clearSelection();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to add comment';
    } finally {
      saving = false;
    }
  }

  async function submitSuggestion() {
    if (!review || !selectedQuote || !replacementBody) return;
    if (localFileMode) {
      replaceEditorSelection(replacementBody);
      await tick();
      updateAnchorPositions();
      clearSelection();
      return;
    }

    saving = true;
    error = '';
    try {
      review = await api.addSuggestion(review.id, {
        author: reviewer,
        original: selectedQuote,
        replacement: replacementBody
      });
      await tick();
      updateAnchorPositions();
      clearSelection();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to add suggestion';
    } finally {
      saving = false;
    }
  }

  async function acceptSuggestion(thread: ThreadView) {
    if (!review || thread.kind !== 'suggestion') return;
    if (localFileMode && thread.pending) {
      activeThreadId = thread.id;
      syncedEditKeys.add(suggestionKey(thread.line, thread.endLine, thread.quote, thread.body));
      pendingEditThreads = pendingEditThreads.filter((candidate) => candidate.id !== thread.id);
      await tick();
      updateAnchorPositions();
      return;
    }

    saving = true;
    error = '';
    activeThreadId = thread.id;

    try {
      replaceInEditor(thread.quote, thread.body);

      if (thread.pending) {
        await persistPendingSuggestion(thread, { resolved: false });
      } else {
        review = await api.updateSuggestionStatus(review.id, thread.id, {
          applied: true,
          resolved: false
        });
      }

      await tick();
      updateAnchorPositions();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to accept suggestion';
    } finally {
      saving = false;
    }
  }

  async function rejectSuggestion(thread: ThreadView) {
    if (!review || thread.kind !== 'suggestion') return;
    saving = true;
    error = '';
    activeThreadId = thread.id;

    try {
      replaceInEditor(thread.body, thread.quote);

      if (thread.pending) {
        pendingEditThreads = pendingEditThreads.filter((candidate) => candidate.id !== thread.id);
      } else {
        review = await api.updateSuggestionStatus(review.id, thread.id, {
          applied: false,
          resolved: false
        });
      }

      await tick();
      updateAnchorPositions();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to reject suggestion';
    } finally {
      saving = false;
    }
  }

  async function resolveSuggestion(thread: ThreadView) {
    if (!review || thread.kind !== 'suggestion') return;
    if (localFileMode && thread.pending) {
      activeThreadId = thread.id;
      syncedEditKeys.add(suggestionKey(thread.line, thread.endLine, thread.quote, thread.body));
      pendingEditThreads = pendingEditThreads.filter((candidate) => candidate.id !== thread.id);
      await tick();
      updateAnchorPositions();
      return;
    }

    saving = true;
    error = '';
    activeThreadId = thread.id;

    try {
      if (thread.pending) {
        await persistPendingSuggestion(thread, { resolved: true });
      } else {
        review = await api.updateSuggestionStatus(review.id, thread.id, {
          resolved: true
        });
      }

      await tick();
      updateAnchorPositions();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to resolve suggestion';
    } finally {
      saving = false;
    }
  }

  async function persistPendingSuggestion(thread: ThreadView, options: { resolved: boolean }) {
    if (!review) return;

    let nextReview = await api.addSuggestion(review.id, {
      author: reviewer,
      original: thread.quote,
      replacement: thread.body
    });

    const savedSuggestion = newestMatchingSuggestion(nextReview, thread);
    if (savedSuggestion && options.resolved) {
      nextReview = await api.updateSuggestionStatus(nextReview.id, savedSuggestion.id, {
        resolved: true
      });
    }

    review = nextReview;
    syncedEditKeys.add(suggestionKey(thread.line, thread.endLine, thread.quote, thread.body));
    pendingEditThreads = pendingEditThreads.filter((candidate) => candidate.id !== thread.id);
  }

  function replaceInEditor(search: string, replacement: string) {
    if (!mainEditor || !search || search === replacement) return;
    const doc = mainEditor.state.doc.toString();
    const index = doc.indexOf(search);
    if (index < 0) return;

    mainEditor.dispatch({
      changes: {
        from: index,
        to: index + search.length,
        insert: replacement
      }
    });
    editorMarkdown = mainEditor.state.doc.toString();
    pendingEditThreads = draftMarkdownSuggestions(draftChanges, baseMarkdown, editorMarkdown, persistedThreads, {
      author: reviewer,
      syncedKeys: syncedEditKeys
    });
  }

  function replaceEditorSelection(replacement: string) {
    if (!mainEditor) return;
    const selection = mainEditor.state.selection.main;
    if (selection.empty) return;

    mainEditor.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: replacement
      },
      selection: { anchor: selection.from + replacement.length }
    });
    editorMarkdown = mainEditor.state.doc.toString();
  }

  function localAnchorForSelection(quote: string): ApiAnchor {
    const selection = mainEditor?.state.selection.main;
    const startLine = selection && mainEditor ? mainEditor.state.doc.lineAt(selection.from).number : 1;
    const endLine =
      selection && mainEditor
        ? mainEditor.state.doc.lineAt(Math.max(selection.from, selection.to - 1)).number
        : startLine;

    return {
      start_line: startLine,
      end_line: endLine,
      quote,
      prefix: '',
      suffix: '',
      heading_path: [],
      content_hash: `local-${startLine}-${endLine}-${quote.length}`
    };
  }

  function goToThread(thread: ThreadView) {
    if (!mainEditor) return;
    activeThreadId = thread.id;
    const range = threadRangeInState(mainEditor.state, thread);
    if (!range) return;

    mainEditor.dispatch({ selection: { anchor: range.from, head: range.to } });
    mainEditor.focus();
  }

  async function approve(status: string) {
    if (!review) return;
    review = await api.approve(review.id, status);
  }

  async function publish() {
    if (!review) return;
    await syncEditorSuggestions();
    saving = true;
    error = '';
    try {
      publishResult = await api.publish(review.id);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to publish review';
    } finally {
      saving = false;
    }
  }
</script>

<main class="doc-app">
  <header class="doc-topbar">
    <input
      class="local-file-input"
      bind:this={fileInput}
      type="file"
      accept=".md,.markdown,text/markdown,text/plain"
      on:change={handleLocalFileSelected}
    />
    <div class="brand-cluster">
      <div class="brand-mark">M</div>
      <div>
        <p class="eyebrow">{documentData?.repo ?? 'Loading repo'}</p>
        <h1>{documentData?.file_path ?? 'Opening document'}</h1>
      </div>
    </div>
    <div class="doc-actions">
      <span class="presence-dot" class:online={liveStatus === 'live'}>{liveStatus}</span>
      <button class="ghost-button" on:click={openLocalMarkdown}>Open</button>
      {#if localFileMode}
        <button class="ghost-button" on:click={saveLocalMarkdownAs} disabled={!documentData || saveState === 'saving'}>
          Save As
        </button>
        <button class="primary" on:click={saveLocalMarkdown} disabled={!documentData || saveState === 'saving'}>
          {saveState === 'saving' ? 'Saving' : 'Save'}
        </button>
      {:else}
        <button class="ghost-button">Suggesting</button>
        <button class="ghost-button" on:click={() => approve('approved')} disabled={!review}>Approve</button>
        <button class="primary" on:click={publish} disabled={!review || saving}>Publish</button>
      {/if}
    </div>
  </header>

  <div class="doc-toolbar" aria-label="Document tools">
    <span>Live Preview</span>
    <span>{localFileMode ? 'Standalone editor' : `Source commit ${documentData?.source_commit ?? '...'}`}</span>
    {#if localFileMode}
      <span class:dirty-status={saveState === 'dirty'}>{saveMessage || 'Local file'}</span>
    {/if}
    <span>{review?.comments.length ?? 0} comments</span>
    <span>{review?.suggestions.length ?? 0} saved suggestions</span>
    {#if pendingEditThreads.length > 0}
      <span>{pendingEditThreads.length} unsaved edit suggestions</span>
    {/if}
  </div>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if selectionToolbar.visible && selectedQuote}
    <div
      class="selection-toolbar"
      role="toolbar"
      aria-label="Selection actions"
      tabindex="-1"
      style={`top: ${selectionToolbar.top}px; left: ${selectionToolbar.left}px;`}
      on:mousedown|preventDefault
    >
      <button class:active={mode === 'comment'} on:click={() => openComposer('comment')}>Comment</button>
      <button class:active={mode === 'suggest'} on:click={() => openComposer('suggest')}>Suggest</button>
    </div>
  {/if}

  <div class="review-canvas">
    <section class="paper-column">
      <article class="document-surface live-preview-surface" bind:this={documentSurface} aria-label="Markdown live preview editor">
        {#if documentData}
          <div
            class="live-preview-editor"
            use:codeMirrorLiveEditor={{ value: documentData.markdown, threads, documentKey: documentSessionKey }}
          ></div>
        {/if}
      </article>
    </section>

    <aside class="margin-rail" aria-label="Document comments">
      <div class="comment-stage" style={`min-height: ${stageHeight}px;`}>
        {#if marginItems.length > 0}
          <svg
            class="connector-layer"
            viewBox={`0 0 340 ${stageHeight}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {#each marginItems as item}
              <path
                class="connector-shadow"
                class:connector-suggestion={item.connectorKind === 'suggestion'}
                class:connector-active={activeThreadId === item.id}
                d={connectorPath(item.anchorTop, item.top)}
              />
              <path
                class:connector-suggestion={item.connectorKind === 'suggestion'}
                class:connector-active={activeThreadId === item.id}
                d={connectorPath(item.anchorTop, item.top)}
              />
              <circle
                class="connector-source"
                class:connector-suggestion={item.connectorKind === 'suggestion'}
                class:connector-active={activeThreadId === item.id}
                cx="0"
                cy={Math.max(12, item.anchorTop)}
                r="3"
              />
              <circle
                class:connector-suggestion={item.connectorKind === 'suggestion'}
                class:connector-active={activeThreadId === item.id}
                cx="38"
                cy={item.top + 24}
                r="3"
              />
            {/each}
          </svg>
        {/if}

        <section class="review-summary">
          <span>{review?.approval ?? 'In review'}</span>
          <strong>{threads.length} open notes</strong>
        </section>

        {#if threads.length === 0 && !selectedQuote}
          <section class="empty-thread">
            <strong>No comments yet</strong>
            <p>Select text to comment, or type in the document to suggest an edit.</p>
          </section>
        {/if}

        {#each marginItems as item}
          {#if item.type === 'composer'}
            <section
              class="inline-composer"
              class:suggestion={item.connectorKind === 'suggestion'}
              aria-label="New review note"
              style={`top: ${item.top}px;`}
              use:measureHeight={item.id}
            >
              <div class="composer-header">
                <div class="avatar">AF</div>
                <div>
                  <strong>{mode === 'comment' ? 'Add comment' : 'Suggest edit'}</strong>
                  <span>Anchored to selected text</span>
                </div>
                <button class="icon-button" aria-label="Close composer" on:click={clearSelection}>x</button>
              </div>

              <blockquote>{selectedQuote}</blockquote>

              {#if mode === 'comment'}
                <textarea bind:value={commentBody} placeholder="Comment on this selection"></textarea>
                <div class="composer-actions">
                  <button class="ghost-button" on:click={clearSelection}>Cancel</button>
                  <button class="primary" on:click={submitComment} disabled={!selectionReady || !commentBody || saving}>
                    Comment
                  </button>
                </div>
              {:else}
                <textarea bind:value={replacementBody} aria-label="Replacement text"></textarea>
                <div class="composer-actions">
                  <button class="ghost-button" on:click={clearSelection}>Cancel</button>
                  <button class="primary" on:click={submitSuggestion} disabled={!selectionReady || !replacementBody || saving}>
                    Suggest
                  </button>
                </div>
              {/if}
            </section>
          {:else}
            <div
              class:thread-card={true}
              class:suggestion={item.thread.kind === 'suggestion'}
              class:pending={item.thread.pending}
              class:rejected={item.thread.status === 'rejected'}
              class:resolved={item.thread.status === 'resolved'}
              class:focused={activeThreadId === item.thread.id}
              role="button"
              tabindex="0"
              style={`top: ${item.top}px;`}
              on:click={() => goToThread(item.thread)}
              on:keydown={(event) => event.key === 'Enter' && goToThread(item.thread)}
              on:mouseenter={() => (activeThreadId = item.thread.id)}
              on:mouseleave={() => (activeThreadId = '')}
              use:measureHeight={item.id}
            >
              <div class="thread-header">
                <div class="avatar">{item.thread.author.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
                <div>
                  <strong>{item.thread.author}</strong>
                  <span>{lineRangeLabel(item.thread)}</span>
                </div>
                {#if item.thread.kind === 'suggestion'}
                  <span class="status-pill">{suggestionStatusLabel(item.thread)}</span>
                {/if}
              </div>

              {#if item.thread.kind === 'suggestion'}
                <div class="suggestion-diff" aria-label="Suggested change">
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
              <div class="thread-actions">
                {#if item.thread.kind === 'suggestion'}
                  <button
                    on:click|stopPropagation={() => acceptSuggestion(item.thread)}
                    disabled={saving || (!item.thread.pending && item.thread.status === 'applied')}
                  >
                    Accept
                  </button>
                  <button
                    on:click|stopPropagation={() => rejectSuggestion(item.thread)}
                    disabled={saving || item.thread.status === 'rejected'}
                  >
                    Reject
                  </button>
                  <button
                    on:click|stopPropagation={() => resolveSuggestion(item.thread)}
                    disabled={saving || item.thread.status === 'resolved'}
                  >
                    Resolve
                  </button>
                {:else}
                  <button on:click|stopPropagation={() => undefined}>Reply</button>
                  <button on:click|stopPropagation={() => undefined}>Resolve</button>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </aside>
  </div>
</main>

{#if publishResult}
  <div class="publish-drawer" role="dialog" aria-label="Publish result">
    <div>
      <p class="eyebrow">Ready for GitHub App</p>
      <h2>{publishResult.branch_name}</h2>
      <p>{publishResult.sidecar_path}</p>
    </div>
    <pre>{publishResult.sidecar_yaml}</pre>
    <button on:click={() => (publishResult = null)}>Close</button>
  </div>
{/if}
