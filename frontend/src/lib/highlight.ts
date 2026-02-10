export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function hlJsonLine(line: string): string {
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

export function hlJsonValue(raw: string): string {
  const t = raw.trim();
  const trailing = t.endsWith(",") ? "," : "";
  const v = trailing ? t.slice(0, -1) : t;

  if (v.startsWith('"') && v.endsWith('"')) {
    if (v.length > 200) {
      const preview = v.substring(0, 80) + '\u2026"';
      return `<details class="jval-long"><summary><span class="hl-jstr">${escapeHtml(preview)}</span></summary><span class="hl-jstr">${escapeHtml(v)}</span></details>${trailing}`;
    }
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

export function highlightJson(str: string): string {
  return str.split("\n").map(hlJsonLine).join("\n");
}
