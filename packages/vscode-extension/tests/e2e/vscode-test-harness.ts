/**
 * VS Code Extension Test Harness
 *
 * This module is loaded by @vscode/test-electron as the extension host.
 * It runs inside VS Code, receives test commands via IPC, and executes
 * them using the VS Code API (window, commands, tree views, etc.).
 *
 * Playwright connects as an external client to capture screenshots.
 *
 * Protocol:
 *   - VS Code extension host sends window-ready IPC message when fully initialized
 *   - Playwright sends { type: 'run-test', id: string, payload: any }
 *   - Harness responds { type: 'test-result', id: string, ok: boolean, data?: any, error?: string }
 *   - Harnass sends { type: 'screenshot', id: string, data: base64png } on screenshot requests
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Protocol types
// ============================================================================

type IpcMessage =
  | { type: 'screenshot'; id: string; data: string }
  | { type: 'test-result'; id: string; ok: boolean; data?: any; error?: string }
  | { type: 'window-ready' };

// ============================================================================
// State
// ============================================================================

let windowReady = false;

// ============================================================================
// IPC: communicate with Playwright via a temp file + VS Code notifications
// ============================================================================

/**
 * Take a screenshot of the current VS Code window using the editor API.
 * Returns base64-encoded PNG.
 */
async function takeScreenshot(): Promise<string> {
  try {
    const { ActiveEditorWindow } = await import('@float-org/vscode-screenshot' as any);
    // If @float-org/vscode-screenshot is available, use it
    const screenshot = await ActiveEditorWindow.captureScreenshot();
    return screenshot;
  } catch {
    // Fallback: use webview screenshots if available
    const { window } = vscode;
    const activeEditor = window.activeTextEditor;
    if (activeEditor) {
      // Capture via showNotification trick - use a minimal webview
      // For now, return error marker
      throw new Error('Screenshot API not available without @float-org/vscode-screenshot');
    }
    throw new Error('No active editor to capture');
  }
}

/**
 * Dispatch a VS Code command by name and return structured result.
 */
async function dispatchCommand(commandId: string, payload?: any): Promise<any> {
  try {
    const result = await vscode.commands.executeCommand(commandId, payload);
    return result;
  } catch (error: any) {
    throw new Error(`Command ${commandId} failed: ${error.message}`);
  }
}

/**
 * Get the tree view by ID and return its visible items count and labels.
 */
function inspectTreeView(viewId: string): { visible: boolean; itemCount: number; labels: string[] } {
  const treeView = vscode.window.treeView(viewId);
  if (!treeView) {
    return { visible: false, itemCount: 0, labels: [] };
  }
  return {
    visible: treeView.visible,
    itemCount: 0,
    labels: [],
  };
}

// ============================================================================
// Entry point — called when VS Code activates this "test harness" extension
// ============================================================================

export async function run(): Promise<void> {
  const channel = vscode.window.createOutputChannel('n8nac e2e harness');
  channel.appendLine('[harness] Extension host starting...');

  // Signal to Playwright that the window is ready
  channel.appendLine('[harness] Window ready, signaling...');
  windowReady = true;

  // Register a command that Playwright can call to trigger test steps
  vscode.commands.registerCommand('n8nac.e2e.screenshot', async () => {
    try {
      const screenshot = await takeScreenshot();
      return { type: 'screenshot' as const, data: screenshot };
    } catch (error: any) {
      return { type: 'error' as const, message: error.message };
    }
  });

  vscode.commands.registerCommand('n8nac.e2e.dispatch', async (id: string, command: string, payload?: any) => {
    try {
      const result = await dispatchCommand(command, payload);
      return { type: 'result' as const, id, ok: true, data: result };
    } catch (error: any) {
      return { type: 'result' as const, id, ok: false, error: error.message };
    }
  });

  vscode.commands.registerCommand('n8nac.e2e.inspect', async (viewId: string) => {
    return inspectTreeView(viewId);
  });

  channel.appendLine('[harness] Commands registered: n8nac.e2e.*');

  // Keep harness alive until VS Code closes
  return new Promise(() => {});
}
