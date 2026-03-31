import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigService } from 'n8nac';
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

function getSettingsValue(key: 'host' | 'apiKey' | 'syncFolder' | 'projectId' | 'projectName'): string {
  return readString(vscode.workspace.getConfiguration('n8n').get<string>(key));
}

function getEnvValue(key: 'N8N_HOST' | 'N8N_API_KEY'): string {
  return readString(process.env[key]).replace(/^['"]|['"]$/g, '');
}

export function getResolvedN8nConfig(workspaceRoot = getWorkspaceRoot()): ResolvedN8nWorkspaceConfig {
  const unified = workspaceRoot ? readUnifiedWorkspaceConfig(workspaceRoot) : undefined;
  const configService = workspaceRoot ? new ConfigService(workspaceRoot) : undefined;
  const activeInstance = workspaceRoot && configService ? configService.getActiveInstance() : undefined;
  const host = normalizeHost(
    readString(unified?.host) || getSettingsValue('host') || getEnvValue('N8N_HOST')
  );
  const apiKey = (host && configService ? configService.getApiKey(host, activeInstance?.id) : undefined)
    || getSettingsValue('apiKey')
    || getEnvValue('N8N_API_KEY');

  return {
    host,
    apiKey,
    syncFolder: readString(unified?.syncFolder) || getSettingsValue('syncFolder') || 'workflows',
    projectId: readString(unified?.projectId) || getSettingsValue('projectId'),
    projectName: readString(unified?.projectName) || getSettingsValue('projectName'),
    activeInstanceId: readString(unified?.activeInstanceId) || activeInstance?.id || '',
    activeInstanceName: activeInstance?.name || '',
  };
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
    missing.push('n8n.host');
  }

  if (!apiKey || apiKey.trim() === '') {
    missing.push('n8n.apiKey');
  }

  return {
    isValid: missing.length === 0,
    missing,
    error: missing.length > 0 ? `Missing configuration: ${missing.join(', ')}` : undefined
  };
}

/**
 * Check if a workspace folder was previously initialized with n8n-as-code
 * Checks for both n8nac-instance.json (new) and n8n-as-code-instance.json (legacy)
 */
export function isFolderPreviouslyInitialized(workspaceRoot: string): boolean {
  if (!workspaceRoot) {
    return false;
  }

  return !!readUnifiedWorkspaceConfig(workspaceRoot).instanceIdentifier;
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
  
  return path.join(workspaceRoot, folder);
}

/**
 * Check if sync directory exists
 */
export function doesSyncDirectoryExist(): boolean {
  const syncDir = getSyncDirectoryPath();
  return syncDir ? fs.existsSync(syncDir) : false;
}

/**
 * Get instance identifier from existing configuration
 * Checks for both n8nac-instance.json (new) and n8n-as-code-instance.json (legacy)
 */
export function getExistingInstanceIdentifier(workspaceRoot: string): string | undefined {
  return readUnifiedWorkspaceConfig(workspaceRoot).instanceIdentifier;
}
