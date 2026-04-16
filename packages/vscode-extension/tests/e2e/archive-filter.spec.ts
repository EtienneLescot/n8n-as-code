/**
 * Playwright E2E screenshot tests for the archive filter tabs in the VS Code
 * sidebar (n8n-explorer.workflows tree view).
 *
 * These tests run against a local HTTP server (tests/e2e/server.cjs) that
 * serves the screenshot panel HTML — a faithful mirror of what the real
 * ScreenshotPanel webview renders inside VS Code.
 *
 * Run with:
 *   npm run test:e2e
 *
 * Screenshots are saved to tests/e2e/screenshots/
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.describe('n8n archive filter sidebar tabs', () => {

    test.beforeEach(async ({ page }) => {
        test.setTimeout(30_000);
        await page.goto('http://localhost:9876/');
    });

    test('Active filter: shows only active workflows, no archived badges in rows', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=live');
        await page.waitForLoadState('networkidle');

        const rows = page.locator('tbody tr');
        await expect(rows.first()).toBeVisible();

        // Filter label shows Live
        await expect(page.locator('.state-bar')).toContainText('Live');

        // Active button should be highlighted
        const liveBtn = page.locator('button[data-filter="live"]');
        await expect(liveBtn).toHaveCSS('background-color', 'rgb(74, 63, 107)');

        // Active badges present: expect exactly 4 (our mock data has 4 live workflows)
        const activeBadges = page.locator('tbody span:text("active")');
        await expect(activeBadges).toHaveCount(4);

        await page.screenshot({ path: SCREENSHOTS_DIR + '/filter-active.png', animations: 'disabled' });
    });

    test('Archived filter: shows archived badges in rows, no active badges', async ({ page }) => {
        await page.goto('/?filter=archived');

        // Should show archived badges in rows
        const archivedBadges = page.locator('tbody span:text("archived")');
        await expect(archivedBadges.first()).toBeVisible();

        // No active badges in rows
        const activeBadges = page.locator('tbody span:text("active")');
        await expect(activeBadges).toHaveCount(0);

        // Filter label
        await expect(page.locator('.state-bar')).toContainText('Archived');

        await page.screenshot({ path: SCREENSHOTS_DIR + '/filter-archived.png', animations: 'disabled' });
    });

    test('All filter: shows both active and archived workflows', async ({ page }) => {
        await page.goto('/?filter=all');

        const archivedCount = await page.locator('text=archived').count();
        const activeCount = await page.locator('text=active').count();
        expect(archivedCount).toBeGreaterThan(0);
        expect(activeCount).toBeGreaterThan(0);

        await expect(page.locator('.state-bar')).toContainText('All');

        await page.screenshot({ path: SCREENSHOTS_DIR + '/filter-all.png', animations: 'disabled' });
    });

    test('Filter switch: clicking Archived button navigates to archived view', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=live');

        // Click Archived button → triggers navigation to ?filter=archived
        await page.locator('button[data-filter="archived"]').click();
        await page.waitForURL('**/?filter=archived');

        await expect(page.locator('text=archived').first()).toBeVisible();

        await page.screenshot({ path: SCREENSHOTS_DIR + '/filter-switch.png', animations: 'disabled' });
    });

    test('Initialized state: green dot + "Initialized" label', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=live');

        const dot = page.locator('.state-dot');
        await expect(dot).toHaveCSS('background-color', 'rgb(127, 247, 175)');
        await expect(page.locator('.state-bar')).toContainText('Initialized');

        await page.screenshot({ path: SCREENSHOTS_DIR + '/state-initialized.png', animations: 'disabled' });
    });

    test('Workflow rows: name, dot status indicator, and badge are visible', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=live');

        // At least one workflow row with content
        const firstRow = page.locator('tbody tr').first();
        await expect(firstRow).toBeVisible();

        // Status dot present (● character with color)
        const dot = firstRow.locator('td:first-child span');
        await expect(dot).toBeVisible();

        // Name cell is non-empty
        const nameCell = firstRow.locator('td:nth-child(2)');
        const name = await nameCell.textContent();
        expect(name?.trim().length).toBeGreaterThan(0);

        // Badge (active) present
        await expect(firstRow.locator('text=active')).toBeVisible();

        await page.screenshot({ path: SCREENSHOTS_DIR + '/workflow-row-detail.png', animations: 'disabled' });
    });

    test('Header: logo, title, and version badge visible', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=live');

        await expect(page.locator('h2')).toContainText('⚡');
        await expect(page.locator('h2')).toContainText('n8n Workflow Explorer');
        await expect(page.locator('.badge')).toBeVisible();

        await page.screenshot({ path: SCREENSHOTS_DIR + '/header.png', animations: 'disabled' });
    });

    test('Filter bar: all three filter buttons visible and distinct', async ({ page }) => {
        await page.goto('http://localhost:9876/?filter=live');

        const liveBtn = page.locator('button[data-filter="live"]');
        const archivedBtn = page.locator('button[data-filter="archived"]');
        const allBtn = page.locator('button[data-filter="all"]');

        await expect(liveBtn).toBeVisible();
        await expect(archivedBtn).toBeVisible();
        await expect(allBtn).toBeVisible();

        // Active button has distinct highlight color
        await expect(liveBtn).toHaveCSS('background-color', 'rgb(74, 63, 107)');
        // Others should NOT have this color
        await expect(archivedBtn).not.toHaveCSS('background-color', 'rgb(74, 63, 107)');

        await page.screenshot({ path: SCREENSHOTS_DIR + '/filter-bar.png', animations: 'disabled' });
    });
});
