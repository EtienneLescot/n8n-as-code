import chalk from 'chalk';
import * as diff from 'diff';
import { N8nApiClient } from '@n8n-as-code/core';

/**
 * CLI Helper utilities for formatting and display
 * These are pure UI/presentation concerns, not business logic
 */

/**
 * Display a colored diff between local and remote workflow versions
 */
export async function showDiff(
    conflict: { id: string; filename: string },
    client: N8nApiClient,
    directory: string
): Promise<void> {
    try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        // Read local file
        const localPath = path.join(directory, conflict.filename);
        const localContent = await fs.readFile(localPath, 'utf-8');
        
        // Get remote content
        const remoteWorkflow = await client.getWorkflow(conflict.id);
        const remoteContent = JSON.stringify(remoteWorkflow, null, 2);
        
        console.log(chalk.bold('\n--- Diff (Local vs Remote) ---\n'));
        
        const patches = diff.createPatch(
            conflict.filename,
            remoteContent,
            localContent,
            'Remote (n8n)',
            'Local (file)'
        );
        
        // Color the diff output
        const lines = patches.split('\n');
        for (const line of lines) {
            if (line.startsWith('+') && !line.startsWith('+++')) {
                console.log(chalk.green(line));
            } else if (line.startsWith('-') && !line.startsWith('---')) {
                console.log(chalk.red(line));
            } else if (line.startsWith('@@')) {
                console.log(chalk.cyan(line));
            } else {
                console.log(chalk.gray(line));
            }
        }
        
        console.log(chalk.bold('\n--- End Diff ---\n'));
    } catch (error: any) {
        console.log(chalk.red(`Failed to show diff: ${error.message}`));
    }
}

/**
 * Flush buffered logs to console
 */
export function flushLogBuffer(logBuffer: string[]): void {
    if (logBuffer.length === 0) return;
    
    console.log(chalk.gray('\n--- Buffered logs during prompt ---'));
    for (const msg of logBuffer) {
        console.log(chalk.gray(msg));
    }
    console.log(chalk.gray('--- End buffered logs ---\n'));
}
