/**
 * vscode-test-runner.cjs
 *
 * Entry point for @vscode/test-electron.
 * This file runs inside the VS Code extension host process.
 * It opens the screenshot panel and then exits (the Playwright test then
 * connects to the running VS Code instance).
 */

const vscode = require('vscode');

async function run() {
    // Open the screenshot panel
    await vscode.commands.executeCommand('n8nac.screenshot.open');

    // Give the webview a moment to render
    await new Promise(r => setTimeout(r, 1000));

    // Signal ready by writing a marker file
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const readyFile = path.join(os.tmpdir(), 'n8nac-e2e-ready');
    fs.writeFileSync(readyFile, String(process.pid));

    // Don't exit — keep VS Code alive for Playwright to connect.
    // VS Code will be terminated by the Playwright test when done.
    return new Promise(() => {});
}

module.exports = { run };
