import { describe, it, expect } from "vitest";
import { computeHighlightRanges } from "./httpHighlight";

function classesAt(content: string) {
  const ranges = computeHighlightRanges({ toString: () => content });
  return ranges.map((r) => ({
    text: content.slice(r.from, r.to),
    class: (r.deco.spec as { class: string }).class,
  }));
}

describe("computeHighlightRanges", () => {
  it("highlights a separator line", () => {
    const found = classesAt("### Simple GET");
    expect(found).toContainEqual({ text: "### Simple GET", class: "hl-sep" });
  });

  it("highlights a comment line", () => {
    const found = classesAt("# a comment");
    expect(found).toContainEqual({ text: "# a comment", class: "hl-cmt" });
  });

  it("highlights a method line's method and url separately", () => {
    const found = classesAt("GET https://example.com/get");
    expect(found).toContainEqual({ text: "GET", class: "hl-method" });
    expect(found).toContainEqual({ text: "https://example.com/get", class: "hl-url" });
  });

  it("highlights a header line's key, colon, and value", () => {
    const content = "GET https://example.com/get\nContent-Type: application/json";
    const found = classesAt(content);
    expect(found).toContainEqual({ text: "Content-Type", class: "hl-hkey" });
    expect(found).toContainEqual({ text: ":", class: "hl-punct" });
    expect(found).toContainEqual({ text: " application/json", class: "hl-hval" });
  });

  it("highlights a JSON body key/value pair", () => {
    const content = 'POST https://example.com/post\n\n{\n  "name": "test"\n}';
    const found = classesAt(content);
    expect(found).toContainEqual({ text: '"name"', class: "hl-jkey" });
    expect(found).toContainEqual({ text: '"test"', class: "hl-jstr" });
  });

  it("highlights a JSON body number and boolean values", () => {
    const content = 'POST https://example.com/post\n\n{\n  "count": 42,\n  "active": true\n}';
    const found = classesAt(content);
    expect(found).toContainEqual({ text: "42", class: "hl-jnum" });
    expect(found).toContainEqual({ text: "true", class: "hl-jbool" });
  });

  it("highlights a variable declaration name and value", () => {
    const found = classesAt("@baseUrl = https://example.com");
    expect(found).toContainEqual({ text: "@baseUrl", class: "hl-var-name" });
    expect(found).toContainEqual({ text: "https://example.com", class: "hl-var-val" });
  });

  it("highlights {{var}} references inside a url", () => {
    const found = classesAt("GET {{baseUrl}}/get");
    expect(found).toContainEqual({ text: "{{baseUrl}}", class: "hl-var-ref" });
  });

  it("highlights {{var}} references inside a JSON body value", () => {
    const content = 'POST https://example.com/post\n\n{\n  "name": "{{name}}"\n}';
    const found = classesAt(content);
    expect(found).toContainEqual({ text: "{{name}}", class: "hl-var-ref" });
  });
});
