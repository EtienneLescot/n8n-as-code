import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigValidationResult } from '../types.js';

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
 * Get normalized n8n configuration from settings
 */
export function getN8nConfig(): { host: string; apiKey: string } {
  const config = vscode.workspace.getConfiguration('n8n');
  let host = config.get<string>('host') || process.env.N8N_HOST || '';
  const apiKey = config.get<string>('apiKey') || process.env.N8N_API_KEY || '';

  // Normalize: remove trailing slash
  if (host.endsWith('/')) {
    host = host.slice(0, -1);
  }

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

  // Check for new file name first, then legacy
  const instanceConfigPaths = [
    path.join(workspaceRoot, 'n8nac-instance.json')
  ];
  
  for (const instanceConfigPath of instanceConfigPaths) {
    if (fs.existsSync(instanceConfigPath)) {
      try {
        const content = fs.readFileSync(instanceConfigPath, 'utf-8');
        const json = JSON.parse(content);
        return !!json.instanceIdentifier;
      } catch {
        // Continue to next file if this one fails to parse
        continue;
      }
    }
  }

  return false;
}

/**
 * Check for existing AI context files
 */
export function hasAIContextFiles(workspaceRoot: string): boolean {
  if (!workspaceRoot) {
    return false;
  }

  const aiFiles = [
    path.join(workspaceRoot, 'AGENTS.md'),
    path.join(workspaceRoot, '.vscode', 'n8n.code-snippets')
  ];

  return aiFiles.every(f => fs.existsSync(f));
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

  const config = vscode.workspace.getConfiguration('n8n');
  const folder = config.get<string>('syncFolder') || 'workflows';
  
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
  const instanceConfigPaths = [
    path.join(workspaceRoot, 'n8nac-instance.json'),
    path.join(workspaceRoot, 'n8n-as-code-instance.json')
  ];
  
  for (const instanceConfigPath of instanceConfigPaths) {
    if (fs.existsSync(instanceConfigPath)) {
      try {
        const content = fs.readFileSync(instanceConfigPath, 'utf-8');
        const config = JSON.parse(content);
        return config.instanceIdentifier;
      } catch {
        // Continue to next file if this one fails to parse
        continue;
      }
    }
  }
  
  return undefined;
}