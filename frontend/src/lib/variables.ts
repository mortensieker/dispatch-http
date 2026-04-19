export interface VariableDecl {
  name: string;
  template: string; // raw value, may contain {{...}} references
}

export interface ResponseCapture {
  body: string;
  parsedBody: unknown;
  headers: Record<string, string>;
  status: number;
}

/** Parse all @name = value lines from file content (order preserved). */
export function parseVariableDecls(content: string): VariableDecl[] {
  const decls: VariableDecl[] = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^@(\w+)\s*=\s*(.*)$/);
    if (m) {
      decls.push({ name: m[1], template: m[2].trim() });
    }
  }
  return decls;
}

/** Navigate a dot-separated path through a parsed JSON object. */
function getNestedValue(obj: unknown, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current != null ? String(current) : undefined;
}

/** Resolve "reqName.response.body.field.path" against stored responses. */
function resolveResponsePath(
  varPath: string,
  responses: Map<string, ResponseCapture>
): string | undefined {
  const m = varPath.match(/^(\w+)\.response\.body\.(.+)$/);
  if (!m) return undefined;
  const [, reqName, fieldPath] = m;
  const capture = responses.get(reqName);
  if (!capture?.parsedBody) return undefined;
  return getNestedValue(capture.parsedBody, fieldPath);
}

/**
 * Build a fully-resolved variable map from declarations and stored responses.
 * Declarations are processed in order so earlier values can be referenced by later ones.
 */
export function buildVarMap(
  decls: VariableDecl[],
  responses: Map<string, ResponseCapture>
): Map<string, string> {
  const vars = new Map<string, string>();
  for (const decl of decls) {
    const resolved = decl.template.replace(/\{\{([^}]+)\}\}/g, (match, inner) => {
      const name = inner.trim();
      if (vars.has(name)) return vars.get(name)!;
      const rv = resolveResponsePath(name, responses);
      if (rv !== undefined) return rv;
      return match; // leave unresolved placeholders as-is
    });
    vars.set(decl.name, resolved);
  }
  return vars;
}

/** Replace {{varName}} in text using the provided variable map. */
export function resolveVariables(text: string, vars: Map<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, inner) => {
    return vars.get(inner.trim()) ?? match;
  });
}
