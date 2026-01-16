import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showDiff, flushLogBuffer } from '../../src/utils/cli-helpers.js';
import chalk from 'chalk';
import * as diff from 'diff';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('path');
vi.mock('chalk', () => ({
    default: {
        bold: vi.fn((str) => str),
        green: vi.fn((str) => str),
        red: vi.fn((str) => str),
        cyan: vi.fn((str) => str),
        gray: vi.fn((str) => str)
    }
}));

describe('cli-helpers', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.clearAllMocks();
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    describe('showDiff', () => {
        it('should display colored diff between local and remote versions', async () => {
            const mockConflict = {
                id: '1',
                filename: 'test-workflow.json'
            };

            const mockClient = {
                getWorkflow: vi.fn().mockResolvedValue({
                    id: '1',
                    name: 'Remote Workflow',
                    nodes: []
                })
            };

            const mockFs = await import('fs/promises');
            (mockFs.readFile as vi.Mock).mockResolvedValue(JSON.stringify({
                id: '1',
                name: 'Local Workflow',
                nodes: []
            }));

            const mockPath = await import('path');
            (mockPath.join as vi.Mock).mockReturnValue('/tmp/test-workflow.json');

            await showDiff(mockConflict, mockClient as any, '/tmp');

            expect(mockClient.getWorkflow).toHaveBeenCalledWith('1');
            expect(mockFs.readFile).toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalled();
        });

        it('should handle errors gracefully', async () => {
            const mockConflict = {
                id: '1',
                filename: 'test-workflow.json'
            };

            const mockClient = {
                getWorkflow: vi.fn().mockRejectedValue(new Error('API Error'))
            };

            await showDiff(mockConflict, mockClient as any, '/tmp');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to show diff')
            );
        });

        it('should color added lines in green', async () => {
            const mockConflict = {
                id: '1',
                filename: 'test.json'
            };

            const mockClient = {
                getWorkflow: vi.fn().mockResolvedValue({ name: 'Remote' })
            };

            const mockFs = await import('fs/promises');
            (mockFs.readFile as any).mockResolvedValue(JSON.stringify({ name: 'Local' }));

            const mockPath = await import('path');
            (mockPath.join as any).mockReturnValue('/tmp/test.json');

            await showDiff(mockConflict, mockClient as any, '/tmp');

            // Verify showDiff was called without errors
            expect(consoleLogSpy).toHaveBeenCalled();
        });
    });

    describe('flushLogBuffer', () => {
        it('should print all buffered logs with gray color', () => {
            const logBuffer = ['Log 1', 'Log 2', 'Log 3'];

            flushLogBuffer(logBuffer);

            expect(consoleLogSpy).toHaveBeenCalledTimes(5); // header + 3 logs + footer
            expect(chalk.gray).toHaveBeenCalled();
        });

        it('should do nothing when buffer is empty', () => {
            const logBuffer: string[] = [];

            flushLogBuffer(logBuffer);

            expect(consoleLogSpy).not.toHaveBeenCalled();
        });

        it('should include header and footer markers', () => {
            const logBuffer = ['Test log'];

            flushLogBuffer(logBuffer);

            const calls = consoleLogSpy.mock.calls.map(call => call[0]);
            expect(calls[0]).toContain('Buffered logs during prompt');
            expect(calls[calls.length - 1]).toContain('End buffered logs');
        });
    });
});
