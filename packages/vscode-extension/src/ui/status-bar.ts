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

    // New methods for initialization state management
    hide() {
        this.item.hide();
    }

    showLoading(message: string = 'Initializing...') {
        this.item.text = `$(loading~spin) ${message}`;
        this.item.tooltip = message;
        this.item.show();
    }

    showNotInitialized() {
        this.item.text = '$(info) n8n: Not initialized';
        this.item.tooltip = 'Click to initialize n8n as code';
        this.item.command = 'n8n.init';
        this.item.show();
    }

    showConfiguring() {
        this.item.text = '$(settings) n8n: Configure';
        this.item.tooltip = 'Configure n8n settings to continue';
        this.item.command = 'n8n.openSettings';
        this.item.show();
    }
}
