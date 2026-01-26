#!/usr/bin/env node
import { spawn } from 'child_process';
import chalk from 'chalk';

/**
 * Unified Monorepo Test Reporter v2
 * Supports Subsections (Unit/Integration) and Verbose Mode (-v).
 */

const isVerbose = process.argv.includes('-v') || process.argv.includes('--verbose');

const testSuites = [
    { section: 'Unit Tests', name: 'skills', pkg: '@n8n-as-code/agent-cli', cmd: 'npm', args: ['test', '--workspace=@n8n-as-code/agent-cli', '--', '--silent', '--reporters', 'default'] },
    { section: 'Unit Tests', name: 'cli', pkg: '@n8n-as-code/cli', cmd: 'npm', args: ['test', '--workspace=@n8n-as-code/cli'] },
    { section: 'Unit Tests', name: 'core-unit', pkg: '@n8n-as-code/sync', cmd: 'npm', args: ['run', 'test:unit', '--workspace=@n8n-as-code/sync'] },
    { section: 'Unit Tests', name: 'vscode-unit', pkg: 'n8n-as-code', cmd: 'npm', args: ['run', 'test', '--workspace=packages/vscode-extension'] },
    { section: 'Integration Tests', name: 'core-integration', pkg: '@n8n-as-code/sync', cmd: 'npm', args: ['run', 'test:integration', '--workspace=@n8n-as-code/sync'] }
];

const results = [];

console.log(chalk.bold('\n🚀 Running Monorepo Test Suite' + (isVerbose ? ' (Verbose Mode)' : '') + '...\n'));

async function runTest(suite) {
    return new Promise((resolve) => {
        if (!isVerbose) {
            process.stdout.write(`  📦 ${chalk.cyan(suite.name.padEnd(16))} ... `);
        } else {
            console.log(chalk.bold(`\n═══ Executing ${suite.name} ═══`));
        }

        const start = Date.now();
        const proc = spawn(suite.cmd, suite.args, {
            env: { ...process.env, FORCE_COLOR: 'true' },
            shell: true
        });

        let output = '';
        proc.stdout.on('data', (data) => {
            output += data.toString();
            if (isVerbose) process.stdout.write(data);
        });

        proc.stderr.on('data', (data) => {
            output += data.toString();
            if (isVerbose) process.stderr.write(data);
        });

        proc.on('close', (code) => {
            const duration = ((Date.now() - start) / 1000).toFixed(1) + 's';
            const isOffline = output.includes('[OFFLINE]');

            let status = chalk.green('PASS');
            let passed = '0', failed = '0';

            if (code !== 0) {
                if (isOffline) {
                    status = chalk.yellow('OFFLINE');
                    passed = '-';
                    failed = '-';
                } else {
                    status = chalk.red('FAIL');
                    passed = '-';
                    failed = '1+';
                }
            } else {
                // Parse counts
                if (suite.name === 'agent-cli' || suite.name === 'cli') {
                    // Vitest format: "Tests  53 passed (53)"
                    const testMatch = output.match(/Tests\s+(\d+)\s+passed/i);
                    if (testMatch) {
                        passed = testMatch[1];
                    } else {
                        // Alternative format: "13 passed"
                        const match = output.match(/(\d+)\s+passed/g);
                        if (match) {
                            const counts = match.map(m => parseInt(m.match(/(\d+)/)[0]));
                            passed = Math.max(...counts).toString();
                        }
                    }
                    const failMatch = output.match(/Tests\s+(\d+)\s+failed/i);
                    if (failMatch) failed = failMatch[1];
                } else {
                    const passMatch = output.match(/pass\s+(\d+)/i);
                    if (passMatch) passed = passMatch[1];
                    const failMatch = output.match(/fail\s+(\d+)/i);
                    if (failMatch) failed = failMatch[1] || '0';
                }
            }

            if (!isVerbose) {
                const displayStatus = isOffline ? chalk.yellow('OFFLINE') : (code === 0 ? chalk.green('PASSED') : chalk.red('FAILED'));
                process.stdout.write(`${displayStatus} (${duration})\n`);
            }

            resolve({ ...suite, status, passed, failed, duration });
        });
    });
}

(async () => {
    for (const suite of testSuites) {
        results.push(await runTest(suite));
    }

    console.log('\n' + chalk.bold('📊 TEST SUMMARY REPORT'));

    let currentSection = '';
    for (const res of results) {
        if (res.section !== currentSection) {
            currentSection = res.section;
            console.log(chalk.blue.bold(`\n── ${currentSection} ──`));
            console.log(`${'Package'.padEnd(16)} | ${'Status'.padEnd(8)} | ${'Passed'.padEnd(6)} | ${'Failed'.padEnd(6)} | ${'Time'}`);
            console.log(''.padEnd(60, '─'));
        }

        // Pad the status specifically due to color codes length
        const statusClean = res.status.replace(/\x1b\[[0-9;]*m/g, '');
        const padding = 8 + (res.status.length - statusClean.length);

        console.log(`${res.name.padEnd(16)} | ${res.status.padEnd(padding)} | ${res.passed.toString().padEnd(6)} | ${res.failed.toString().padEnd(6)} | ${res.duration}`);
    }

    console.log(''.padEnd(60, '─') + '\n');

    const hasFailed = results.some(r => r.status.includes('FAIL'));
    process.exit(hasFailed ? 1 : 0);
})();
