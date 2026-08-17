<script lang="ts">
  export let open = false;
  export let onClose: () => void;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }
</script>

<svelte:window on:keydown={open ? handleKeydown : undefined} />

{#if open}
  <div class="help-overlay" role="presentation" on:click={onClose}>
    <div class="help-dialog" role="presentation" on:click|stopPropagation>
      <div class="help-header">
        <span class="help-title">Syntax reference</span>
        <button class="help-close" on:click={onClose} title="Close">&times;</button>
      </div>

      <div class="help-body">
        <section>
          <h3>Requests</h3>
          <p>A request starts with a method and a URL. A bare URL with no method defaults to <code>GET</code>.</p>
          <pre class="help-pre">GET https://httpbin.org/get

POST https://httpbin.org/post</pre>
          <p>Supported methods: <code>GET</code> <code>POST</code> <code>PUT</code> <code>PATCH</code> <code>DELETE</code> <code>HEAD</code> <code>OPTIONS</code>.</p>
        </section>

        <section>
          <h3>Headers &amp; body</h3>
          <p>Lines right after the method line are headers (<code>Key: Value</code>). A blank line ends the headers and starts the body.</p>
          <pre class="help-pre">POST https://httpbin.org/post
Content-Type: application/json
Authorization: Bearer {'{{'}token{'}}'}

{'{'}
  "name": "example"
{'}'}</pre>
          <p>If a body is present and no <code>Content-Type</code> header is set, <code>application/json</code> is assumed.</p>
        </section>

        <section>
          <h3>Multiple requests in one file</h3>
          <p>Separate requests with a line starting with <code>###</code>.</p>
          <pre class="help-pre">GET https://httpbin.org/get

###

POST https://httpbin.org/post</pre>
          <p>Run the request under the cursor with <kbd>Ctrl/Cmd+Enter</kbd>, or click the &#9654; icon in the gutter next to its method line.</p>
        </section>

        <section>
          <h3>Comments</h3>
          <p>Lines starting with <code>#</code> or <code>//</code> are comments and are ignored, except for the <code>@name</code> annotation below.</p>
        </section>

        <section>
          <h3>Variables</h3>
          <p>Declare a variable anywhere with <code>@name = value</code>. Reference it elsewhere with <code>{'{{'}name{'}}'}</code>. Declarations are resolved top-to-bottom, so a variable can reference one declared earlier.</p>
          <pre class="help-pre">@baseUrl = https://httpbin.org
@path = /get

GET {'{{'}baseUrl{'}}'}{'{{'}path{'}}'}</pre>
        </section>

        <section>
          <h3>Capturing values from a response</h3>
          <p>Name a request with a <code># @name</code> comment above its method line. After it runs, its response is stored under that name.</p>
          <pre class="help-pre"># @name login
POST {'{{'}baseUrl{'}}'}/login
Content-Type: application/json

{'{'}
  "user": "alice",
  "pass": "secret"
{'}'}

###

@token = {'{{'}login.response.body.token{'}}'}

# @name getData
GET {'{{'}baseUrl{'}}'}/data
Authorization: Bearer {'{{'}token{'}}'}</pre>
          <p>The path after <code>.response.body.</code> navigates the parsed JSON response with dot notation, e.g. <code>{'{{'}login.response.body.data.user.id{'}}'}</code>. Run <code>login</code> first so its response is captured before <code>getData</code> uses it.</p>
          <p class="help-note">Only JSON response bodies can be navigated this way. Response headers and status are not currently exposed as variables.</p>
        </section>

        <section>
          <h3>File &amp; persistence</h3>
          <p>The editor auto-saves shortly after you stop typing. Use the folder icon in the bottom toolbar to open a different <code>.http</code> file.</p>
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .help-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .help-dialog {
    width: min(640px, 92vw);
    max-height: 82vh;
    display: flex;
    flex-direction: column;
    background: #1b2636;
    border: 1px solid #2a3a4a;
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: #1e2d3d;
    border-bottom: 1px solid #2a3a4a;
    flex-shrink: 0;
  }

  .help-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7b8b;
  }

  .help-close {
    background: none;
    border: none;
    color: #6b7b8b;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .help-close:hover {
    color: #cdd6f4;
    background: #2a3a4a;
  }

  .help-body {
    overflow-y: auto;
    padding: 4px 20px 20px;
    color: #d4d4d4;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.6;
  }

  .help-body section {
    margin-top: 20px;
  }

  .help-body h3 {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #4ec9b0;
    margin: 0 0 6px;
  }

  .help-body p {
    margin: 6px 0;
    color: #b8c4d0;
  }

  .help-note {
    color: #6b7b8b !important;
    font-size: 12px;
  }

  code {
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 12px;
    background: #0d1b2a;
    border: 1px solid #2a3a4a;
    border-radius: 3px;
    padding: 1px 5px;
    color: #ce9178;
  }

  kbd {
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 11px;
    background: #0d1b2a;
    border: 1px solid #3a4a5a;
    border-bottom-width: 2px;
    border-radius: 4px;
    padding: 1px 6px;
    color: #cdd6f4;
  }

  .help-pre {
    margin: 8px 0;
    padding: 10px 12px;
    background: #0d1b2a;
    border: 1px solid #2a3a4a;
    border-radius: 4px;
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 12px;
    line-height: 1.6;
    color: #d4d4d4;
    overflow-x: auto;
    white-space: pre;
  }
</style>
