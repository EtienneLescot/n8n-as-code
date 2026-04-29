import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type WorkspaceBinding = {
  projectId?: string;
  projectName?: string;
  syncFolder?: string;
  activeInstanceId?: string;
};

/**
 * Fixed context-root directory for V1.
 * All n8nac context files (n8nac-config.json, AGENTS.md, .agents/skills, workflows/) live here.
 * n8n instances and credentials are stored globally by n8n-manager.
 */
export function getWorkspaceDir(): string {
  return join(homedir(), ".openclaw", "n8nac");
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readWorkspaceBinding(workspaceDir: string): WorkspaceBinding {
  const configPath = join(workspaceDir, "n8nac-config.json");
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;

    return {
      projectId: readString(config.projectId) || undefined,
      projectName: readString(config.projectName) || undefined,
      syncFolder: readString(config.syncFolder) || undefined,
      activeInstanceId: readString(config.activeInstanceId) || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Returns true when n8nac has been initialized in the given directory,
 * meaning the config exists and contains a selected project + sync folder.
 */
export function isWorkspaceInitialized(workspaceDir: string): boolean {
  const binding = readWorkspaceBinding(workspaceDir);
  return Boolean(binding.projectId && binding.projectName && binding.syncFolder);
}
