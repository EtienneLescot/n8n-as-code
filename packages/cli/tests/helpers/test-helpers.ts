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
 * Mock SyncManager for testing — matches the git-like API surface.
 */
export class MockSyncManager extends EventEmitter {
    private mockWorkflowsList: any[] = [];
    private shouldFail = false;

    constructor(public client: any, public config: any) {
        super();
    }

    setMockWorkflowsList(workflows: any[]) {
        this.mockWorkflowsList = workflows;
    }

    setShouldFail(shouldFail: boolean) {
        this.shouldFail = shouldFail;
    }

    /** Mirror of SyncManager.listWorkflows() — lightweight listing */
    async listWorkflows(_options?: { fetchRemote?: boolean }): Promise<any[]> {
        if (this.shouldFail) throw new Error('SyncManager Error');
        return this.mockWorkflowsList;
    }

    /** Mirror of SyncManager.getSingleWorkflowDetailedStatus() */
    async getSingleWorkflowDetailedStatus(_workflowId: string, _filename: string): Promise<any> {
        if (this.shouldFail) throw new Error('SyncManager Error');
        return { status: 'TRACKED', localExists: true, remoteExists: true };
    }

    /** Mirror of SyncManager.pull() */
    async pull(_workflowId: string): Promise<void> {
        if (this.shouldFail) throw new Error('SyncManager Error');
        this.emit('log', 'Pulling workflow...');
    }

    /** Mirror of SyncManager.push() */
    async push(_filename: string): Promise<string> {
        if (this.shouldFail) throw new Error('SyncManager Error');
        this.emit('log', 'Pushing workflow...');
        return '1';
    }

    /** Mirror of SyncManager.fetch() */
    async fetch(_workflowId: string): Promise<boolean> {
        if (this.shouldFail) throw new Error('SyncManager Error');
        return true;
    }

    /** Mirror of SyncManager.refreshRemoteState() */
    async refreshRemoteState(): Promise<void> {
        if (this.shouldFail) throw new Error('SyncManager Error');
    }

    async resolveConflict(id: string, filename: string, resolution: 'local' | 'remote'): Promise<void> {
        if (this.shouldFail) throw new Error('SyncManager Error');
    }

    getInstanceDirectory(): string {
        return '/tmp/test-workflows';
    }

    async startWatch(): Promise<void> {
        if (this.shouldFail) throw new Error('SyncManager Error');
    }

    stopWatch(): void {
        // No-op
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
    private instances: any[] = [];
    private activeInstanceId: string | undefined;
    private apiKeys: Record<string, string> = {};
    private instanceApiKeys: Record<string, string> = {};
    private instanceIdentifier: string | null = null;

    setLocalConfig(config: any) {
        this.localConfig = config;
        if (config?.id) {
            this.instances = [config];
            this.activeInstanceId = config.id;
        }
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

    saveLocalConfig(config: any, options?: { instanceId?: string; instanceName?: string }): any {
        this.localConfig = config;
        const instanceId = options?.instanceId || this.activeInstanceId || 'test-instance';
        const existing = this.instances.find((instance) => instance.id === instanceId);
        const next = {
            ...existing,
            ...config,
            id: instanceId,
            name: options?.instanceName || existing?.name || 'Test instance',
        };
        this.instances = [...this.instances.filter((instance) => instance.id !== instanceId), next];
        this.activeInstanceId = instanceId;
        return next;
    }

    createInstance(config: any, options?: { instanceName?: string; setActive?: boolean }): any {
        const instanceId = `test-instance-${this.instances.length + 1}`;
        return this.saveLocalConfig(config, {
            instanceId,
            instanceName: options?.instanceName,
        });
    }

    updateInstance(config: any, options?: { instanceId?: string; instanceName?: string; setActive?: boolean }): any {
        return this.saveLocalConfig(config, {
            instanceId: options?.instanceId || this.activeInstanceId,
            instanceName: options?.instanceName,
        });
    }

    getApiKey(host: string, instanceId?: string): string | undefined {
        if (instanceId && this.instanceApiKeys[instanceId]) {
            return this.instanceApiKeys[instanceId];
        }
        return this.apiKeys[this.normalizeHost(host)];
    }

    saveApiKey(host: string, apiKey: string, instanceId?: string): void {
        this.apiKeys[this.normalizeHost(host)] = apiKey;
        if (instanceId) {
            this.instanceApiKeys[instanceId] = apiKey;
        }
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

    getActiveInstance(): any {
        return this.instances.find((instance) => instance.id === this.activeInstanceId);
    }

    getActiveInstanceId(): string | undefined {
        return this.activeInstanceId;
    }

    listInstances(): any[] {
        return this.instances;
    }

    setActiveInstance(instanceId: string): any {
        this.activeInstanceId = instanceId;
        const active = this.instances.find((instance) => instance.id === instanceId);
        if (active) {
            this.localConfig = active;
        }
        return active;
    }

    selectInstance(instanceId: string): any {
        return this.setActiveInstance(instanceId);
    }

    deleteInstance(instanceId: string): { deletedInstance: any; activeInstance?: any } {
        const deletedInstance = this.instances.find((instance) => instance.id === instanceId);
        if (!deletedInstance) {
            throw new Error(`Unknown instance config: ${instanceId}`);
        }

        this.instances = this.instances.filter((instance) => instance.id !== instanceId);
        delete this.instanceApiKeys[instanceId];

        if (this.activeInstanceId === instanceId) {
            this.activeInstanceId = this.instances[0]?.id;
            this.localConfig = this.instances[0] || {};
        }

        return {
            deletedInstance,
            activeInstance: this.instances.find((instance) => instance.id === this.activeInstanceId),
        };
    }

    async getOrCreateInstanceIdentifier(host: string, _instanceId?: string): Promise<string> {
        if (this.instanceIdentifier) {
            return this.instanceIdentifier;
        }
        this.instanceIdentifier = 'test-instance-id';
        return this.instanceIdentifier;
    }

    getInstanceConfigPath(): string {
        return '/tmp/n8nac-config.json';
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
