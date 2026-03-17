import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPromptContext } from "../index.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

function createWorkspaceDir(): string {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "n8nac-openclaw-prompt-"));
  tempDirs.push(workspaceDir);
  return workspaceDir;
}

function writeConfig(workspaceDir: string, value: unknown): void {
  fs.writeFileSync(path.join(workspaceDir, "n8nac-config.json"), JSON.stringify(value, null, 2));
}

describe("buildPromptContext", () => {
  it("keeps bootstrap guidance for uninitialized workspaces", () => {
    const workspaceDir = createWorkspaceDir();

    expect(buildPromptContext(workspaceDir)).toContain("n8n-as-code — Bootstrap");
  });

  it("keeps initialized context lightweight and does not inline AGENTS.md", () => {
    const workspaceDir = createWorkspaceDir();
    writeConfig(workspaceDir, {
      host: "https://n8n.example.com",
      projectId: "proj_123",
      projectName: "My Project",
      syncFolder: "workflows",
    });
    fs.writeFileSync(path.join(workspaceDir, "AGENTS.md"), "# Heavy Context\nDO NOT INLINE ME");

    const context = buildPromptContext(workspaceDir);

    expect(context).toContain("n8n-architect");
    expect(context).toContain("For unrelated requests, ignore this plugin context.");
    expect(context).toContain(path.join(workspaceDir, "AGENTS.md"));
    expect(context).not.toContain("DO NOT INLINE ME");
  });

  it("tells the agent how to recover when AGENTS.md is missing", () => {
    const workspaceDir = createWorkspaceDir();
    writeConfig(workspaceDir, {
      host: "https://n8n.example.com",
      projectId: "proj_123",
      projectName: "My Project",
      syncFolder: "workflows",
    });

    const context = buildPromptContext(workspaceDir);

    expect(context).toContain("update-ai");
    expect(context).toContain("AGENTS.md");
  });
});
