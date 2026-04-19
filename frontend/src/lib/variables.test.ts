import { describe, it, expect } from "vitest";
import {
  parseVariableDecls,
  buildVarMap,
  resolveVariables,
  type ResponseCapture,
} from "./variables";

describe("parseVariableDecls", () => {
  it("parses simple variable declarations", () => {
    const decls = parseVariableDecls("@baseUrl = http://localhost:8080\n@email = test@example.com");
    expect(decls).toHaveLength(2);
    expect(decls[0]).toEqual({ name: "baseUrl", template: "http://localhost:8080" });
    expect(decls[1]).toEqual({ name: "email", template: "test@example.com" });
  });

  it("parses declarations that reference other variables", () => {
    const decls = parseVariableDecls("@accessToken = {{verify.response.body.access_token}}");
    expect(decls).toHaveLength(1);
    expect(decls[0]).toEqual({ name: "accessToken", template: "{{verify.response.body.access_token}}" });
  });

  it("ignores non-declaration lines", () => {
    const content = `### Some request
GET https://example.com
# a comment
@myVar = hello`;
    const decls = parseVariableDecls(content);
    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe("myVar");
  });

  it("handles empty content", () => {
    expect(parseVariableDecls("")).toHaveLength(0);
  });
});

describe("buildVarMap", () => {
  const emptyResponses = new Map<string, ResponseCapture>();

  it("resolves static variables", () => {
    const decls = parseVariableDecls("@base = http://localhost:8080\n@path = /api");
    const vars = buildVarMap(decls, emptyResponses);
    expect(vars.get("base")).toBe("http://localhost:8080");
    expect(vars.get("path")).toBe("/api");
  });

  it("resolves variables that reference earlier variables", () => {
    const decls = parseVariableDecls("@host = localhost\n@baseUrl = http://{{host}}:8080");
    const vars = buildVarMap(decls, emptyResponses);
    expect(vars.get("baseUrl")).toBe("http://localhost:8080");
  });

  it("resolves response body variables", () => {
    const responses = new Map<string, ResponseCapture>([
      ["verify", {
        body: '{"access_token":"tok123","refresh_token":"ref456"}',
        parsedBody: { access_token: "tok123", refresh_token: "ref456" },
        headers: {},
        status: 200,
      }],
    ]);
    const decls = parseVariableDecls("@accessToken = {{verify.response.body.access_token}}");
    const vars = buildVarMap(decls, responses);
    expect(vars.get("accessToken")).toBe("tok123");
  });

  it("resolves nested response body paths", () => {
    const responses = new Map<string, ResponseCapture>([
      ["login", {
        body: "{}",
        parsedBody: { user: { id: "u42" } },
        headers: {},
        status: 200,
      }],
    ]);
    const decls = parseVariableDecls("@userId = {{login.response.body.user.id}}");
    const vars = buildVarMap(decls, responses);
    expect(vars.get("userId")).toBe("u42");
  });

  it("leaves unresolvable references as-is", () => {
    const decls = parseVariableDecls("@tok = {{missing.response.body.token}}");
    const vars = buildVarMap(decls, emptyResponses);
    expect(vars.get("tok")).toBe("{{missing.response.body.token}}");
  });
});

describe("resolveVariables", () => {
  it("substitutes known variables", () => {
    const vars = new Map([["baseUrl", "http://localhost:8080"]]);
    expect(resolveVariables("{{baseUrl}}/api", vars)).toBe("http://localhost:8080/api");
  });

  it("leaves unknown variables untouched", () => {
    const vars = new Map<string, string>();
    expect(resolveVariables("{{unknown}}/path", vars)).toBe("{{unknown}}/path");
  });

  it("substitutes multiple variables in one string", () => {
    const vars = new Map([["host", "localhost"], ["port", "8080"]]);
    expect(resolveVariables("http://{{host}}:{{port}}/api", vars)).toBe("http://localhost:8080/api");
  });

  it("handles text without variables", () => {
    const vars = new Map([["x", "y"]]);
    expect(resolveVariables("plain text", vars)).toBe("plain text");
  });
});
