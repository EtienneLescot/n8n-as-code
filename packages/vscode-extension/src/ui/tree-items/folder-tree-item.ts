import * as vscode from 'vscode';
import { BaseTreeItem } from './base-tree-item.js';
import { TreeItemType } from '../../types.js';

export class FolderTreeItem extends BaseTreeItem {
    readonly type = TreeItemType.FOLDER;

    constructor(
        public readonly folderName: string,
        public readonly folderPath: string
    ) {
        super(folderName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'folder';
        this.tooltip = folderPath;
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}
