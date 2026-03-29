#!/usr/bin/env node
import { startN8nAsCodeMcpServer } from './services/mcp-server.js';

const cwdArgIndex = process.argv.indexOf('--cwd');
const cwd = cwdArgIndex >= 0 ? process.argv[cwdArgIndex + 1] : process.env.N8N_AS_CODE_PROJECT_DIR;

await startN8nAsCodeMcpServer({ cwd });
