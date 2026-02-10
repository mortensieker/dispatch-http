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
  import { escapeHtml } from "./lib/highlight";
  import type { RequestBlock } from "./lib/parser";
  import ResponseEntry from "./lib/ResponseEntry.svelte";

  interface ResponseData {
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

  let responses: ResponseData[] = [];
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

  // ── Editor interaction ──

  function updateCursorLine() {
    if (!textarea) return;
    const pos = textarea.selectionStart;
    cursorLine = editorContent.substring(0, pos).split("\n").length - 1;
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

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      const block = findRequestAtLine(blocks, cursorLine);
      if (block) runRequest(block);
    }
  }

  function handleEditorKeydown(e: KeyboardEvent) {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (e.shiftKey) {
        const lineStart = editorContent.lastIndexOf("\n", start - 1) + 1;
        const lineText = editorContent.substring(lineStart, end);
        let removed = 0;
        let newLineText: string;
        if (lineText.startsWith("\t")) {
          newLineText = lineText.substring(1); removed = 1;
        } else if (lineText.startsWith("  ")) {
          newLineText = lineText.substring(2); removed = 2;
        } else if (lineText.startsWith(" ")) {
          newLineText = lineText.substring(1); removed = 1;
        } else {
          return;
        }
        editorContent =
          editorContent.substring(0, lineStart) + newLineText + editorContent.substring(lineStart + lineText.length);
        tick().then(() => {
          const newPos = Math.max(lineStart, start - removed);
          textarea.selectionStart = newPos;
          textarea.selectionEnd = newPos;
        });
      } else {
        editorContent = editorContent.substring(0, start) + "\t" + editorContent.substring(end);
        tick().then(() => {
          textarea.selectionStart = start + 1;
          textarea.selectionEnd = start + 1;
        });
      }
      updateCursorLine();
    }
  }

  function handleGutterClick(lineIdx: number) {
    const block = blocks.find((b) => b.methodLine === lineIdx);
    if (block) runRequest(block);
  }

  // ── Request execution ──

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

  function clearResponses() {
    responses = [];
  }

  // ── Editor syntax highlighting ──

  type LineKind = "separator" | "comment" | "method" | "header" | "body" | "blank" | "text";

  function classifyLines(content: string, blks: RequestBlock[]): LineKind[] {
    const lines = content.split("\n");
    const kinds: LineKind[] = new Array(lines.length).fill("text");

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trimStart();
      if (t.startsWith("###")) kinds[i] = "separator";
      else if (t === "") kinds[i] = "blank";
      else if (t.startsWith("#") || t.startsWith("//")) kinds[i] = "comment";
    }

    for (const block of blks) {
      kinds[block.methodLine] = "method";
      let pastBlank = false;
      for (let i = block.methodLine + 1; i <= block.endLine; i++) {
        if (kinds[i] === "separator" || kinds[i] === "comment") continue;
        if (lines[i].trim() === "") { pastBlank = true; kinds[i] = "blank"; continue; }
        kinds[i] = pastBlank ? "body" : "header";
      }
    }
    return kinds;
  }

  function hlMethodLine(line: string): string {
    for (const m of HTTP_METHODS) {
      if (line.trimStart().startsWith(m + " ")) {
        const idx = line.indexOf(m);
        return `${escapeHtml(line.substring(0, idx))}<span class="hl-method">${m}</span> <span class="hl-url">${escapeHtml(line.substring(idx + m.length + 1))}</span>`;
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
    if (sm) return `${sm[1]}<span class="hl-jstr">"${escapeHtml(sm[2])}"</span>${sm[3]}`;
    return escapeHtml(line);
  }

  function hlJsonValue(raw: string): string {
    const t = raw.trim();
    const trailing = t.endsWith(",") ? "," : "";
    const v = trailing ? t.slice(0, -1) : t;
    if (v.startsWith('"') && v.endsWith('"')) return `<span class="hl-jstr">${escapeHtml(v)}</span>${trailing}`;
    if (/^-?\d/.test(v)) return `<span class="hl-jnum">${escapeHtml(v)}</span>${trailing}`;
    if (v === "true" || v === "false" || v === "null") return `<span class="hl-jbool">${escapeHtml(v)}</span>${trailing}`;
    return escapeHtml(raw);
  }

  function highlightSyntax(content: string, blks: RequestBlock[]): string {
    const lines = content.split("\n");
    const kinds = classifyLines(content, blks);
    return lines.map((line, i) => {
      switch (kinds[i]) {
        case "separator": return `<span class="hl-sep">${escapeHtml(line)}</span>`;
        case "comment": return `<span class="hl-cmt">${escapeHtml(line)}</span>`;
        case "method": return hlMethodLine(line);
        case "header": return hlHeaderLine(line);
        case "body": return hlJsonLine(line);
        default: return escapeHtml(line);
      }
    }).join("\n") + "\n";
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
            <div class="gutter-line" class:gutter-line-active={line.index === cursorLine}>
              {#if line.methodBlock}
                <button
                  class="gutter-run"
                  title="Run {line.methodBlock.method} {line.methodBlock.url}"
                  on:click={() => handleGutterClick(line.index)}
                ><svg viewBox="0 0 256 256" width="14" height="14" fill="currentColor"><path d="M231.626,128a16.015,16.015,0,0,1-8.18262,13.96094L54.53027,236.55273a15.87654,15.87654,0,0,1-18.14648-1.74023,15.87132,15.87132,0,0,1-4.74024-17.60156L60.64746,136H136a8,8,0,0,0,0-16H60.64746L31.64355,38.78906A16.00042,16.00042,0,0,1,54.5293,19.44727l168.915,94.59179A16.01613,16.01613,0,0,1,231.626,128Z"/></svg></button>
              {:else}
                <span class="line-number">{line.index + 1}</span>
              {/if}
            </div>
          {/each}
        </div>
        <div class="editor-container">
          <pre class="editor-highlight" bind:this={highlightEl} aria-hidden="true">{@html highlightedHtml}</pre>
          <textarea
            class="editor"
            bind:this={textarea}
            bind:value={editorContent}
            on:keydown={handleEditorKeydown}
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
</main>
