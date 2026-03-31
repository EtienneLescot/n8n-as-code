import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPromptContext } from "../index.js";

function createWorkspaceDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "n8nac-openclaw-prompt-"));
}

function writeConfig(workspaceDir: string, value: unknown): void {
  fs.writeFileSync(path.join(workspaceDir, "n8nac-config.json"), JSON.stringify(value, null, 2));
}

describe("buildPromptContext", () => {
  it("keeps bootstrap guidance for uninitialized workspaces", () => {
    const workspaceDir = createWorkspaceDir();
    try {
      expect(buildPromptContext(workspaceDir)).toContain("n8n-as-code — Bootstrap");
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("keeps initialized context lightweight and does not inline AGENTS.md", () => {
    const workspaceDir = createWorkspaceDir();
    try {
      writeConfig(workspaceDir, {
        version: 2,
        activeInstanceId: "prod",
        instances: [
          {
            id: "prod",
            name: "Production",
            host: "https://n8n.example.com",
            projectId: "proj_123",
            projectName: "My Project",
            syncFolder: "workflows",
          },
        ],
      });
      fs.writeFileSync(path.join(workspaceDir, "AGENTS.md"), "# Heavy Context\nDO NOT INLINE ME");

      const context = buildPromptContext(workspaceDir);

      expect(context).toContain("n8n-architect");
      expect(context).toContain("Active instance");
      expect(context).toContain("Production");
      expect(context).toContain("For unrelated requests, ignore this plugin context.");
      expect(context).toContain(path.join(workspaceDir, "AGENTS.md"));
      expect(context).not.toContain("DO NOT INLINE ME");
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("tells the agent how to recover when AGENTS.md is missing", () => {
    const workspaceDir = createWorkspaceDir();
    try {
      writeConfig(workspaceDir, {
        version: 2,
        activeInstanceId: "prod",
        instances: [
          {
            id: "prod",
            name: "Production",
            host: "https://n8n.example.com",
            projectId: "proj_123",
            projectName: "My Project",
            syncFolder: "workflows",
          },
        ],
      });

      const context = buildPromptContext(workspaceDir);

      expect(context).toContain("update-ai");
      expect(context).toContain("AGENTS.md");
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
