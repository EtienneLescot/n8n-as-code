import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type WorkspaceBinding = {
  activeEnvironmentId?: string;
  environmentId?: string;
  environmentName?: string;
  workflowsPath?: string;
  projectId?: string;
  projectName?: string;
};

/**
 * Fixed context-root directory for n8n-as-code.
 * All n8nac context files (n8nac-config.json, AGENTS.md, .agents/skills, workflows/) live here.
 * Runtime access is resolved through V4 workspace environments.
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
    if (config.version !== 4) return {};
    const environments = Array.isArray(config.environments) ? config.environments as Array<Record<string, unknown>> : [];
    const activeEnvironmentId = readString(config.activeEnvironmentId);
    const environment = activeEnvironmentId
      ? environments.find((item) => readString(item.id) === activeEnvironmentId)
      : environments[0];
    if (!environment) return { activeEnvironmentId: activeEnvironmentId || undefined };

    return {
      activeEnvironmentId: activeEnvironmentId || undefined,
      environmentId: readString(environment.id) || undefined,
      environmentName: readString(environment.name) || undefined,
      workflowsPath: readString(environment.workflowsPath) || undefined,
      projectId: readString(environment.projectId) || undefined,
      projectName: readString(environment.projectName) || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Returns true when n8nac has been initialized in the given directory,
 * meaning the config exists and contains an active V4 environment with workflowsPath.
 */
export function isWorkspaceInitialized(workspaceDir: string): boolean {
  const binding = readWorkspaceBinding(workspaceDir);
  return Boolean(binding.environmentId && binding.workflowsPath);
}
