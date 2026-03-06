import test from 'node:test';
import assert from 'node:assert';
import { NO_WORKSPACE_ERROR_MESSAGE, OPEN_FOLDER_ACTION } from '../../src/constants/workspace.js';

test('Workspace error messaging constants', async (t) => {
    await t.test('shows explicit no-workspace message', () => {
        assert.strictEqual(
            NO_WORKSPACE_ERROR_MESSAGE,
            'No workspace folder found. Please open a folder or a workspace to initialize the extension.'
        );
    });

    await t.test('uses Open Folder quick action label', () => {
        assert.strictEqual(OPEN_FOLDER_ACTION, 'Open Folder');
    });
});
