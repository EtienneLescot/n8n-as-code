import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigService, isCanonicalUserInstanceIdentifier } from 'n8nac';
import { ConfigValidationResult } from '../types.js';
import { readUnifiedWorkspaceConfig } from './unified-config.js';

export interface ResolvedN8nWorkspaceConfig {
  host: string;
  apiKey: string;
  syncFolder: string;
  projectId: string;
  projectName: string;
  activeInstanceId: string;
  activeInstanceName: string;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeHost(host: string): string {
  const trimmed = readString(host).replace(/^['"]|['"]$/g, '');
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function getResolvedN8nConfig(workspaceRoot = getWorkspaceRoot()): ResolvedN8nWorkspaceConfig {
  if (!workspaceRoot) {
    return {
      host: '',
      apiKey: '',
      syncFolder: 'workflows',
      projectId: '',
      projectName: '',
      activeInstanceId: '',
      activeInstanceName: '',
    };
  }

  try {
    const configService = new ConfigService(workspaceRoot);
    const effective = configService.getEffectiveContext();
    const host = normalizeHost(readString(effective?.apiBaseUrl ?? effective?.host));

    return {
      host,
      apiKey: readString(effective?.apiKey),
      syncFolder: readString(effective?.syncFolder) || 'workflows',
      projectId: readString(effective?.projectId),
      projectName: readString(effective?.projectName),
      activeInstanceId: readString(effective?.activeInstanceId),
      activeInstanceName: readString(effective?.activeInstanceName),
    };
  } catch {
    const unified = readUnifiedWorkspaceConfig(workspaceRoot);
    return {
      host: normalizeHost(readString(unified.host)),
      apiKey: '',
      syncFolder: readString(unified.syncFolder) || 'workflows',
      projectId: readString(unified.projectId),
      projectName: readString(unified.projectName),
      activeInstanceId: readString(unified.activeInstanceId),
      activeInstanceName: '',
    };
  }
}

/**
 * Get the current workspace root path
 * Returns undefined if no workspace is open
 */
export function getWorkspaceRoot(): string | undefined {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return undefined;
  }
  return vscode.workspace.workspaceFolders[0].uri.fsPath;
}

/**
 * Get normalized n8n connection credentials.
 */
export function getN8nConfig(): { host: string; apiKey: string } {
  const { host, apiKey } = getResolvedN8nConfig();
  return { host, apiKey };
}

/**
 * Validate n8n configuration
 */
export function validateN8nConfig(): ConfigValidationResult {
  const { host, apiKey } = getN8nConfig();
  const missing: string[] = [];

  if (!host || host.trim() === '') {
    missing.push('host');
  }

  if (!apiKey || apiKey.trim() === '') {
    missing.push('apiKey');
  }

  return {
    isValid: missing.length === 0,
    missing,
    error: missing.length > 0 ? `Missing configuration: ${missing.join(', ')}` : undefined
  };
}

/**
 * Check if a workspace folder was initialized with a canonical n8n sync identity.
 */
export function isFolderPreviouslyInitialized(workspaceRoot: string): boolean {
  if (!workspaceRoot) {
    return false;
  }

  return isCanonicalUserInstanceIdentifier(readUnifiedWorkspaceConfig(workspaceRoot).instanceIdentifier);
}

/**
 * Check for existing AI context files
 */
export function hasAIContextFiles(workspaceRoot: string): boolean {
  if (!workspaceRoot) {
    return false;
  }

  return fs.existsSync(path.join(workspaceRoot, 'AGENTS.md'));
}

/**
 * Determine the initial extension state based on workspace and configuration
 */
export function determineInitialState(workspaceRoot?: string): {
  state: 'uninitialized' | 'configuring' | 'initialized';
  hasValidConfig: boolean;
  isPreviouslyInitialized: boolean;
} {
  const configValidation = validateN8nConfig();
  const hasValidConfig = configValidation.isValid;
  
  if (!workspaceRoot) {
    return {
      state: 'uninitialized',
      hasValidConfig: false,
      isPreviouslyInitialized: false
    };
  }

  if (!fs.existsSync(path.join(workspaceRoot, 'n8nac-config.json'))) {
    return {
      state: 'configuring',
      hasValidConfig: false,
      isPreviouslyInitialized: false
    };
  }

  const isPreviouslyInitialized = isFolderPreviouslyInitialized(workspaceRoot);

  if (isPreviouslyInitialized && hasValidConfig) {
    // Auto-load existing configuration
    return {
      state: 'initialized',
      hasValidConfig: true,
      isPreviouslyInitialized: true
    };
  } else if (!hasValidConfig) {
    // Configuration is incomplete
    return {
      state: 'configuring',
      hasValidConfig: false,
      isPreviouslyInitialized
    };
  } else {
    // Valid config but not previously initialized
    return {
      state: 'uninitialized',
      hasValidConfig: true,
      isPreviouslyInitialized: false
    };
  }
}

/**
 * Get sync directory path for the current workspace
 */
export function getSyncDirectoryPath(): string | undefined {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return undefined;
  }

  const folder = getResolvedN8nConfig(workspaceRoot).syncFolder;
  
  return path.isAbsolute(folder) ? folder : path.resolve(workspaceRoot, folder);
}

/**
 * Check if sync directory exists
 */
export function doesSyncDirectoryExist(): boolean {
  const syncDir = getSyncDirectoryPath();
  return syncDir ? fs.existsSync(syncDir) : false;
}

/**
 * Get the canonical instance identifier from existing configuration.
 */
export function getExistingInstanceIdentifier(workspaceRoot: string): string | undefined {
  const identifier = readUnifiedWorkspaceConfig(workspaceRoot).instanceIdentifier;
  return isCanonicalUserInstanceIdentifier(identifier) ? identifier : undefined;
}
