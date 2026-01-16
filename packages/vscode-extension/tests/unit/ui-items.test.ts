import test from 'node:test';
import assert from 'node:assert';
import { WorkflowSyncStatus } from '@n8n-as-code/core';

// Mock vscode directly in the test file
const mockVscode = {
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2
    },
    TreeItem: class {
        constructor(public label: string, public collapsibleState?: number) {}
    },
    ThemeIcon: class {
        constructor(public id: string, public color?: any) {}
    },
    ThemeColor: class {
        constructor(public id: string) {}
    },
    Uri: class {
        static parse(uri: string) {
            return { toString: () => uri };
        }
    }
};

// Override require to return our mock
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id: string) {
    if (id === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};

// Now import the component
import { WorkflowItem } from '../../src/ui/tree-items/workflow-item.js';

test('Extension UI: WorkflowItem Logic', async (t) => {
    await t.test('WorkflowItem should be collapsible if it has pending actions', () => {
        const wf = { id: '1', name: 'Test', filename: 'Test.json', status: WorkflowSyncStatus.CONFLICT, active: true };
        
        // Test Conflict state
        const itemConflict = new WorkflowItem(wf, 'conflict');
        assert.strictEqual(itemConflict.collapsibleState, 1, 'Should be Collapsed (1) for conflict');
        
        // Test Synced state
        const wfSynced = { ...wf, status: WorkflowSyncStatus.IN_SYNC };
        const itemSynced = new WorkflowItem(wfSynced);
        assert.strictEqual(itemSynced.collapsibleState, 0, 'Should be None (0) for synced');
    });

    await t.test('WorkflowItem contextValue should reflect status for menu visibility', () => {
        const wf = { id: '1', name: 'Test', filename: 'Test.json', status: WorkflowSyncStatus.MODIFIED_LOCALLY, active: true };
        const item = new WorkflowItem(wf);
        
        assert.strictEqual(item.contextValue, 'workflow-modified-local');
    });
});
