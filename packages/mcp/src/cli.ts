#!/usr/bin/env node
import { startN8nAsCodeMcpServer } from './services/mcp-server.js';

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

if (useHttp && useSse) {
    process.stderr.write('Error: --http and --sse are mutually exclusive. Please specify only one transport flag.\n');
    process.exit(1);
}

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
