import { describe, it, expect } from "vitest";
import { escapeHtml, hlJsonLine, hlJsonValue, highlightJson } from "./highlight";

describe("escapeHtml", () => {
  it("escapes angle brackets", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });

  it("leaves clean strings alone", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

describe("hlJsonLine", () => {
  it("highlights a key-value pair with string value", () => {
    const result = hlJsonLine('  "name": "test"');
    expect(result).toContain('class="hl-jkey"');
    expect(result).toContain('class="hl-jstr"');
    expect(result).toContain('"name"');
  });

  it("highlights a key-value pair with number value", () => {
    const result = hlJsonLine('  "count": 42');
    expect(result).toContain('class="hl-jkey"');
    expect(result).toContain('class="hl-jnum"');
  });

  it("highlights a key-value pair with boolean value", () => {
    const result = hlJsonLine('  "active": true');
    expect(result).toContain('class="hl-jbool"');
  });

  it("highlights a standalone string value", () => {
    const result = hlJsonLine('  "hello"');
    expect(result).toContain('class="hl-jstr"');
  });

  it("handles trailing commas", () => {
    const result = hlJsonLine('  "name": "test",');
    expect(result).toContain(",");
    expect(result).toContain('class="hl-jstr"');
  });

  it("returns escaped plain text for non-JSON lines", () => {
    expect(hlJsonLine("{")).toBe("{");
    expect(hlJsonLine("}")).toBe("}");
  });
});

describe("hlJsonValue", () => {
  it("wraps long strings in a collapsible details element", () => {
    const longStr = '"' + "x".repeat(250) + '"';
    const result = hlJsonValue(longStr);
    expect(result).toContain("jval-long");
    expect(result).toContain("<details");
    expect(result).toContain("<summary>");
    expect(result).toContain("\u2026"); // ellipsis in preview
  });

  it("does not collapse short strings", () => {
    const result = hlJsonValue('"short"');
    expect(result).not.toContain("jval-long");
    expect(result).toContain('class="hl-jstr"');
  });

  it("handles trailing comma on long strings", () => {
    const longStr = '"' + "x".repeat(250) + '",';
    const result = hlJsonValue(longStr);
    expect(result).toContain("jval-long");
    expect(result.endsWith(",")).toBe(true);
  });

  it("highlights null", () => {
    expect(hlJsonValue("null")).toContain('class="hl-jbool"');
  });
});

describe("highlightJson", () => {
  it("highlights a complete JSON object", () => {
    const json = `{
  "name": "test",
  "count": 42
}`;
    const result = highlightJson(json);
    expect(result).toContain('class="hl-jkey"');
    expect(result).toContain('class="hl-jstr"');
    expect(result).toContain('class="hl-jnum"');
  });

  it("handles empty string", () => {
    expect(highlightJson("")).toBe("");
  });
});
