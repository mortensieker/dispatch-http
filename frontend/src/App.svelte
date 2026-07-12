<script lang="ts">
  import { onMount, tick } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";
  import {
    Execute,
    GetFilePath,
    LoadFile,
    SaveFile,
    GetVersion,
    CheckForUpdate,
    ChooseFile,
  } from "../wailsjs/go/main/App.js";
  import { BrowserOpenURL, EventsOn } from "../wailsjs/runtime/runtime.js";
  import { parseHttpFile, findRequestAtLine } from "./lib/parser";
  import type { RequestBlock } from "./lib/parser";
  import { createEditorExtensions } from "./lib/editorSetup";
  import {
    parseVariableDecls,
    buildVarMap,
    resolveVariables,
    type VariableDecl,
    type ResponseCapture,
  } from "./lib/variables";
  import ResponseEntry from "./lib/ResponseEntry.svelte";

  interface ResponseData {
    id: number;
    method: string;
    url: string;
    status: number;
    headers: Record<string, string[]>;
    body: string;
    duration: number;
    error: string;
    timestamp: Date;
  }

  const DEFAULT_CONTENT = `@baseUrl = https://httpbin.org
@name = dispatch

### Simple GET
GET {{baseUrl}}/get

### POST with JSON body
# @name postExample
POST {{baseUrl}}/post
Content-Type: application/json

{
  "name": "{{name}}",
  "version": "1.0"
}

### Use response from previous request
# The json.name field from the POST response above
@echoedName = {{postExample.response.body.json.name}}

GET {{baseUrl}}/get?echo={{echoedName}}`;

  let responses: ResponseData[] = [];
  let loading = false;
  let nextId = 1;
  let fileLoaded = false;
  let filePath = "";
  let appVersion = "";
  let updateInfo: { updateAvailable: boolean; latestVersion: string; releaseURL: string } | null = null;
  let saveError = "";

  let editorContent = "";

  let editorHost: HTMLDivElement;
  let editorView: EditorView;
  let cursorLine = 0;
  let blocks: RequestBlock[] = [];
  let varDecls: VariableDecl[] = [];
  let responseStore = new Map<string, ResponseCapture>();

  $: blocks = parseHttpFile(editorContent);
  $: varDecls = parseVariableDecls(editorContent);

  function setEditorContent(text: string) {
    if (!editorView) return;
    const current = editorView.state.doc.toString();
    if (current === text) return;
    editorView.dispatch({ changes: { from: 0, to: current.length, insert: text } });
  }

  // ── Resizable panes ──

  const MIN_PANE_WIDTH = 240;

  let panesEl: HTMLDivElement;
  let requestPaneWidth = 0; // 0 means "not yet measured" — falls back to 50/50 via CSS flex
  let resizingPanes = false;

  function startResizePanes(e: MouseEvent) {
    e.preventDefault();
    resizingPanes = true;
    if (!requestPaneWidth && panesEl) {
      requestPaneWidth = panesEl.getBoundingClientRect().width / 2;
    }
    window.addEventListener("mousemove", onResizePanes);
    window.addEventListener("mouseup", stopResizePanes);
  }

  function onResizePanes(e: MouseEvent) {
    if (!panesEl) return;
    const rect = panesEl.getBoundingClientRect();
    const max = rect.width - MIN_PANE_WIDTH;
    requestPaneWidth = Math.min(Math.max(e.clientX - rect.left, MIN_PANE_WIDTH), max);
  }

  function stopResizePanes() {
    resizingPanes = false;
    window.removeEventListener("mousemove", onResizePanes);
    window.removeEventListener("mouseup", stopResizePanes);
  }

  // ── File persistence ──

  async function chooseFile() {
    const chosen = await ChooseFile();
    if (!chosen) return;
    filePath = chosen;
    fileLoaded = false;
    const content = await LoadFile();
    editorContent = content || DEFAULT_CONTENT;
    fileLoaded = true;
    setEditorContent(editorContent);
  }

  onMount(async () => {
    editorView = new EditorView({
      parent: editorHost,
      state: EditorState.create({
        doc: editorContent,
        extensions: createEditorExtensions({
          onDocChanged: (content) => { editorContent = content; },
          onCursorLineChanged: (line) => { cursorLine = line; },
          onRunLine: (line) => {
            const block = findRequestAtLine(blocks, line);
            if (block) runRequest(block);
          },
          getBlocks: () => blocks,
        }),
      }),
    });

    filePath = await GetFilePath();
    const content = await LoadFile();
    editorContent = content || DEFAULT_CONTENT;
    fileLoaded = true;
    setEditorContent(editorContent);

    appVersion = await GetVersion();
    CheckForUpdate().then((info) => {
      if (info.updateAvailable) {
        updateInfo = info;
      }
    });

    // Flush pending save when the window is about to close.
    EventsOn("app:before-close", () => { flushSave(); });
    window.addEventListener("beforeunload", () => { flushSave(); });
  });

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingContent: string | null = null;

  async function doSave(content: string) {
    try {
      await SaveFile(content);
      saveError = "";
    } catch (err) {
      saveError = err instanceof Error ? err.message : String(err);
    }
  }

  function scheduleSave(content: string) {
    if (!fileLoaded) return;
    pendingContent = content;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const c = pendingContent;
      pendingContent = null;
      saveTimer = undefined;
      if (c !== null) doSave(c);
    }, 500);
  }
  $: scheduleSave(editorContent);

  function flushSave() {
    if (saveTimer === undefined) return;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const c = pendingContent;
    pendingContent = null;
    if (c !== null) doSave(c);
  }

  // ── Editor interaction ──

  function handleKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      const block = findRequestAtLine(blocks, cursorLine);
      if (block) runRequest(block);
    }
  }

  // ── Request execution ──

  async function runRequest(block: RequestBlock) {
    loading = true;
    try {
      const vars = buildVarMap(varDecls, responseStore);
      const resolvedUrl = resolveVariables(block.url, vars);
      const resolvedBody = resolveVariables(block.body, vars);
      const resolvedHeaders = Object.fromEntries(
        Object.entries(block.headers).map(([k, v]) => [k, resolveVariables(v, vars)])
      );

      const resp = await Execute(block.method, resolvedUrl, resolvedHeaders, resolvedBody);

      if (block.name) {
        let parsedBody: unknown = null;
        try { parsedBody = JSON.parse(resp.body); } catch { /* not JSON */ }
        responseStore.set(block.name, {
          body: resp.body,
          parsedBody,
          headers: resp.headers,
          status: resp.status,
        });
        responseStore = responseStore; // trigger reactivity
      }

      responses = [
        {
          id: nextId++,
          method: block.method,
          url: resolvedUrl,
          status: resp.status,
          headers: resp.headers,
          body: resp.body,
          duration: resp.duration,
          error: resp.error,
          timestamp: new Date(),
        },
        ...responses,
      ];
      await tick();
      const first = document.querySelector(".log-entry") as HTMLDetailsElement;
      if (first) first.open = true;
    } finally {
      loading = false;
    }
  }

  function clearResponses() {
    responses = [];
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<main class:resizing-panes={resizingPanes}>
  <div class="titlebar-spacer">
    <span class="titlebar-title">dispatch</span>
  </div>

  <div class="panes" bind:this={panesEl}>
    <!-- Request editor pane -->
    <div class="pane" style={requestPaneWidth ? `flex: 0 0 ${requestPaneWidth}px` : ""}>
      <div class="pane-header">
        <span class="pane-label">Request</span>
      </div>
      <div class="editor-wrap">
        <div class="editor-host" bind:this={editorHost}></div>
      </div>
    </div>

    <div class="divider" class:dragging={resizingPanes} on:mousedown={startResizePanes}></div>

    <!-- Response log pane -->
    <div class="pane">
      <div class="pane-header">
        <span class="pane-label">Response</span>
        {#if responses.length > 0}
          <button class="clear-btn" on:click={clearResponses}>Clear</button>
        {/if}
      </div>
      <div class="response-log">
        {#if responses.length === 0 && !loading}
          <div class="empty-state">
            <div class="empty-icon">&#9889;</div>
            <p>Send a request to see the response</p>
            <p class="hint">Ctrl+Enter to send &middot; Click &#9654; in gutter</p>
          </div>
        {:else}
          {#if loading}
            <div class="log-loading">
              <span class="spinner-sm"></span>
              <span>Sending request&hellip;</span>
            </div>
          {/if}
          {#each responses as entry (entry.id)}
            <ResponseEntry {...entry} />
          {/each}
        {/if}
      </div>
    </div>
  </div>

  <div class="toolbar">
    {#if filePath}
      <span class="file-path">{filePath}</span>
    {/if}
    {#if appVersion}
      <span class="app-version">{appVersion}</span>
    {/if}
    <button class="file-choose-btn" title="Open file" on:click={chooseFile}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
    {#if updateInfo}
      <button class="update-badge" on:click={() => BrowserOpenURL(updateInfo.releaseURL)}>
        Update available: {updateInfo.latestVersion}
      </button>
    {/if}
    {#if saveError}
      <span class="save-error" title={saveError}>Save failed: {saveError}</span>
    {/if}
  </div>
</main>
