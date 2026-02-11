import { describe, it, expect } from "vitest";
import { parseHttpFile, findRequestAtLine } from "./parser";

describe("parseHttpFile", () => {
  it("parses a simple GET request", () => {
    const blocks = parseHttpFile("GET https://example.com/api");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].method).toBe("GET");
    expect(blocks[0].url).toBe("https://example.com/api");
    expect(blocks[0].body).toBe("");
    expect(blocks[0].methodLine).toBe(0);
  });

  it("parses a POST with headers and body", () => {
    const input = `POST https://example.com/api
Content-Type: application/json

{
  "name": "test"
}`;
    const blocks = parseHttpFile(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].method).toBe("POST");
    expect(blocks[0].url).toBe("https://example.com/api");
    expect(blocks[0].headers).toEqual({ "Content-Type": "application/json" });
    expect(blocks[0].body).toBe('{\n  "name": "test"\n}');
  });

  it("parses multiple requests separated by ###", () => {
    const input = `### First
GET https://example.com/one

### Second
POST https://example.com/two
Content-Type: application/json

{"key": "value"}`;
    const blocks = parseHttpFile(input);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].method).toBe("GET");
    expect(blocks[0].url).toBe("https://example.com/one");
    expect(blocks[1].method).toBe("POST");
    expect(blocks[1].url).toBe("https://example.com/two");
    expect(blocks[1].body).toBe('{"key": "value"}');
  });

  it("handles bare URLs as GET", () => {
    const blocks = parseHttpFile("https://httpbin.org/get");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].method).toBe("GET");
    expect(blocks[0].url).toBe("https://httpbin.org/get");
  });

  it("ignores comment lines", () => {
    const input = `# This is a comment
// Another comment
GET https://example.com/api`;
    const blocks = parseHttpFile(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].method).toBe("GET");
  });

  it("parses multiple headers", () => {
    const input = `GET https://example.com/api
Authorization: Bearer token123
Accept: application/json`;
    const blocks = parseHttpFile(input);
    expect(blocks[0].headers).toEqual({
      Authorization: "Bearer token123",
      Accept: "application/json",
    });
  });

  it("handles empty input", () => {
    expect(parseHttpFile("")).toHaveLength(0);
  });

  it("handles all HTTP methods", () => {
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
    for (const method of methods) {
      const blocks = parseHttpFile(`${method} https://example.com/api`);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].method).toBe(method);
    }
  });

  it("tracks correct line numbers", () => {
    const input = `### First
GET https://example.com/one

### Second
POST https://example.com/two`;
    const blocks = parseHttpFile(input);
    expect(blocks[0].methodLine).toBe(1);
    expect(blocks[0].startLine).toBe(0);
    expect(blocks[1].methodLine).toBe(4);
    expect(blocks[1].startLine).toBe(3);
  });
});

describe("findRequestAtLine", () => {
  const blocks = parseHttpFile(`### First
GET https://example.com/one

### Second
POST https://example.com/two
Content-Type: application/json

{"key": "value"}`);

  it("finds block at method line", () => {
    const block = findRequestAtLine(blocks, 1);
    expect(block?.method).toBe("GET");
  });

  it("finds block at body line", () => {
    const block = findRequestAtLine(blocks, 7);
    expect(block?.method).toBe("POST");
  });

  it("finds block at separator line", () => {
    const block = findRequestAtLine(blocks, 0);
    expect(block?.method).toBe("GET");
  });

  it("returns null for line outside blocks", () => {
    const block = findRequestAtLine(blocks, 99);
    expect(block).toBeNull();
  });
});
