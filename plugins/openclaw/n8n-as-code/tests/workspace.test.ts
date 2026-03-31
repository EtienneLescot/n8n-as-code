import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isWorkspaceInitialized, readWorkspaceBinding } from "../src/workspace.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

function createWorkspaceDir(): string {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "n8nac-openclaw-"));
  tempDirs.push(workspaceDir);
  return workspaceDir;
}

function writeConfig(workspaceDir: string, value: unknown): void {
  fs.writeFileSync(path.join(workspaceDir, "n8nac-config.json"), JSON.stringify(value, null, 2));
}

describe("isWorkspaceInitialized", () => {
  it("returns true when project metadata and sync folder are present", () => {
    const workspaceDir = createWorkspaceDir();
    writeConfig(workspaceDir, {
      projectId: "proj_123",
      projectName: "My Project",
      syncFolder: "workflows",
    });

    expect(isWorkspaceInitialized(workspaceDir)).toBe(true);
  });

  it("returns true when the active instance is resolved from the instances library", () => {
    const workspaceDir = createWorkspaceDir();
    writeConfig(workspaceDir, {
      version: 2,
      activeInstanceId: "prod",
      instances: [
        {
          id: "test",
          name: "Test",
          host: "https://test.example.com",
          syncFolder: "workflows-test",
          projectId: "proj_test",
          projectName: "Test Project",
        },
        {
          id: "prod",
          name: "Production",
          host: "https://prod.example.com",
          syncFolder: "workflows-prod",
          projectId: "proj_prod",
          projectName: "Production Project",
        },
      ],
    });

    expect(isWorkspaceInitialized(workspaceDir)).toBe(true);
    expect(readWorkspaceBinding(workspaceDir)).toMatchObject({
      activeInstanceId: "prod",
      activeInstanceName: "Production",
      host: "https://prod.example.com",
      projectId: "proj_prod",
      projectName: "Production Project",
      syncFolder: "workflows-prod",
    });
  });

  it("returns false when config is missing required values", () => {
    const workspaceDir = createWorkspaceDir();
    writeConfig(workspaceDir, {
      projectId: "proj_123",
      syncFolder: "workflows",
    });

    expect(isWorkspaceInitialized(workspaceDir)).toBe(false);
  });

  it("returns false when config is malformed", () => {
    const workspaceDir = createWorkspaceDir();
    fs.writeFileSync(path.join(workspaceDir, "n8nac-config.json"), "{not-json");

    expect(isWorkspaceInitialized(workspaceDir)).toBe(false);
  });
});
