import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Fixed workspace directory for V1.
 * All n8nac files (n8nac-config.json, AGENTS.md, workflows/) live here.
 */
export function getWorkspaceDir(): string {
  return join(homedir(), ".openclaw", "n8nac");
}

/**
 * Returns true when n8nac has been initialized in the given directory,
 * meaning the config exists and contains a selected project + sync folder.
 */
export function isWorkspaceInitialized(workspaceDir: string): boolean {
  const configPath = join(workspaceDir, "n8nac-config.json");
  if (!existsSync(configPath)) return false;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    const projectId = typeof config.projectId === "string" ? config.projectId.trim() : "";
    const projectName = typeof config.projectName === "string" ? config.projectName.trim() : "";
    const syncFolder = typeof config.syncFolder === "string" ? config.syncFolder.trim() : "";
    return projectId.length > 0 && projectName.length > 0 && syncFolder.length > 0;
  } catch {
    return false;
  }
}
