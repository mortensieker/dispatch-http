export interface RequestBlock {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  startLine: number; // 0-based line index where this block starts
  endLine: number;   // 0-based line index where this block ends (inclusive)
  methodLine: number; // 0-based line index of the method+URL line
}

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function parseHttpFile(content: string): RequestBlock[] {
  const lines = content.split('\n');
  const blocks: RequestBlock[] = [];

  let blockStart = 0;
  let currentMethodLine = -1;

  function flush(endLine: number) {
    if (currentMethodLine < 0) return;
    // Trim trailing blank lines
    while (endLine > currentMethodLine && lines[endLine].trim() === '') endLine--;
    const block = buildBlock(lines, blockStart, endLine, currentMethodLine);
    if (block) blocks.push(block);
    currentMethodLine = -1;
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // ### separator — always ends the current block
    if (trimmed.startsWith('###')) {
      flush(i - 1);
      blockStart = i;
      continue;
    }

    // HTTP method line — starts a new request
    if (looksLikeMethodLine(trimmed)) {
      if (currentMethodLine >= 0) {
        // Flush previous block before starting a new one
        flush(i - 1);
        blockStart = i;
      }
      // If no method yet and blockStart is past this line (shouldn't happen), fix it
      if (currentMethodLine < 0 && blockStart > i) {
        blockStart = i;
      }
      currentMethodLine = i;
    }
  }

  // Flush the final block
  flush(lines.length - 1);

  return blocks;
}

function looksLikeMethodLine(line: string): boolean {
  for (const m of HTTP_METHODS) {
    if (line.startsWith(m + ' ')) {
      const url = line.substring(m.length + 1).trim();
      // URL must look like an actual URL, not random body text
      if (/^(https?:\/\/|\/|{{|\w+\.\w)/.test(url)) return true;
    }
  }
  // Bare URL defaults to GET
  return /^https?:\/\//.test(line);
}

function buildBlock(
  lines: string[], start: number, end: number, mLine: number
): RequestBlock | null {
  const { method, url } = parseMethodUrl(lines[mLine].trim());
  if (!method) return null;

  const headers: Record<string, string> = {};
  let bodyStart = -1;

  for (let i = mLine + 1; i <= end; i++) {
    if (lines[i].trim() === '') {
      bodyStart = i + 1;
      break;
    }
    const colonIdx = lines[i].indexOf(':');
    if (colonIdx > 0) {
      headers[lines[i].substring(0, colonIdx).trim()] = lines[i].substring(colonIdx + 1).trim();
    }
  }

  let body = '';
  if (bodyStart > 0 && bodyStart <= end) {
    body = lines.slice(bodyStart, end + 1).join('\n').trimEnd();
  }

  return { method, url, headers, body, startLine: start, endLine: end, methodLine: mLine };
}

function parseMethodUrl(line: string): { method: string; url: string } {
  for (const m of HTTP_METHODS) {
    if (line.startsWith(m + ' ')) {
      return { method: m, url: line.substring(m.length + 1).trim() };
    }
  }
  if (line.startsWith('http://') || line.startsWith('https://')) {
    return { method: 'GET', url: line };
  }
  return { method: '', url: '' };
}

export function findRequestAtLine(blocks: RequestBlock[], line: number): RequestBlock | null {
  for (const block of blocks) {
    if (line >= block.startLine && line <= block.endLine) {
      return block;
    }
  }
  return null;
}
