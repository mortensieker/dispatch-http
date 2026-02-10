<script lang="ts">
  import { highlightJson } from "./highlight";

  export let method: string;
  export let url: string;
  export let status: number;
  export let headers: Record<string, string>;
  export let body: string;
  export let duration: number;
  export let error: string;
  export let timestamp: Date;

  function formatBody(str: string): string {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  }

  function statusClass(s: number): string {
    if (s >= 200 && s < 300) return "status-ok";
    if (s >= 300 && s < 400) return "status-redirect";
    if (s >= 400 && s < 500) return "status-client-error";
    return "status-server-error";
  }

  function formatTime(d: Date): string {
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
</script>

<details class="log-entry">
  <summary class="log-summary">
    <span class="log-method {method.toLowerCase()}">{method}</span>
    <span class="log-url">{url}</span>
    {#if error}
      <span class="log-badge status-client-error">ERR</span>
    {:else}
      <span class="log-badge {statusClass(status)}">{status}</span>
    {/if}
    <span class="log-duration">{duration}ms</span>
    <span class="log-time">{formatTime(timestamp)}</span>
  </summary>
  <div class="log-body">
    {#if error}
      <pre class="log-error">{error}</pre>
    {:else}
      <div class="log-section">
        <div class="log-section-label">Body</div>
        <pre class="log-pre">{@html highlightJson(formatBody(body))}</pre>
      </div>
      {#if headers && Object.keys(headers).length > 0}
        <details class="log-headers-details">
          <summary class="log-section-label clickable">
            Headers ({Object.keys(headers).length})
          </summary>
          <div class="log-headers">
            {#each Object.entries(headers).sort() as [key, value]}
              <div class="log-header-row">
                <span class="hl-hkey">{key}</span><span class="hl-punct">:</span>
                <span class="hl-hval">{value}</span>
              </div>
            {/each}
          </div>
        </details>
      {/if}
    {/if}
  </div>
</details>
