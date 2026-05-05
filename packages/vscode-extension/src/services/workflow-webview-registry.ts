export interface WorkflowWebviewReloadTarget {
    getWorkflowId(): string | undefined;
    reloadWorkflow(): Thenable<boolean> | Promise<boolean> | boolean;
    describeTarget?(): string;
}

export class WorkflowWebviewRegistry {
    private readonly targets = new Set<WorkflowWebviewReloadTarget>();
    private debugLogger: ((message: string) => void) | undefined;

    setDebugLogger(logger: ((message: string) => void) | undefined): void {
        this.debugLogger = logger;
    }

    register(target: WorkflowWebviewReloadTarget): { dispose(): void } {
        this.targets.add(target);
        this.debugLogger?.(`[workflow-registry] register target=${target.describeTarget?.() || 'unknown'} workflowId=${target.getWorkflowId() || 'none'} total=${this.targets.size}`);
        return {
            dispose: () => {
                this.targets.delete(target);
                this.debugLogger?.(`[workflow-registry] dispose target=${target.describeTarget?.() || 'unknown'} total=${this.targets.size}`);
            },
        };
    }

    reloadIfMatching(workflowId: string): boolean {
        let reloaded = false;
        this.debugLogger?.(`[workflow-registry] reloadIfMatching workflowId=${workflowId} targets=${this.targets.size}`);
        for (const target of [...this.targets]) {
            const targetWorkflowId = target.getWorkflowId();
            if (targetWorkflowId !== workflowId) {
                this.debugLogger?.(`[workflow-registry] skip target=${target.describeTarget?.() || 'unknown'} targetWorkflowId=${targetWorkflowId || 'none'}`);
                continue;
            }
            reloaded = true;
            this.debugLogger?.(`[workflow-registry] reloading target=${target.describeTarget?.() || 'unknown'} workflowId=${workflowId}`);
            void Promise.resolve(target.reloadWorkflow()).catch(() => {
                // Webview reload is best-effort; stale targets unregister on dispose.
            });
        }
        this.debugLogger?.(`[workflow-registry] reloadIfMatching result workflowId=${workflowId} reloaded=${reloaded}`);
        return reloaded;
    }
}

export const workflowWebviewRegistry = new WorkflowWebviewRegistry();
