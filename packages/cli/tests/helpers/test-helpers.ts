/**
 * Test helpers and utilities for CLI tests
 */

import { EventEmitter } from 'events';

/**
 * Mock N8nApiClient for testing
 */
export class MockN8nApiClient extends EventEmitter {
    private mockWorkflows: any[] = [];
    private mockCurrentUser: any = null;
    private mockHealth: any = { status: 'ok', version: '1.0.0' };
    private shouldFail = false;

    setMockWorkflows(workflows: any[]) {
        this.mockWorkflows = workflows;
    }

    setMockCurrentUser(user: any) {
        this.mockCurrentUser = user;
    }

    setMockHealth(health: any) {
        this.mockHealth = health;
    }

    setShouldFail(shouldFail: boolean) {
        this.shouldFail = shouldFail;
    }

    async testConnection(): Promise<boolean> {
        if (this.shouldFail) return false;
        return true;
    }

    async getWorkflows(): Promise<any[]> {
        if (this.shouldFail) throw new Error('API Error');
        return this.mockWorkflows;
    }

    async getWorkflow(id: string): Promise<any> {
        if (this.shouldFail) throw new Error('API Error');
        const workflow = this.mockWorkflows.find(w => w.id === id);
        if (!workflow) throw new Error('Workflow not found');
        return workflow;
    }

    async createWorkflow(workflow: any): Promise<any> {
        if (this.shouldFail) throw new Error('API Error');
        const newWorkflow = { ...workflow, id: `${Date.now()}` };
        this.mockWorkflows.push(newWorkflow);
        return newWorkflow;
    }

    async updateWorkflow(id: string, workflow: any): Promise<any> {
        if (this.shouldFail) throw new Error('API Error');
        const index = this.mockWorkflows.findIndex(w => w.id === id);
        if (index === -1) throw new Error('Workflow not found');
        this.mockWorkflows[index] = { ...workflow, id };
        return this.mockWorkflows[index];
    }

    async deleteWorkflow(id: string): Promise<void> {
        if (this.shouldFail) throw new Error('API Error');
        this.mockWorkflows = this.mockWorkflows.filter(w => w.id !== id);
    }

    async getCurrentUser(): Promise<any> {
        if (this.shouldFail) throw new Error('API Error');
        return this.mockCurrentUser;
    }

    async getHealth(): Promise<any> {
        if (this.shouldFail) throw new Error('API Error');
        return this.mockHealth;
    }
}

/**
 * Mock SyncManager for testing
 */
export class MockSyncManager extends EventEmitter {
    private mockWorkflowsStatus: any[] = [];
    private shouldFail = false;

    constructor(public client: any, public config: any) {
        super();
    }

    setMockWorkflowsStatus(status: any[]) {
        this.mockWorkflowsStatus = status;
    }

    setShouldFail(shouldFail: boolean) {
        this.shouldFail = shouldFail;
    }

    async refreshState(): Promise<void> {
        if (this.shouldFail) throw new Error('SyncManager Error');
    }

    async getWorkflowsStatus(): Promise<any[]> {
        if (this.shouldFail) throw new Error('SyncManager Error');
        return this.mockWorkflowsStatus;
    }

    async syncDown(): Promise<void> {
        if (this.shouldFail) throw new Error('SyncManager Error');
        this.emit('log', 'Syncing down...');
    }

    async syncUp(): Promise<void> {
        if (this.shouldFail) throw new Error('SyncManager Error');
        this.emit('log', 'Syncing up...');
    }

    async resolveConflict(id: string, filename: string, resolution: 'local' | 'remote'): Promise<void> {
        if (this.shouldFail) throw new Error('SyncManager Error');
    }

    getInstanceDirectory(): string {
        return '/tmp/test-workflows';
    }

    async start(): Promise<void> {
        if (this.shouldFail) throw new Error('SyncManager Error');
    }

    async stop(): Promise<void> {
        // No-op
    }
}

/**
 * Mock ConfigService for testing
 */
export class MockConfigService {
    private localConfig: any = {};
    private apiKeys: Record<string, string> = {};
    private instanceIdentifier: string | null = null;

    setLocalConfig(config: any) {
        this.localConfig = config;
    }

    setApiKey(host: string, apiKey: string) {
        this.apiKeys[this.normalizeHost(host)] = apiKey;
    }

    setInstanceIdentifier(identifier: string) {
        this.instanceIdentifier = identifier;
    }

    getLocalConfig(): any {
        return this.localConfig;
    }

    saveLocalConfig(config: any): void {
        this.localConfig = config;
    }

    getApiKey(host: string): string | undefined {
        return this.apiKeys[this.normalizeHost(host)];
    }

    saveApiKey(host: string, apiKey: string): void {
        this.apiKeys[this.normalizeHost(host)] = apiKey;
    }

    private normalizeHost(host: string): string {
        try {
            const url = new URL(host);
            return url.origin;
        } catch {
            return host.replace(/\/$/, '');
        }
    }

    hasConfig(): boolean {
        return !!(this.localConfig.host && this.getApiKey(this.localConfig.host));
    }

    async getOrCreateInstanceIdentifier(host: string): Promise<string> {
        if (this.instanceIdentifier) {
            return this.instanceIdentifier;
        }
        this.instanceIdentifier = 'test-instance-id';
        return this.instanceIdentifier;
    }

    getInstanceConfigPath(): string {
        return '/tmp/n8n-as-code-instance.json';
    }
}

/**
 * Create a mock workflow object for testing
 */
export function createMockWorkflow(overrides: Partial<any> = {}): any {
    return {
        id: '1',
        name: 'Test Workflow',
        active: true,
        nodes: [],
        connections: {},
        settings: {},
        staticData: null,
        tags: [],
        versionId: '1',
        ...overrides
    };
}

/**
 * Mock inquirer prompt responses
 */
export function mockInquirerPrompt(responses: any) {
    return vi.fn().mockResolvedValue(responses);
}

/**
 * Suppress console output during tests
 */
export function suppressConsole() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    beforeEach(() => {
        console.log = vi.fn();
        console.error = vi.fn();
        console.warn = vi.fn();
    });

    afterEach(() => {
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
    });
}
