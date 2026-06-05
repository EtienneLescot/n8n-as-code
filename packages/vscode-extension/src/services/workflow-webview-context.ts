import type { ITestPlan, ITriggerInfo, IWorkflowStatus, TriggerType } from 'n8nac';
import { classifyExternalNavigationUrl } from '../utils/external-navigation.js';

export interface WorkflowWebviewEndpoints {
    triggerType?: TriggerType;
    testUrl?: string;
    productionUrl?: string;
    formTestUrl?: string;
    webhookTestUrl?: string;
    chatTestUrl?: string;
}

export interface WorkflowWebviewContext {
    workflow: IWorkflowStatus;
    workflowFilePath?: string;
    workflowUrl?: string;
    workflowReloadUrl?: string;
    endpoints: WorkflowWebviewEndpoints;
    triggerInfo?: ITriggerInfo;
}

export interface CreateWorkflowWebviewContextInput {
    workflow: IWorkflowStatus;
    workflowFilePath?: string;
    workflowUrl?: string;
    workflowReloadUrl?: string;
    testPlan?: ITestPlan;
}

export function createWorkflowWebviewContext(input: CreateWorkflowWebviewContextInput): WorkflowWebviewContext {
    return {
        workflow: input.workflow,
        workflowFilePath: input.workflowFilePath,
        workflowUrl: input.workflowUrl,
        workflowReloadUrl: input.workflowReloadUrl,
        endpoints: buildWorkflowWebviewEndpoints(input.testPlan),
        triggerInfo: input.testPlan?.triggerInfo || undefined,
    };
}

export function buildWorkflowWebviewEndpoints(testPlan?: ITestPlan): WorkflowWebviewEndpoints {
    const triggerType = testPlan?.triggerInfo?.type;
    const testUrl = safeBrowserUrl(testPlan?.endpoints.testUrl);
    const productionUrl = safeBrowserUrl(testPlan?.endpoints.productionUrl);
    const endpoints: WorkflowWebviewEndpoints = {
        triggerType,
        testUrl,
        productionUrl,
    };

    if (triggerType === 'form') endpoints.formTestUrl = testUrl;
    if (triggerType === 'webhook') endpoints.webhookTestUrl = testUrl;
    if (triggerType === 'chat') endpoints.chatTestUrl = testUrl;

    return compactEndpoints(endpoints);
}

export function normalizeWorkflowWebviewEndpoints(input?: WorkflowWebviewEndpoints | string): WorkflowWebviewEndpoints {
    if (!input) return {};
    if (typeof input === 'string') {
        const formTestUrl = safeBrowserUrl(input);
        return formTestUrl ? { triggerType: 'form', testUrl: formTestUrl, formTestUrl } : {};
    }
    return compactEndpoints({
        ...input,
        testUrl: safeBrowserUrl(input.testUrl),
        productionUrl: safeBrowserUrl(input.productionUrl),
        formTestUrl: safeBrowserUrl(input.formTestUrl),
        webhookTestUrl: safeBrowserUrl(input.webhookTestUrl),
        chatTestUrl: safeBrowserUrl(input.chatTestUrl),
    });
}

function safeBrowserUrl(url?: string): string | undefined {
    if (!url) return undefined;
    const decision = classifyExternalNavigationUrl(url);
    return decision.allowed ? decision.normalizedUrl : undefined;
}

function compactEndpoints(endpoints: WorkflowWebviewEndpoints): WorkflowWebviewEndpoints {
    return Object.fromEntries(Object.entries(endpoints).filter(([, value]) => value !== undefined && value !== '')) as WorkflowWebviewEndpoints;
}
