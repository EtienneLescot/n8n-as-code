import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

export interface CustomNodesResolution {
    cwd: string;
    configPath: string;
    configExists: boolean;
    configuredPath?: string;
    resolvedConfiguredPath?: string;
    defaultPath: string;
    defaultExists: boolean;
    resolvedPath?: string;
    source: 'config' | 'default' | 'none';
    warnings: string[];
}

/**
 * Resolve the path to the user-provided custom nodes file.
 * Lookup order:
 *   1. `customNodesPath` field in n8nac-config.json (relative to CWD)
 *   2. n8nac-custom-nodes.json in CWD (default sidecar file)
 * Returns resolution details, warnings, and the selected path when found.
 */
export function resolveCustomNodesConfig(cwd: string = process.cwd()): CustomNodesResolution {
    const warnings: string[] = [];
    const configPath = join(cwd, 'n8nac-config.json');
    const defaultPath = join(cwd, 'n8nac-custom-nodes.json');
    const resolution: CustomNodesResolution = {
        cwd,
        configPath,
        configExists: existsSync(configPath),
        defaultPath,
        defaultExists: existsSync(defaultPath),
        source: 'none',
        warnings,
    };

    if (resolution.configExists) {
        try {
            const config = JSON.parse(readFileSync(configPath, 'utf-8'));
            const trimmedCustomNodesPath = typeof config.customNodesPath === 'string'
                ? config.customNodesPath.trim()
                : '';
            if (trimmedCustomNodesPath) {
                resolution.configuredPath = trimmedCustomNodesPath;
                resolution.resolvedConfiguredPath = resolve(cwd, trimmedCustomNodesPath);
                const resolved = resolution.resolvedConfiguredPath;
                if (existsSync(resolved)) {
                    resolution.resolvedPath = resolved;
                    resolution.source = 'config';
                    return resolution;
                }
                warnings.push(`Configured customNodesPath was not found: ${resolved}`);
            } else if (config.customNodesPath !== undefined) {
                warnings.push('Ignoring customNodesPath in n8nac-config.json because it is not a non-empty string.');
            }
        } catch (error: any) {
            warnings.push(`Failed to parse ${configPath}: ${error.message}`);
        }
    }

    if (resolution.defaultExists) {
        resolution.resolvedPath = defaultPath;
        resolution.source = 'default';
    }

    return resolution;
}
