/**
 * Returns true when the clipboard bridge must be activated.
 * Only macOS requires the bridge: on that platform Electron intercepts
 * Cmd+V at the native-menu level before keyboard events reach the webview.
 *
 * Kept in a separate module (no vscode dependency) so it can be unit-tested.
 */
export function isClipboardBridgeRequired(): boolean {
    return process.platform === 'darwin';
}
