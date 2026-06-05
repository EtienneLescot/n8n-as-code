#!/usr/bin/env node
import { startN8nAsCodeMcpServer } from './services/mcp-server.js';
import { N8nAsCodeMcpService } from './services/mcp-service.js';

const argv = process.argv.slice(2);

function getArgValue(flag: string): string | undefined {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
}

function hasFlag(flag: string): boolean {
    return argv.includes(flag);
}

const cwd = getArgValue('--cwd') ?? process.env.N8N_AS_CODE_PROJECT_DIR;

const useHttp = hasFlag('--http');
const useSse = hasFlag('--sse');
const port = getArgValue('--port');
const host = getArgValue('--host');
const useNativeMcpStatus = hasFlag('--native-mcp-status');
const useNativeMcpTools = hasFlag('--native-mcp-tools');
const useNativeMcpDoctor = hasFlag('--native-mcp-doctor');
const outputJson = hasFlag('--json');
const includeTools = hasFlag('--include-tools') || useNativeMcpTools || useNativeMcpDoctor;

function printNativeMcpStatus(status: any, toolsOnly = false): void {
    if (toolsOnly) {
        if (status.connection.ok !== true) {
            process.stdout.write(`Native n8n MCP tools unavailable: ${status.connection.error || 'tool discovery failed'}\n`);
            return;
        }
        const tools = status.tools?.names ?? [];
        if (tools.length === 0) {
            process.stdout.write('No native n8n MCP tools discovered.\n');
            return;
        }
        process.stdout.write(`${tools.length} native n8n MCP tool(s):\n`);
        for (const tool of tools) process.stdout.write(`- ${tool}\n`);
        return;
    }

    process.stdout.write(`Native n8n MCP: ${status.config.enabled ? 'enabled' : 'disabled'}\n`);
    process.stdout.write(`Mode: ${status.config.mode}\n`);
    process.stdout.write(`Endpoint configured: ${status.config.configured ? 'yes' : 'no'}\n`);
    if (status.config.endpoint) process.stdout.write(`Endpoint: ${status.config.endpoint}\n`);
    process.stdout.write(`Bearer token configured: ${status.config.tokenConfigured ? 'yes' : 'no'}\n`);
    process.stdout.write(`Connection checked: ${status.connection.checked ? 'yes' : 'no'}\n`);
    if (typeof status.connection.ok === 'boolean') process.stdout.write(`Connection: ${status.connection.ok ? 'ok' : 'failed'}\n`);
    if (status.connection.error) process.stdout.write(`Diagnostic: ${status.connection.error}\n`);
    if (status.tools) {
        process.stdout.write(`Tools discovered: ${status.tools.count}\n`);
        if (status.tools.missingReadOnlyTools.length > 0) {
            process.stdout.write(`Missing read-only assist tools: ${status.tools.missingReadOnlyTools.join(', ')}\n`);
        }
    }
}

if (useHttp && useSse) {
    process.stderr.write('Error: --http and --sse are mutually exclusive. Please specify only one transport flag.\n');
    process.exit(1);
}

if ([useNativeMcpStatus, useNativeMcpTools, useNativeMcpDoctor].filter(Boolean).length > 1) {
    process.stderr.write('Error: native MCP diagnostic flags are mutually exclusive.\n');
    process.exit(1);
}

if (useNativeMcpStatus || useNativeMcpTools || useNativeMcpDoctor) {
    const service = new N8nAsCodeMcpService({ cwd });
    const status = await service.getNativeMcpStatus({ includeTools });
    if (outputJson) {
        process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    } else {
        printNativeMcpStatus(status, useNativeMcpTools);
    }
    if (useNativeMcpDoctor) {
        const ok = Boolean(status.config.enabled && status.config.configured && status.connection.ok);
        process.exitCode = ok ? 0 : 1;
    } else if (useNativeMcpTools && status.connection.ok !== true) {
        process.exitCode = 1;
    } else {
        process.exitCode = 0;
    }
} else {
    await startN8nAsCodeMcpServer({
        cwd,
        http: useHttp
            ? {
                  port: port !== undefined ? Number.parseInt(port, 10) : undefined,
                  host,
              }
            : undefined,
        sse: useSse
            ? {
                  port: port !== undefined ? Number.parseInt(port, 10) : undefined,
                  host,
              }
            : undefined,
    });
}
