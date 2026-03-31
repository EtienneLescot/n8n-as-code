import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type WorkspaceBinding = {
  host?: string;
  projectId?: string;
  projectName?: string;
  syncFolder?: string;
  activeInstanceId?: string;
  activeInstanceName?: string;
};

/**
 * Fixed workspace directory for V1.
 * All n8nac files (n8nac-config.json, AGENTS.md, workflows/) live here.
 */
export function getWorkspaceDir(): string {
  return join(homedir(), ".openclaw", "n8nac");
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveActiveInstance(config: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!Array.isArray(config.instances)) {
    return undefined;
  }

  const instances = config.instances.filter((value): value is Record<string, unknown> => !!value && typeof value === "object");
  if (!instances.length) {
    return undefined;
  }

  const activeInstanceId = readString(config.activeInstanceId);
  if (activeInstanceId) {
    return instances.find((instance) => readString(instance.id) === activeInstanceId) || instances[0];
  }

  return instances[0];
}

export function readWorkspaceBinding(workspaceDir: string): WorkspaceBinding {
  const configPath = join(workspaceDir, "n8nac-config.json");
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    const activeInstance = resolveActiveInstance(config);
    const configActiveInstanceId = readString(config.activeInstanceId);
    const resolvedActiveInstanceId = readString(activeInstance?.id);
    const activeInstanceId =
      resolvedActiveInstanceId && resolvedActiveInstanceId === configActiveInstanceId
        ? configActiveInstanceId
        : resolvedActiveInstanceId || undefined;

    return {
      host: readString(activeInstance?.host) || readString(config.host) || undefined,
      projectId: readString(activeInstance?.projectId) || readString(config.projectId) || undefined,
      projectName: readString(activeInstance?.projectName) || readString(config.projectName) || undefined,
      syncFolder: readString(activeInstance?.syncFolder) || readString(config.syncFolder) || undefined,
      activeInstanceId,
      activeInstanceName: readString(activeInstance?.name) || undefined,
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
