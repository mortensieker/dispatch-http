<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    Execute,
    GetFilePath,
    LoadFile,
    SaveFile,
    GetVersion,
    CheckForUpdate,
  } from "../wailsjs/go/main/App.js";
  import { BrowserOpenURL } from "../wailsjs/runtime/runtime.js";
  import { parseHttpFile, findRequestAtLine, HTTP_METHODS } from "./lib/parser";
  import type { RequestBlock } from "./lib/parser";

  interface ResponseEntry {
    id: number;
    method: string;
    url: string;
    status: number;
    headers: Record<string, string>;
    body: string;
    duration: number;
    error: string;
    timestamp: Date;
  }

  const DEFAULT_CONTENT = `### Simple GET
GET https://httpbin.org/get

### POST with JSON body
POST https://httpbin.org/post
Content-Type: application/json

{
  "name": "dispatch",
  "version": "1.0"
}`;

  let responses: ResponseEntry[] = [];
  let loading = false;
  let nextId = 1;
  let fileLoaded = false;
  let filePath = "";
  let appVersion = "";
  let updateInfo: { updateAvailable: boolean; latestVersion: string; releaseURL: string } | null = null;

  let editorContent = "";

  let textarea: HTMLTextAreaElement;
  let highlightEl: HTMLPreElement;
  let gutterEl: HTMLDivElement;
  let cursorLine = 0;
  let blocks: RequestBlock[] = [];

  $: blocks = parseHttpFile(editorContent);
  $: lineCount = editorContent.split("\n").length;
  $: highlightedHtml = highlightSyntax(editorContent, blocks);
  $: gutterLines = Array.from({ length: lineCount }, (_, i) => ({
    index: i,
    methodBlock: blocks.find((b) => b.methodLine === i) || null,
  }));

  // ── File persistence ──

  onMount(async () => {
    filePath = await GetFilePath();
    const content = await LoadFile();
    editorContent = content || DEFAULT_CONTENT;
    fileLoaded = true;

    appVersion = await GetVersion();
    CheckForUpdate().then((info) => {
      if (info.updateAvailable) {
        updateInfo = info;
      }
    });
  });

  let saveTimer: ReturnType<typeof setTimeout>;
  function scheduleSave(content: string) {
    if (!fileLoaded) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      SaveFile(content);
    }, 500);
  }
  $: scheduleSave(editorContent);

  function updateCursorLine() {
    if (!textarea) return;
    const pos = textarea.selectionStart;
    const textBefore = editorContent.substring(0, pos);
    cursorLine = textBefore.split("\n").length - 1;
  }

  function syncScroll() {
    if (gutterEl && textarea) {
      gutterEl.scrollTop = textarea.scrollTop;
    }
    if (highlightEl && textarea) {
      highlightEl.scrollTop = textarea.scrollTop;
      highlightEl.scrollLeft = textarea.scrollLeft;
    }
  }

  async function runRequest(block: RequestBlock) {
    loading = true;
    try {
      const resp = await Execute(block.method, block.url, block.body);
      responses = [
        {
          id: nextId++,
          method: block.method,
          url: block.url,
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

  async function runAtCursor() {
    const block = findRequestAtLine(blocks, cursorLine);
    if (block) {
      await runRequest(block);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runAtCursor();
    }
  }

  function handleGutterClick(lineIdx: number) {
    const block = blocks.find((b) => b.methodLine === lineIdx);
    if (block) {
      runRequest(block);
    }
  }

  function clearResponses() {
    responses = [];
  }

  function formatBody(str: string): string {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  }

  function statusClass(status: number): string {
    if (status >= 200 && status < 300) return "status-ok";
    if (status >= 300 && status < 400) return "status-redirect";
    if (status >= 400 && status < 500) return "status-client-error";
    return "status-server-error";
  }

  function formatTime(d: Date): string {
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  // ── Syntax highlighting ──

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  type LineKind =
    | "separator"
    | "comment"
    | "method"
    | "header"
    | "body"
    | "blank"
    | "text";

  function classifyLines(content: string, blks: RequestBlock[]): LineKind[] {
    const lines = content.split("\n");
    const kinds: LineKind[] = new Array(lines.length).fill("text");

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trimStart();
      if (t.startsWith("###")) {
        kinds[i] = "separator";
      } else if (t === "") {
        kinds[i] = "blank";
      } else if (t.startsWith("#") || t.startsWith("//")) {
        kinds[i] = "comment";
      }
    }

    for (const block of blks) {
      kinds[block.methodLine] = "method";
      let pastBlank = false;
      for (let i = block.methodLine + 1; i <= block.endLine; i++) {
        if (kinds[i] === "separator" || kinds[i] === "comment") continue;
        if (lines[i].trim() === "") {
          pastBlank = true;
          kinds[i] = "blank";
          continue;
        }
        kinds[i] = pastBlank ? "body" : "header";
      }
    }

    return kinds;
  }

  function hlMethodLine(line: string): string {
    for (const m of HTTP_METHODS) {
      if (line.trimStart().startsWith(m + " ")) {
        const idx = line.indexOf(m);
        const pre = escapeHtml(line.substring(0, idx));
        const url = escapeHtml(line.substring(idx + m.length + 1));
        return `${pre}<span class="hl-method">${m}</span> <span class="hl-url">${url}</span>`;
      }
    }
    return escapeHtml(line);
  }

  function hlHeaderLine(line: string): string {
    const ci = line.indexOf(":");
    if (ci > 0) {
      return `<span class="hl-hkey">${escapeHtml(line.substring(0, ci))}</span><span class="hl-punct">:</span><span class="hl-hval">${escapeHtml(line.substring(ci + 1))}</span>`;
    }
    return escapeHtml(line);
  }

  function hlJsonLine(line: string): string {
    const m = line.match(/^(\s*)"((?:[^"\\]|\\.)*)"\s*:\s*(.*)/);
    if (m) {
      const [, indent, key, rest] = m;
      return `${indent}<span class="hl-jkey">"${escapeHtml(key)}"</span><span class="hl-punct">:</span> ${hlJsonValue(rest)}`;
    }
    const sm = line.match(/^(\s*)"((?:[^"\\]|\\.)*)"\s*(,?)$/);
    if (sm) {
      return `${sm[1]}<span class="hl-jstr">"${escapeHtml(sm[2])}"</span>${sm[3]}`;
    }
    return escapeHtml(line);
  }

  function hlJsonValue(raw: string): string {
    const t = raw.trim();
    const trailing = t.endsWith(",") ? "," : "";
    const v = trailing ? t.slice(0, -1) : t;

    if (v.startsWith('"') && v.endsWith('"')) {
      return `<span class="hl-jstr">${escapeHtml(v)}</span>${trailing}`;
    }
    if (/^-?\d/.test(v)) {
      return `<span class="hl-jnum">${escapeHtml(v)}</span>${trailing}`;
    }
    if (v === "true" || v === "false" || v === "null") {
      return `<span class="hl-jbool">${escapeHtml(v)}</span>${trailing}`;
    }
    return escapeHtml(raw);
  }

  function highlightSyntax(content: string, blks: RequestBlock[]): string {
    const lines = content.split("\n");
    const kinds = classifyLines(content, blks);

    const result = lines
      .map((line, i) => {
        switch (kinds[i]) {
          case "separator":
            return `<span class="hl-sep">${escapeHtml(line)}</span>`;
          case "comment":
            return `<span class="hl-cmt">${escapeHtml(line)}</span>`;
          case "method":
            return hlMethodLine(line);
          case "header":
            return hlHeaderLine(line);
          case "body":
            return hlJsonLine(line);
          default:
            return escapeHtml(line);
        }
      })
      .join("\n");

    return result + "\n";
  }

  function highlightJson(str: string): string {
    return str.split("\n").map(hlJsonLine).join("\n");
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<main>
  <div class="toolbar">
    <span class="app-title">dispatch</span>
    {#if appVersion}
      <span class="app-version">{appVersion}</span>
    {/if}
    {#if filePath}
      <span class="file-path">{filePath}</span>
    {/if}
    {#if updateInfo}
      <button class="update-badge" on:click={() => BrowserOpenURL(updateInfo.releaseURL)}>
        Update available: {updateInfo.latestVersion}
      </button>
    {/if}
  </div>

  <div class="panes">
    <!-- Request editor pane -->
    <div class="pane">
      <div class="pane-header">
        <span class="pane-label">Request</span>
      </div>
      <div class="editor-wrap">
        <div class="gutter" bind:this={gutterEl}>
          {#each gutterLines as line (line.index)}
            <div
              class="gutter-line"
              class:gutter-line-active={line.index === cursorLine}
            >
              {#if line.methodBlock}
                <button
                  class="gutter-run"
                  title="Run {line.methodBlock.method} {line.methodBlock.url}"
                  on:click={() => handleGutterClick(line.index)}
                  ><svg
                    viewBox="0 0 256 256"
                    width="14"
                    height="14"
                    fill="currentColor"
                    ><path
                      d="M231.626,128a16.015,16.015,0,0,1-8.18262,13.96094L54.53027,236.55273a15.87654,15.87654,0,0,1-18.14648-1.74023,15.87132,15.87132,0,0,1-4.74024-17.60156L60.64746,136H136a8,8,0,0,0,0-16H60.64746L31.64355,38.78906A16.00042,16.00042,0,0,1,54.5293,19.44727l168.915,94.59179A16.01613,16.01613,0,0,1,231.626,128Z"
                    /></svg
                  ></button
                >
              {:else}
                <span class="line-number">{line.index + 1}</span>
              {/if}
            </div>
          {/each}
        </div>
        <div class="editor-container">
          <pre
            class="editor-highlight"
            bind:this={highlightEl}
            aria-hidden="true">{@html highlightedHtml}</pre>
          <textarea
            class="editor"
            bind:this={textarea}
            bind:value={editorContent}
            on:keyup={updateCursorLine}
            on:mouseup={updateCursorLine}
            on:scroll={syncScroll}
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
          ></textarea>
        </div>
      </div>
    </div>

    <div class="divider"></div>

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
            <p class="hint">
              Ctrl+Enter to send &middot; Click &#9654; in gutter
            </p>
          </div>
        {:else}
          {#if loading}
            <div class="log-loading">
              <span class="spinner-sm"></span>
              <span>Sending request&hellip;</span>
            </div>
          {/if}
          {#each responses as entry (entry.id)}
            <details class="log-entry">
              <summary class="log-summary">
                <span class="log-method {entry.method.toLowerCase()}"
                  >{entry.method}</span
                >
                <span class="log-url">{entry.url}</span>
                {#if entry.error}
                  <span class="log-badge status-client-error">ERR</span>
                {:else}
                  <span class="log-badge {statusClass(entry.status)}"
                    >{entry.status}</span
                  >
                {/if}
                <span class="log-duration">{entry.duration}ms</span>
                <span class="log-time">{formatTime(entry.timestamp)}</span>
              </summary>
              <div class="log-body">
                {#if entry.error}
                  <pre class="log-error">{entry.error}</pre>
                {:else}
                  <div class="log-section">
                    <div class="log-section-label">Body</div>
                    <pre class="log-pre">{@html highlightJson(
                        formatBody(entry.body),
                      )}</pre>
                  </div>
                  {#if entry.headers && Object.keys(entry.headers).length > 0}
                    <details class="log-headers-details">
                      <summary class="log-section-label clickable">
                        Headers ({Object.keys(entry.headers).length})
                      </summary>
                      <div class="log-headers">
                        {#each Object.entries(entry.headers).sort() as [key, value]}
                          <div class="log-header-row">
                            <span class="hl-hkey">{key}</span><span
                              class="hl-punct">:</span
                            > <span class="hl-hval">{value}</span>
                          </div>
                        {/each}
                      </div>
                    </details>
                  {/if}
                {/if}
              </div>
            </details>
          {/each}
        {/if}
      </div>
    </div>
  </div>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui,
      sans-serif;
    background: #1b2636;
    color: #d4d4d4;
    overflow: hidden;
  }

  /* ── Toolbar ── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: #1e2d3d;
    border-bottom: 1px solid #2a3a4a;
    flex-shrink: 0;
  }

  .app-title {
    font-size: 13px;
    font-weight: 700;
    color: #4ec9b0;
    letter-spacing: 0.04em;
    text-transform: lowercase;
  }

  .file-path {
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 11px;
    color: #4a5a6a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .app-version {
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 11px;
    color: #6b7b8b;
  }

  .update-badge {
    margin-left: auto;
    padding: 3px 10px;
    background: #4ec9b022;
    border: 1px solid #4ec9b044;
    border-radius: 3px;
    color: #4ec9b0;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }

  .update-badge:hover {
    background: #4ec9b033;
    border-color: #4ec9b066;
  }

  /* ── Split panes ── */
  .panes {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .pane-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    height: 32px;
    background: #1e2d3d;
    border-bottom: 1px solid #2a3a4a;
    flex-shrink: 0;
  }

  .pane-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7b8b;
  }

  .clear-btn {
    margin-left: auto;
    padding: 2px 8px;
    background: none;
    border: 1px solid #2a3a4a;
    border-radius: 3px;
    color: #6b7b8b;
    font-size: 10px;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s;
  }

  .clear-btn:hover {
    color: #a0b0c0;
    border-color: #4a5a6a;
  }

  .divider {
    width: 1px;
    background: #2a3a4a;
    flex-shrink: 0;
  }

  /* ── Editor ── */
  .editor-wrap {
    display: flex;
    flex: 1;
    overflow: hidden;
    background: #0d1b2a;
  }

  .gutter {
    width: 48px;
    flex-shrink: 0;
    overflow: hidden;
    background: #0f1e2e;
    border-right: 1px solid #1a2a3a;
    padding-top: 12px;
    user-select: none;
  }

  .gutter-line {
    height: 21px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 12px;
  }

  .gutter-line-active {
    background: #1a2a3a;
  }
  .line-number {
    color: #3a4a5a;
  }
  .gutter-line-active .line-number {
    color: #6b7b8b;
  }

  .gutter-run {
    background: none;
    border: none;
    color: #4ec9b0;
    font-size: 10px;
    cursor: pointer;
    padding: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.1s;
  }

  .gutter-run:hover {
    color: #5fd9c0;
    background: #4ec9b011;
  }

  .editor-container {
    position: relative;
    flex: 1;
    overflow: hidden;
  }

  .editor-highlight {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0;
    padding: 12px 16px;
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 13px;
    line-height: 21px;
    tab-size: 2;
    white-space: pre;
    overflow: hidden;
    pointer-events: none;
    color: #d4d4d4;
    background: transparent;
  }

  .editor {
    position: relative;
    width: 100%;
    height: 100%;
    resize: none;
    border: none;
    outline: none;
    background: transparent;
    color: transparent;
    caret-color: #d4d4d4;
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 13px;
    line-height: 21px;
    padding: 12px 16px;
    tab-size: 2;
    white-space: pre;
    overflow: auto;
    z-index: 1;
  }

  .editor::selection {
    background: #264f78;
  }

  .editor::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  .editor::-webkit-scrollbar-track {
    background: transparent;
  }
  .editor::-webkit-scrollbar-thumb {
    background: #2a3a4a;
    border-radius: 4px;
  }
  .editor::-webkit-scrollbar-thumb:hover {
    background: #3a4a5a;
  }

  /* ── Syntax highlighting ── */
  :global(.hl-sep) {
    color: #dcdcaa;
    font-weight: 600;
  }
  :global(.hl-cmt) {
    color: #6a9955;
    font-style: italic;
  }
  :global(.hl-method) {
    color: #4ec9b0;
    font-weight: 700;
  }
  :global(.hl-url) {
    color: #9cdcfe;
  }
  :global(.hl-hkey) {
    color: #c586c0;
  }
  :global(.hl-hval) {
    color: #ce9178;
  }
  :global(.hl-punct) {
    color: #808080;
  }
  :global(.hl-jkey) {
    color: #9cdcfe;
  }
  :global(.hl-jstr) {
    color: #ce9178;
  }
  :global(.hl-jnum) {
    color: #b5cea8;
  }
  :global(.hl-jbool) {
    color: #569cd6;
  }

  /* ── Response log ── */
  .response-log {
    flex: 1;
    overflow: auto;
    background: #0d1b2a;
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 12px;
    line-height: 1.6;
  }

  .response-log::-webkit-scrollbar {
    width: 8px;
  }
  .response-log::-webkit-scrollbar-track {
    background: transparent;
  }
  .response-log::-webkit-scrollbar-thumb {
    background: #2a3a4a;
    border-radius: 4px;
  }
  .response-log::-webkit-scrollbar-thumb:hover {
    background: #3a4a5a;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 300px;
    color: #4a5a6a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui,
      sans-serif;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 4px 0;
    font-size: 14px;
  }

  .hint {
    font-size: 12px !important;
    color: #3a4a5a;
  }

  .log-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    color: #6b7b8b;
    border-bottom: 1px solid #1a2a3a;
  }

  .spinner-sm {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid #2a3a4a;
    border-top-color: #4ec9b0;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  /* ── Log entries ── */
  .log-entry {
    border-bottom: 1px solid #1a2a3a;
  }

  .log-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    cursor: pointer;
    user-select: none;
    list-style: none;
    transition: background 0.1s;
  }

  .log-summary::-webkit-details-marker {
    display: none;
  }

  .log-summary::before {
    content: "\25B6";
    font-size: 8px;
    color: #4a5a6a;
    transition: transform 0.15s;
    flex-shrink: 0;
  }

  .log-entry[open] > .log-summary::before {
    transform: rotate(90deg);
  }

  .log-summary:hover {
    background: #0f1e2e;
  }

  .log-method {
    font-weight: 700;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .log-method.get {
    color: #4ec9b0;
    background: #4ec9b015;
  }
  .log-method.post {
    color: #dcdcaa;
    background: #dcdcaa15;
  }
  .log-method.put {
    color: #569cd6;
    background: #569cd615;
  }
  .log-method.patch {
    color: #c586c0;
    background: #c586c015;
  }
  .log-method.delete {
    color: #f44336;
    background: #f4433615;
  }
  .log-method.head {
    color: #6b7b8b;
    background: #6b7b8b15;
  }
  .log-method.options {
    color: #6b7b8b;
    background: #6b7b8b15;
  }

  .log-url {
    color: #9cdcfe;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
  }

  .log-badge {
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 700;
    font-size: 11px;
    flex-shrink: 0;
  }

  .log-badge.status-ok {
    background: #4ec9b022;
    color: #4ec9b0;
  }
  .log-badge.status-redirect {
    background: #dcdcaa22;
    color: #dcdcaa;
  }
  .log-badge.status-client-error {
    background: #f4433622;
    color: #f44336;
  }
  .log-badge.status-server-error {
    background: #ff980022;
    color: #ff9800;
  }

  .log-duration {
    color: #6b7b8b;
    font-size: 11px;
    flex-shrink: 0;
  }

  .log-time {
    color: #3a4a5a;
    font-size: 11px;
    flex-shrink: 0;
  }

  /* ── Log entry body ── */
  .log-body {
    padding: 0 16px 12px 30px;
  }

  .log-section {
    margin-bottom: 8px;
  }

  .log-section-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #4a5a6a;
    padding: 4px 0;
    list-style: none;
  }

  .log-section-label::-webkit-details-marker {
    display: none;
  }

  .log-section-label.clickable {
    cursor: pointer;
  }

  .log-section-label.clickable::before {
    content: "\25B6";
    font-size: 7px;
    margin-right: 4px;
    display: inline-block;
    transition: transform 0.15s;
    color: #3a4a5a;
  }

  .log-headers-details[open] > .log-section-label.clickable::before {
    transform: rotate(90deg);
  }

  .log-pre {
    margin: 0;
    padding: 10px 12px;
    background: #0a1420;
    border-radius: 4px;
    border: 1px solid #1a2a3a;
    color: #d4d4d4;
    font-size: 12px;
    line-height: 1.6;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .log-error {
    margin: 0;
    padding: 10px 12px;
    background: #2d1515;
    border: 1px solid #f4433633;
    border-radius: 4px;
    color: #e0a0a0;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .log-headers {
    padding: 4px 0;
  }

  .log-header-row {
    padding: 2px 0;
    font-size: 12px;
    color: #d4d4d4;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
