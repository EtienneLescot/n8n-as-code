import * as vscode from 'vscode';

export class StatusBar {
    private item: vscode.StatusBarItem;

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.item.command = 'n8n.pull';
    }

    showSyncing() {
        this.item.text = '$(sync~spin) n8n';
        this.item.tooltip = 'Syncing...';
        this.item.show();
    }

    showSynced() {
        this.item.text = '$(check) n8n';
        this.item.tooltip = 'Workflows Synced';
        this.item.show();

        setTimeout(() => {
            this.item.text = 'n8n'; // Revert to neutral state
        }, 3000);
    }

    showError(msg: string) {
        this.item.text = '$(error) n8n';
        this.item.tooltip = msg;
        this.item.show();
    }

    setWatchMode(active: boolean) {
        if (active) {
            this.item.text = '$(eye) n8n (Watch)';
            this.item.tooltip = 'n8n: Watch Mode Active (Auto-sync)';
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.item.text = 'n8n';
            this.item.tooltip = 'n8n: Manual Mode';
            this.item.backgroundColor = undefined;
        }
        this.item.show();
    }
}
