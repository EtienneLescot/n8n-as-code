import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getN8nManagerCommand, parseProjects } from "../src/cli.js";

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe("OpenClaw n8nac CLI helpers", () => {
  it("uses the published scoped n8n-manager package by default", () => {
    delete process.env.N8N_MANAGER_COMMAND;

    expect(getN8nManagerCommand()).toEqual({
      command: "npx",
      args: ["--yes", "@n8n-as-code/n8n-manager"],
    });
  });

  it("keeps supporting explicit n8n-manager command overrides", () => {
    process.env.N8N_MANAGER_COMMAND = "node /repo/n8n-manager/packages/cli/dist/index.js";

    expect(getN8nManagerCommand()).toEqual({
      command: "node",
      args: ["/repo/n8n-manager/packages/cli/dist/index.js"],
    });
  });

  it("parses n8n-manager project-list JSON", () => {
    expect(parseProjects('{"projects":[{"id":"project-main","name":"Main"}]}')).toEqual([
      { id: "project-main", name: "Main" },
    ]);
  });

  it("returns null instead of throwing for malformed project-list output", () => {
    expect(parseProjects("project-main  Main")).toBeNull();
  });
});
