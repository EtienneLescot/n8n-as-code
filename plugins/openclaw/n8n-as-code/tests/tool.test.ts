import { describe, expect, it } from "vitest";
import { splitArgv } from "../src/tool.js";

describe("splitArgv", () => {
  it("splits plain arguments", () => {
    expect(splitArgv("search telegram")).toEqual(["search", "telegram"]);
  });

  it("preserves quoted values with spaces", () => {
    expect(splitArgv("examples search \"slack notification\"")).toEqual([
      "examples",
      "search",
      "slack notification",
    ]);
    expect(splitArgv("docs 'Google Sheets'" )).toEqual(["docs", "Google Sheets"]);
  });

  it("handles escaped whitespace outside single quotes", () => {
    expect(splitArgv("node-info google\\ sheets")).toEqual(["node-info", "google sheets"]);
  });

  it("returns null on unterminated quotes", () => {
    expect(splitArgv("examples \"unterminated")).toBeNull();
  });
});
