import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { parseHttpFile, HTTP_METHODS, type RequestBlock } from "./parser";

type LineKind = "separator" | "comment" | "method" | "header" | "body" | "blank" | "text" | "var-decl";

const MARK = {
  sep: Decoration.mark({ class: "hl-sep" }),
  cmt: Decoration.mark({ class: "hl-cmt" }),
  method: Decoration.mark({ class: "hl-method" }),
  url: Decoration.mark({ class: "hl-url" }),
  hkey: Decoration.mark({ class: "hl-hkey" }),
  hval: Decoration.mark({ class: "hl-hval" }),
  punct: Decoration.mark({ class: "hl-punct" }),
  jkey: Decoration.mark({ class: "hl-jkey" }),
  jstr: Decoration.mark({ class: "hl-jstr" }),
  jnum: Decoration.mark({ class: "hl-jnum" }),
  jbool: Decoration.mark({ class: "hl-jbool" }),
  varName: Decoration.mark({ class: "hl-var-name" }),
  varVal: Decoration.mark({ class: "hl-var-val" }),
  varRef: Decoration.mark({ class: "hl-var-ref" }),
};

interface Range { from: number; to: number; deco: Decoration; }

function classifyLines(lines: string[], blocks: RequestBlock[]): LineKind[] {
  const kinds: LineKind[] = new Array(lines.length).fill("text");

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trimStart();
    if (t.startsWith("###")) kinds[i] = "separator";
    else if (t === "") kinds[i] = "blank";
    else if (t.startsWith("#") || t.startsWith("//")) kinds[i] = "comment";
    else if (/^@\w+\s*=/.test(t)) kinds[i] = "var-decl";
  }

  for (const block of blocks) {
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

// Regexes below use the "d" flag to get exact [start, end] offsets per capture
// group (match.indices), avoiding fragile manual re-slicing of substrings.

function methodLineRanges(line: string, base: number): Range[] {
  for (const m of HTTP_METHODS) {
    const re = new RegExp(`^(\\s*)(${m})\\s(.*)$`, "d");
    const match = re.exec(line) as (RegExpExecArray & { indices: Array<[number, number]> }) | null;
    if (!match) continue;
    const [methodStart, methodEnd] = match.indices[2];
    const [urlStart, urlEnd] = match.indices[3];
    return [
      { from: base + methodStart, to: base + methodEnd, deco: MARK.method },
      { from: base + urlStart, to: base + urlEnd, deco: MARK.url },
    ];
  }
  return [];
}

function headerLineRanges(line: string, base: number): Range[] {
  const ci = line.indexOf(":");
  if (ci <= 0) return [];
  return [
    { from: base, to: base + ci, deco: MARK.hkey },
    { from: base + ci, to: base + ci + 1, deco: MARK.punct },
    { from: base + ci + 1, to: base + line.length, deco: MARK.hval },
  ];
}

function jsonLineRanges(line: string, base: number): Range[] {
  const kv = /^(\s*)"((?:[^"\\]|\\.)*)"(\s*)(:)(\s*)(.*)$/d.exec(line) as
    (RegExpExecArray & { indices: Array<[number, number]> }) | null;
  if (kv) {
    const [, keyOpenEnd] = kv.indices[1]; // end of leading whitespace = start of opening quote
    const [colonStart, colonEnd] = kv.indices[4];
    const [restStart] = kv.indices[6];
    const keyTo = kv.indices[2][1] + 1; // include closing quote
    return [
      { from: base + keyOpenEnd, to: base + keyTo, deco: MARK.jkey },
      { from: base + colonStart, to: base + colonEnd, deco: MARK.punct },
      ...jsonValueRanges(kv[6], base + restStart),
    ];
  }
  const str = /^(\s*)"((?:[^"\\]|\\.)*)"(\s*,?)$/d.exec(line) as
    (RegExpExecArray & { indices: Array<[number, number]> }) | null;
  if (str) {
    const [, indentEnd] = str.indices[1];
    const [, strEnd] = str.indices[2];
    return [{ from: base + indentEnd, to: base + strEnd + 1, deco: MARK.jstr }];
  }
  return [];
}

function jsonValueRanges(raw: string, base: number): Range[] {
  const m = /^(\s*)(.*?)(,?)$/.exec(raw);
  if (!m) return [];
  const [, indent, value] = m;
  const from = base + indent.length;
  const to = from + value.length;
  if (value.startsWith('"') && value.endsWith('"')) return [{ from, to, deco: MARK.jstr }];
  if (/^-?\d/.test(value)) return [{ from, to, deco: MARK.jnum }];
  if (value === "true" || value === "false" || value === "null") return [{ from, to, deco: MARK.jbool }];
  return [];
}

function varDeclLineRanges(line: string, base: number): Range[] {
  const m = /^(@\w+)(\s*=\s*)(.*)$/d.exec(line) as
    (RegExpExecArray & { indices: Array<[number, number]> }) | null;
  if (!m) return [];
  const [nameStart, nameEnd] = m.indices[1];
  const [eqStart, eqEnd] = m.indices[2];
  const [valueStart, valueEnd] = m.indices[3];
  return [
    { from: base + nameStart, to: base + nameEnd, deco: MARK.varName },
    { from: base + eqStart, to: base + eqEnd, deco: MARK.punct },
    { from: base + valueStart, to: base + valueEnd, deco: MARK.varVal },
  ];
}

function varRefRanges(line: string, base: number): Range[] {
  const ranges: Range[] = [];
  const re = /\{\{([^}]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    ranges.push({ from: base + m.index, to: base + m.index + m[0].length, deco: MARK.varRef });
  }
  return ranges;
}

export function computeHighlightRanges(doc: { toString(): string }): Range[] {
  const content = doc.toString();
  const lines = content.split("\n");
  const blocks = parseHttpFile(content);
  const kinds = classifyLines(lines, blocks);

  const ranges: Range[] = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    switch (kinds[i]) {
      case "separator":
        ranges.push({ from: offset, to: offset + line.length, deco: MARK.sep });
        break;
      case "comment":
        ranges.push({ from: offset, to: offset + line.length, deco: MARK.cmt });
        break;
      case "method":
        ranges.push(...methodLineRanges(line, offset));
        break;
      case "header":
        ranges.push(...headerLineRanges(line, offset));
        break;
      case "body":
        ranges.push(...jsonLineRanges(line, offset));
        break;
      case "var-decl":
        ranges.push(...varDeclLineRanges(line, offset));
        break;
    }
    // Variable references ({{...}}) are highlighted on top of any other
    // styling on the line, mirroring the previous hlVarRefs-wraps-everything behavior.
    ranges.push(...varRefRanges(line, offset));
    offset += line.length + 1;
  }
  return ranges;
}

function buildDecorations(view: EditorView): DecorationSet {
  const ranges = computeHighlightRanges(view.state.doc)
    .filter((r) => r.to > r.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const r of ranges) builder.add(r.from, r.to, r.deco);
  return builder.finish();
}

export const httpSyntaxHighlighting = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);
