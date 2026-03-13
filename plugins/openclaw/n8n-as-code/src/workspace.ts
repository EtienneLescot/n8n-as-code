import { existsSync } from "node:fs";
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
 * meaning `n8nac-config.json` is present.
 */
export function isWorkspaceInitialized(workspaceDir: string): boolean {
  return existsSync(join(workspaceDir, "n8nac-config.json"));
}
