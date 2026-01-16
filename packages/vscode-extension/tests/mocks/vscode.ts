// Mock vscode module for unit tests
export const TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2
};

export class TreeItem {
    constructor(public label: string, public collapsibleState?: number) {}
}

export class EventEmitter {
    fire() {}
}

export class ThemeIcon {
    constructor(public id: string, public color?: any) {}
}

export class ThemeColor {
    constructor(public id: string) {}
}

export const window = {
    createOutputChannel: () => ({
        appendLine: () => {},
        show: () => {}
    })
};

export const commands = {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: async () => {}
};

export const workspace = {
    getConfiguration: () => ({
        get: () => undefined
    })
};

export class Uri {
    static parse(uri: string) {
        return { toString: () => uri };
    }
}

// Export as default for CommonJS compatibility
export default {
    TreeItemCollapsibleState,
    TreeItem,
    EventEmitter,
    ThemeIcon,
    ThemeColor,
    window,
    commands,
    workspace,
    Uri
};
