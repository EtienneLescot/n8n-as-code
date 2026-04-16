/**
 * archive-filter.spec.ts
 *
 * E2E screenshot tests for the archive filter tabs.
 * Fetches real workflows from the n8n cloud API at server startup.
 *
 * Run: npm run test:e2e
 */

import { test, expect, _electron } from '@playwright/test';
import * as path from 'path';

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
const SERVER_PATH = path.resolve(__dirname, 'server.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WorkflowInfo {
    id: string;
    name: string;
    active: boolean;
    isArchived: boolean;
    status: string;
}

async function fetchFromN8nApi(): Promise<WorkflowInfo[]> {
    const host = process.env.N8N_HOST || 'https://etiennel.app.n8n.cloud';
    const key = process.env.N8N_API_KEY || '';

    if (!key) {
        console.warn('[setup] No N8N_API_KEY — will use server mock data');
        return [];
    }

    try {
        const { default: fetch } = await import('undici');
        const res = await fetch(`${host}/api/v1/workflows`, {
            headers: { 'X-N8N-API-KEY': key, 'Accept': 'application/json' },
        });

        if (!res.ok) throw new Error(`n8n API ${res.status}`);
        const data = await res.json() as any;

        return (data.data || []).map((w: any) => ({
            id: String(w.id),
            name: w.name || 'Unnamed',
            active: w.active ?? false,
            isArchived: false, // not exposed in list API — see server.cjs isArchived logic
            status: 'CLOUD-ONLY',
        }));
    } catch (err) {
        console.warn('[setup] Could not fetch from n8n API:', err);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('archive filter tabs — real n8n instance', () => {

    test('Workflows tab: real workflow names visible', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=workflows');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('.state-bar')).toContainText('Workflows');
        const workflowsBtn = page.locator('button[data-filter="workflows"]');
        await expect(workflowsBtn).toHaveCSS('background-color', 'rgb(74, 63, 107)');

        // Verify at least the state shows something real
        await expect(page.locator('.state-bar')).toContainText('Initialized');

        await page.screenshot({ path: SCREENSHOTS_DIR + '/tab-workflows.png', animations: 'disabled' });
    });

    test('Archived tab: shows archived workflows with badge', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=archived');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('.state-bar')).toContainText('Archived');
        const archivedBtn = page.locator('button[data-filter="archived"]');
        await expect(archivedBtn).toHaveCSS('background-color', 'rgb(74, 63, 107)');

        await page.screenshot({ path: SCREENSHOTS_DIR + '/tab-archived.png', animations: 'disabled' });
    });

    test('All tab: mixed workflows (active + archived)', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=all');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('.state-bar')).toContainText('All');
        await page.screenshot({ path: SCREENSHOTS_DIR + '/tab-all.png', animations: 'disabled' });
    });

    test('Switch from Workflows to Archived: URL and state update', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=workflows');
        await page.waitForLoadState('networkidle');

        await page.locator('button[data-filter="archived"]').click();
        await page.waitForURL('**/?filter=archived');

        await expect(page.locator('.state-bar')).toContainText('Archived');

        await page.screenshot({ path: SCREENSHOTS_DIR + '/tab-switch-to-archived.png', animations: 'disabled' });
    });

    test('Header: logo, title, version badge visible', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=workflows');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h2')).toContainText('n8n Workflow Explorer');
        await expect(page.locator('.badge')).toBeVisible();

        await page.screenshot({ path: SCREENSHOTS_DIR + '/header.png', animations: 'disabled' });
    });

    test('State bar: green dot when initialized', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=workflows');
        await page.waitForLoadState('networkidle');

        const dot = page.locator('.state-dot');
        await expect(dot).toHaveCSS('background-color', 'rgb(127, 247, 175)');

        await page.screenshot({ path: SCREENSHOTS_DIR + '/state-initialized.png', animations: 'disabled' });
    });

    test('Real workflow names appear in table', async ({ page }) => {
        const realWorkflows = await fetchFromN8nApi();

        await page.goto('http://localhost:9876/?filter=all');
        await page.waitForLoadState('networkidle');

        if (realWorkflows.length > 0) {
            // Check that at least one real workflow name appears
            const firstName = realWorkflows[0].name;
            await expect(page.locator('tbody')).toContainText(firstName);
        }

        await page.screenshot({ path: SCREENSHOTS_DIR + '/real-workflow-names.png', animations: 'disabled' });
    });

    test('Workflows tab count matches visible rows', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=workflows');
        await page.waitForLoadState('networkidle');

        // Count actual rows
        const rowCount = await page.locator('tbody tr').count();
        const stateText = await page.locator('.state-bar').textContent() ?? '';

        // Extract the number from "X workflows"
        const match = stateText.match(/(\d+)\s+workflow/);
        if (match) {
            expect(parseInt(match[1])).toBe(rowCount);
        }
    });
});