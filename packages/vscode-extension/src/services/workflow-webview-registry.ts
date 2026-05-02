export interface WorkflowWebviewReloadTarget {
    getWorkflowId(): string | undefined;
    reloadWorkflow(): Thenable<boolean> | Promise<boolean> | boolean;
}

export class WorkflowWebviewRegistry {
    private readonly targets = new Set<WorkflowWebviewReloadTarget>();

    register(target: WorkflowWebviewReloadTarget): { dispose(): void } {
        this.targets.add(target);
        return {
            dispose: () => {
                this.targets.delete(target);
            },
        };
    }

    reloadIfMatching(workflowId: string): boolean {
        let reloaded = false;
        for (const target of [...this.targets]) {
            if (target.getWorkflowId() !== workflowId) {
                continue;
            }
            reloaded = true;
            void Promise.resolve(target.reloadWorkflow()).catch(() => {
                // Webview reload is best-effort; stale targets unregister on dispose.
            });
        }
        return reloaded;
    }
}

export const workflowWebviewRegistry = new WorkflowWebviewRegistry();
