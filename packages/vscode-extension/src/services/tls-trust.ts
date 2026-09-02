import * as vscode from 'vscode';
import type { IExtraCaCertificateInstallation } from 'n8nac';
import { applyTlsTrust } from '../utils/tls-trust.js';

/** VS Code glue around {@link applyTlsTrust}; the trust logic itself lives in utils. */

export const TLS_CONFIGURATION_SECTION = 'n8n.tls';

const CERTIFICATE_AUTHORITIES_SETTING = 'certificateAuthorities';
const SYSTEM_CERTIFICATE_AUTHORITIES_SETTING = 'useSystemCertificateAuthorities';

export function applyTlsTrustSettings(log: (message: string) => void): IExtraCaCertificateInstallation {
    const configuration = vscode.workspace.getConfiguration(TLS_CONFIGURATION_SECTION);
    return applyTlsTrust({
        certificateAuthorities: configuration.get<string[]>(CERTIFICATE_AUTHORITIES_SETTING),
        useSystemCertificateAuthorities: configuration.get<boolean>(SYSTEM_CERTIFICATE_AUTHORITIES_SETTING),
        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    }, log);
}

/** Re-applies the settings whenever the user edits them, so no window reload is needed. */
export function registerTlsTrustSettingsWatcher(log: (message: string) => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration(TLS_CONFIGURATION_SECTION)) return;
        applyTlsTrustSettings(log);
    });
}
