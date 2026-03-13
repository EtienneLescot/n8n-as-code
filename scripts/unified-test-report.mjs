#!/usr/bin/env node
import { spawn } from 'child_process';
import chalk from 'chalk';

/**
 * Unified Monorepo Test Reporter v2
 * Supports Subsections (Unit/Integration) and Verbose Mode (-v).
 */

const isVerbose = process.argv.includes('-v') || process.argv.includes('--verbose');

const testSuites = [
    { section: 'Unit Tests', name: 'transformer', pkg: '@n8n-as-code/transformer', cmd: 'npm', args: ['test', '--workspace=@n8n-as-code/transformer'] },
    { section: 'Unit Tests', name: 'skills', pkg: '@n8n-as-code/skills', cmd: 'npm', args: ['test', '--workspace=@n8n-as-code/skills', '--', '--ci', '--reporters', 'default'] },
    { section: 'Unit Tests', name: 'cli', pkg: 'n8nac', cmd: 'npm', args: ['test', '--workspace=n8nac'] },
    { section: 'Unit Tests', name: 'openclaw', pkg: '@n8n-as-code/openclaw-plugin', cmd: 'npm', args: ['test', '--workspace=@n8n-as-code/openclaw-plugin'] },
    { section: 'Unit Tests', name: 'vscode-unit', pkg: 'n8n-as-code', cmd: 'npm', args: ['run', 'test', '--workspace=packages/vscode-extension'] },
    { section: 'Integration Tests', name: 'cli-live', pkg: 'n8nac', cmd: 'npm', args: ['run', 'test:integration', '--workspace=n8nac'] }
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
            let scenarios = [];

            const scenarioMatches = [...output.matchAll(/^SCENARIO_(PASS|FAIL):(.+)$/gm)];
            if (scenarioMatches.length > 0) {
                scenarios = scenarioMatches.map((match) => ({
                    status: match[1],
                    name: match[2].trim()
                }));
                passed = scenarios.filter((scenario) => scenario.status === 'PASS').length.toString();
                failed = scenarios.filter((scenario) => scenario.status === 'FAIL').length.toString();
            }

            // Parse counts (even if it failed, we want the stats if available)
            if (scenarioMatches.length === 0 && (suite.name === 'transformer' || suite.name === 'skills' || suite.name === 'cli')) {
                // Support both Vitest and Jest formats:
                // Vitest: "Tests  53 passed (53)"
                // Jest: "Tests:       29 passed, 29 total"
                const testMatch = output.match(/Tests:?\s+(\d+)\s+passed/i);
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
                const failMatch = output.match(/Tests:?\s+(\d+)\s+failed/i);
                if (failMatch) failed = failMatch[1];
            } else if (scenarioMatches.length === 0) {
                const passMatch = output.match(/pass\s+(\d+)/i);
                if (passMatch) passed = passMatch[1];
                const failMatch = output.match(/fail\s+(\d+)/i);
                if (failMatch) failed = failMatch[1] || '0';
            }

            if (isOffline) {
                status = chalk.yellow('OFFLINE');
                passed = '-';
                failed = '-';
            } else if (code !== 0) {
                status = chalk.red('FAIL');
            }

            if (!isVerbose) {
                const displayStatus = isOffline ? chalk.yellow('OFFLINE') : (code === 0 ? chalk.green('PASSED') : chalk.red('FAILED'));
                process.stdout.write(`${displayStatus} (${duration})\n`);
            }

            resolve({ ...suite, status, passed, failed, duration, output, code, scenarios });
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

    const suitesWithScenarios = results.filter(r => Array.isArray(r.scenarios) && r.scenarios.length > 0);
    if (suitesWithScenarios.length > 0) {
        console.log(chalk.blue.bold('Scenario Highlights'));
        for (const suite of suitesWithScenarios) {
            const scenarioSummary = suite.scenarios
                .map((scenario) => `${scenario.status === 'PASS' ? 'PASS' : 'FAIL'} ${scenario.name}`)
                .join(' | ');
            console.log(`- ${suite.name}: ${scenarioSummary}`);
        }
        console.log('');
    }

    const failedSuites = results.filter(r => r.code !== 0 && !r.status.includes('OFFLINE'));

    if (failedSuites.length > 0 && !isVerbose) {
        console.log(chalk.red.bold('❌ Detailed Error Logs for Failed Suites:'));
        for (const res of failedSuites) {
            console.log(chalk.red.bold(`\n--- [ ${res.name} ] ---`));
            console.log(res.output);
            console.log(chalk.red.bold(`--- [ End of ${res.name} ] ---\n`));
        }
    }

    const hasFailed = results.some(r => r.code !== 0 && !r.status.includes('OFFLINE'));
    process.exit(hasFailed ? 1 : 0);
})();
