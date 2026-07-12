import { EditorState } from "@codemirror/state";
import { EditorView, gutter, GutterMarker, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import type { RequestBlock } from "./parser";
import { httpSyntaxHighlighting } from "./httpHighlight";

export interface EditorCallbacks {
  onDocChanged: (content: string) => void;
  onCursorLineChanged: (line: number) => void;
  onRunLine: (line: number) => void;
  getBlocks: () => RequestBlock[];
}

const RUN_ICON =
  '<svg viewBox="0 0 256 256" width="14" height="14" fill="currentColor"><path d="M231.626,128a16.015,16.015,0,0,1-8.18262,13.96094L54.53027,236.55273a15.87654,15.87654,0,0,1-18.14648-1.74023,15.87132,15.87132,0,0,1-4.74024-17.60156L60.64746,136H136a8,8,0,0,0,0-16H60.64746L31.64355,38.78906A16.00042,16.00042,0,0,1,54.5293,19.44727l168.915,94.59179A16.01613,16.01613,0,0,1,231.626,128Z"/></svg>';

class LineMarker extends GutterMarker {
  constructor(
    private readonly lineNumber: number,
    private readonly block: RequestBlock | null,
    private readonly onClick: () => void
  ) {
    super();
  }

  eq(other: LineMarker): boolean {
    return other.lineNumber === this.lineNumber && other.block === this.block;
  }

  toDOM(): HTMLElement {
    if (this.block) {
      const btn = document.createElement("button");
      btn.className = "gutter-run";
      btn.title = `Run ${this.block.method} ${this.block.url}`;
      btn.innerHTML = RUN_ICON;
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onClick();
      });
      return btn;
    }
    const span = document.createElement("span");
    span.className = "line-number";
    span.textContent = String(this.lineNumber);
    return span;
  }
}

function runGutter(callbacks: EditorCallbacks) {
  return gutter({
    class: "cm-run-gutter",
    lineMarker(view, line) {
      const lineNumber = view.state.doc.lineAt(line.from).number;
      const block = callbacks.getBlocks().find((b) => b.methodLine === lineNumber - 1) ?? null;
      const marker = new LineMarker(lineNumber, block, () => callbacks.onRunLine(lineNumber - 1));
      const activeLine = view.state.doc.lineAt(view.state.selection.main.head).number;
      marker.elementClass = lineNumber === activeLine ? "gutter-line-active" : "";
      return marker;
    },
    lineMarkerChange(update) {
      return update.docChanged || update.selectionSet;
    },
    initialSpacer: () => new LineMarker(0, null, () => {}),
  });
}

function changeListener(callbacks: EditorCallbacks) {
  return EditorView.updateListener.of((update) => {
    if (update.docChanged) callbacks.onDocChanged(update.state.doc.toString());
    if (update.docChanged || update.selectionSet) {
      const line = update.state.doc.lineAt(update.state.selection.main.head).number - 1;
      callbacks.onCursorLineChanged(line);
    }
  });
}

const theme = EditorView.theme(
  {
    "&": {
      color: "#d4d4d4",
      backgroundColor: "#0d1b2a",
      height: "100%",
      flex: "1",
      minWidth: "0",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-content": {
      fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: "13px",
      lineHeight: "21px",
      padding: "12px 16px",
      caretColor: "#d4d4d4",
    },
    ".cm-scroller": { overflow: "auto" },
    "&.cm-editor .cm-selectionBackground, ::selection": { backgroundColor: "#264f7880" },
    ".cm-cursor": { borderLeftColor: "#d4d4d4" },
    ".cm-gutters": {
      backgroundColor: "#0f1e2e",
      color: "#3a4a5a",
      border: "none",
    },
    ".cm-run-gutter": {
      width: "48px",
      paddingTop: "0",
    },
    ".cm-gutterElement": {
      height: "21px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: "12px",
    },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
  },
  { dark: true }
);

export function createEditorExtensions(callbacks: EditorCallbacks) {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    keymap.of([
      {
        key: "Mod-Enter",
        run: (view) => {
          const line = view.state.doc.lineAt(view.state.selection.main.head).number - 1;
          callbacks.onRunLine(line);
          return true;
        },
      },
    ]),
    indentUnit.of("\t"),
    EditorState.tabSize.of(2),
    runGutter(callbacks),
    httpSyntaxHighlighting,
    changeListener(callbacks),
    theme,
    EditorView.contentAttributes.of({ spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
  ];
}
