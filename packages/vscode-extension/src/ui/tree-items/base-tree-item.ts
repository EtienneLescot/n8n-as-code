import * as vscode from 'vscode';
import { TreeItemType } from '../../types.js';

/**
 * Base class for all tree items in the enhanced workflow tree provider
 */
export abstract class BaseTreeItem extends vscode.TreeItem {
  abstract readonly type: TreeItemType;
  
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    super(label, collapsibleState);
  }
  
  /**
   * Get the context value for this item (used for when clauses in package.json)
   */
  getContextValue(): string {
    return this.type;
  }
  
  /**
   * Update the item based on current state
   */
  updateState(state: any): void {
    // Base implementation does nothing
    // Override in subclasses to update based on state changes
  }
}