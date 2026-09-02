import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolvePackageJsonFrom, verifyRuntimeDependencyClosure } from './verify-runtime-dependency-closure.mjs';

const vsixPath = process.argv[2];
if (!vsixPath) {
  console.error('Usage: node scripts/smoke-vsix-runtime.mjs <path-to.vsix>');
  process.exit(1);
}

const absoluteVsixPath = path.resolve(vsixPath);
if (!fs.existsSync(absoluteVsixPath)) {
  console.error(`VSIX not found: ${absoluteVsixPath}`);
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-vsix-smoke-'));
try {
  execFileSync('unzip', ['-q', absoluteVsixPath, '-d', tempRoot], { stdio: 'pipe' });
  const extensionRoot = path.join(tempRoot, 'extension');
  const outDir = path.join(extensionRoot, 'out');
  const nodeModulesDir = path.join(outDir, 'node_modules');

  assertFile(path.join(outDir, 'extension.js'));
  assertFile(path.join(outDir, 'extension-runtime.mjs'));
  assertMissing(path.join(outDir, 'extension-runtime.js'));
  assertFile(path.join(nodeModulesDir, 'n8nac', 'dist', 'lib.js'));
  // Peer-only dependency of every bundled LangChain package; absent from 2.38.0. See #566.
  assertFile(path.join(nodeModulesDir, '@langchain', 'core', 'package.json'));

  // `p-retry` and `is-network-error` are ESM-only and have historically failed to load
  // from the VSIX. Resolve them the way Node will rather than asserting a fixed path:
  // whether npm hoists them or nests them under @langchain/langgraph-sdk varies per
  // install, and the repo does not commit a lockfile.
  const langgraphSdkDir = assertResolvable(nodeModulesDir, outDir, '@langchain/langgraph-sdk');
  const pRetryDir = assertResolvable(nodeModulesDir, langgraphSdkDir, 'p-retry');
  assertResolvable(nodeModulesDir, pRetryDir, 'is-network-error');
  assertFile(path.join(pRetryDir, 'index.js'));

  installVscodeMock(extensionRoot);
  verifyRuntimeDependencyClosure(nodeModulesDir);

  globalThis.__vscodeSmokeOutput = [];
  const extension = await import(pathToFileURL(path.join(outDir, 'extension.js')).href);
  const context = createExtensionContext(extensionRoot);
  await extension.activate(context);
  const activationLog = globalThis.__vscodeSmokeOutput.join('\n');
  // `activate` swallows a runtime import failure and only reports it on the output
  // channel, so activation resolving is not on its own proof that the VSIX loads (#566).
  if (activationLog.includes('Failed to load extension runtime')) {
    throw new Error(`Extension runtime failed to load during VSIX smoke test:\n${activationLog}`);
  }
  if (activationLog.includes('Activation completed with degraded functionality')) {
    throw new Error(`Extension activation degraded during VSIX smoke test:\n${activationLog}`);
  }
  await import(pathToFileURL(path.join(pRetryDir, 'index.js')).href);

  console.log('VSIX runtime smoke test passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function assertFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Expected file missing: ${filePath}`);
  }
}

/** @returns the resolved package directory, so callers can chain from it. */
function assertResolvable(rootNodeModulesDir, fromDir, packageName) {
  const packageJsonPath = resolvePackageJsonFrom(fromDir, packageName, rootNodeModulesDir);
  if (!packageJsonPath) {
    throw new Error(`Expected ${packageName} to be resolvable from ${fromDir}`);
  }
  return path.dirname(packageJsonPath);
}

function assertMissing(filePath) {
  if (fs.existsSync(filePath)) {
    throw new Error(`Unexpected stale file in VSIX: ${filePath}`);
  }
}

function installVscodeMock(extensionRoot) {
  const vscodeDir = path.join(extensionRoot, 'node_modules', 'vscode');
  fs.mkdirSync(vscodeDir, { recursive: true });
  fs.writeFileSync(path.join(vscodeDir, 'index.cjs'), `
const path = require('node:path');
class EventEmitter {
  constructor() { this.listeners = new Set(); this.event = (listener) => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }; }
  fire(value) { for (const listener of this.listeners) listener(value); }
  dispose() { this.listeners.clear(); }
}
class TreeItem { constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; } }
class ThemeIcon { constructor(id, color) { this.id = id; this.color = color; } }
class ThemeColor { constructor(id) { this.id = id; } }
class Uri {
  constructor(fsPath, value) { this.fsPath = fsPath; this._value = value || fsPath; }
  toString() { return this._value; }
  static file(filePath) { return new Uri(filePath, 'file://' + filePath); }
  static parse(value) { return new Uri(value.startsWith('file://') ? value.slice(7) : value, value); }
  static joinPath(base, ...parts) { return Uri.file(path.join(base.fsPath || String(base), ...parts)); }
}
class RelativePattern { constructor(base, pattern) { this.base = base; this.pattern = pattern; } }
const disposable = { dispose() {} };
const configuration = { get() { return undefined; }, update() { throw new Error('VSIX smoke test forbids VS Code settings writes'); } };
module.exports = {
  version: '1.99.0-smoke',
  EventEmitter,
  TreeItem,
  ThemeIcon,
  ThemeColor,
  Uri,
  RelativePattern,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ProgressLocation: { Notification: 15 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  window: {
    createStatusBarItem() { return { ...disposable, show() {}, hide() {}, text: '', tooltip: '', command: undefined, backgroundColor: undefined }; },
    createOutputChannel() { return { ...disposable, appendLine(value) { global.__vscodeSmokeOutput?.push(String(value)); }, show() {} }; },
    createTreeView() { return { ...disposable, reveal() {}, title: '' }; },
    registerFileDecorationProvider() { return disposable; },
    createWebviewPanel() { return { ...disposable, webview: { options: {}, html: '', asWebviewUri: (uri) => uri, onDidReceiveMessage: () => disposable, postMessage: async () => true }, onDidDispose: () => disposable, onDidChangeViewState: () => disposable, reveal() {}, visible: true }; },
    showErrorMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showInputBox: async () => undefined,
    showQuickPick: async () => undefined,
    withProgress: async (_options, task) => task({ report() {} }),
  },
  workspace: {
    workspaceFolders: undefined,
    getConfiguration() { return configuration; },
    registerTextDocumentContentProvider() { return disposable; },
    createFileSystemWatcher() { return { ...disposable, onDidCreate: () => disposable, onDidChange: () => disposable, onDidDelete: () => disposable }; },
    onDidChangeConfiguration() { return disposable; },
    onDidChangeWorkspaceFolders() { return disposable; },
    openTextDocument: async () => ({}),
  },
  commands: { registerCommand() { return disposable; }, executeCommand: async () => undefined },
  env: { isTelemetryEnabled: false, onDidChangeTelemetryEnabled: () => disposable, clipboard: { readText: async () => '', writeText: async () => undefined }, asExternalUri: async (uri) => uri, openExternal: async () => true },
};
`);

  // out/extension.js uses `require('vscode')`, but out/extension-runtime.mjs uses
  // `import * as vscode`. Node's CJS named-export detection gives up on an object literal
  // this large, so the ESM side would see only a default export and `class extends
  // vscode.TreeItem` would throw. Generate an explicit ESM facade from the mock's own
  // keys so both module systems see the same surface.
  const mock = createRequire(import.meta.url)(path.join(vscodeDir, 'index.cjs'));
  fs.writeFileSync(path.join(vscodeDir, 'index.mjs'), `import vscode from './index.cjs';
export default vscode;
export const { ${Object.keys(mock).join(', ')} } = vscode;
`);
  fs.writeFileSync(path.join(vscodeDir, 'package.json'), JSON.stringify({
    name: 'vscode',
    version: '0.0.0',
    main: 'index.cjs',
    exports: { '.': { import: './index.mjs', require: './index.cjs', default: './index.cjs' } },
  }));
}

function createExtensionContext(extensionRoot) {
  const globalState = createMemento();
  const workspaceState = createMemento();
  const globalStoragePath = path.join(extensionRoot, '.smoke-global-storage');
  fs.mkdirSync(globalStoragePath, { recursive: true });
  return {
    subscriptions: [],
    extensionUri: { fsPath: extensionRoot, toString: () => `file://${extensionRoot}` },
    globalStorageUri: { fsPath: globalStoragePath, toString: () => `file://${globalStoragePath}` },
    storageUri: { fsPath: globalStoragePath, toString: () => `file://${globalStoragePath}` },
    logUri: { fsPath: globalStoragePath, toString: () => `file://${globalStoragePath}` },
    extension: { packageJSON: JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')) },
    globalState,
    workspaceState,
    secrets: createSecretStorage(),
  };
}

function createMemento() {
  const values = new Map();
  return { get: (key, defaultValue) => values.has(key) ? values.get(key) : defaultValue, update: async (key, value) => { value === undefined ? values.delete(key) : values.set(key, value); } };
}

function createSecretStorage() {
  const values = new Map();
  return { get: async (key) => values.get(key), store: async (key, value) => { values.set(key, value); }, delete: async (key) => { values.delete(key); } };
}
