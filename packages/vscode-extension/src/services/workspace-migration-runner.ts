import * as vscode from 'vscode';
import { WorkspaceMigrationFacade, type IWorkspaceMigrationReport } from 'n8nac';

export async function runWorkspaceMigrationFromVscode(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
): Promise<
  | { outcome: 'not-needed' }
  | { outcome: 'cancelled'; report: IWorkspaceMigrationReport }
  | { outcome: 'migrated'; report: IWorkspaceMigrationReport }
> {
  const facade = new WorkspaceMigrationFacade({
    workspaceRoot,
    legacySettingsProvider: () => readLegacyN8nSettingsForMigration(context),
  });
  const migration = facade.inspect();
  if (!migration) return { outcome: 'not-needed' };

  const confirmation = await vscode.window.showWarningMessage(
    formatMigrationPrompt(migration),
    { modal: true },
    'Run migration',
  );
  if (confirmation !== 'Run migration') return { outcome: 'cancelled', report: migration };

  const result = await facade.migrate({ write: true });
  if (migration.operations.some((operation) => operation.id === 'legacy-workspace-config')) {
    await clearLegacyWorkspaceSettings();
  }
  return { outcome: 'migrated', report: result };
}

function formatMigrationPrompt(migration: IWorkspaceMigrationReport): string {
  const operationLabels = migration.operations.map((operation) => operation.label).join(', ');
  return operationLabels
    ? `Migration required: ${operationLabels}. This will update the workspace configuration.`
    : 'Migration required. This will update the workspace configuration.';
}

async function readLegacyN8nSettingsForMigration(context: vscode.ExtensionContext): Promise<{ host: string; apiKey: string }> {
  const config = vscode.workspace.getConfiguration('n8n');
  const configuredApiKey = String(config.get<string>('apiKey') || '').trim();
  return {
    host: String(config.get<string>('host') || '').trim().replace(/\/$/, ''),
    apiKey: configuredApiKey || await readLegacySecretApiKeyForMigration(context),
  };
}

async function readLegacySecretApiKeyForMigration(context: vscode.ExtensionContext): Promise<string> {
  const candidates = ['n8n.apiKey', 'apiKey', 'n8n-as-code.apiKey', 'n8nAsCode.apiKey', 'n8nApiKey'];
  for (const key of candidates) {
    const value = (await context.secrets.get(key))?.trim();
    if (value) return value;
  }
  return '';
}

async function clearLegacyWorkspaceSettings(): Promise<void> {
  const config = vscode.workspace.getConfiguration('n8n');
  const keys: Array<'host' | 'apiKey' | 'syncFolder' | 'projectId' | 'projectName'> = [
    'host',
    'apiKey',
    'syncFolder',
    'projectId',
    'projectName',
  ];

  for (const key of keys) {
    const inspected = config.inspect<string>(key);
    if (inspected?.workspaceValue !== undefined) {
      await config.update(key, undefined, vscode.ConfigurationTarget.Workspace);
    }
    if (inspected?.workspaceFolderValue !== undefined) {
      await config.update(key, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    }
  }
}
