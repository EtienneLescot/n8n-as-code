import * as vscode from 'vscode';
import { WorkflowSyncStatus } from '@n8n-as-code/core';

/**
 * Provides file decorations for workflow items in the tree view
 * This adds visual colorization and text decorations based on workflow status
 */
export class WorkflowDecorationProvider implements vscode.FileDecorationProvider {
  private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  /**
   * Trigger a refresh of all decorations
   */
  refresh(): void {
    this._onDidChangeFileDecorations.fire(undefined);
  }

  /**
   * Provide decoration for a given URI
   * URIs are in the format: n8n-workflow://<workflowId>?status=<status>&pendingAction=<action>
   */
  provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
    if (uri.scheme !== 'n8n-workflow') {
      return undefined;
    }

    const params = new URLSearchParams(uri.query);
    const status = params.get('status') as WorkflowSyncStatus | null;
    const pendingAction = params.get('pendingAction');

    // Handle pending actions first (highest priority)
    if (pendingAction === 'delete') {
      return {
        color: new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
        tooltip: 'Pending Deletion'
      };
    }

    if (pendingAction === 'conflict' || status === WorkflowSyncStatus.CONFLICT) {
      return {
        color: new vscode.ThemeColor('errorForeground'),
        tooltip: 'Conflict - Resolve Required'
      };
    }

    // Handle status-based decorations
    switch (status) {
      case WorkflowSyncStatus.IN_SYNC:
        return {
          color: new vscode.ThemeColor('gitDecoration.untrackedResourceForeground'),
          tooltip: 'In Sync'
        };

      case WorkflowSyncStatus.MODIFIED_LOCALLY:
        return {
          color: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
          tooltip: 'Modified Locally'
        };

      case WorkflowSyncStatus.MODIFIED_REMOTELY:
        return {
          color: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
          tooltip: 'Modified Remotely'
        };

      case WorkflowSyncStatus.EXIST_ONLY_REMOTELY:
        return {
          color: new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
          tooltip: 'Remote Only'
        };

      case WorkflowSyncStatus.EXIST_ONLY_LOCALLY:
        return {
          color: new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
          tooltip: 'Local Only'
        };

      case WorkflowSyncStatus.DELETED_LOCALLY:
      case WorkflowSyncStatus.DELETED_REMOTELY:
        return {
          color: new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
          tooltip: 'Deleted'
        };

      default:
        return undefined;
    }
  }

  dispose(): void {
    this._onDidChangeFileDecorations.dispose();
  }
}
