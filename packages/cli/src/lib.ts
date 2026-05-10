/**
 * Public library surface of @n8n-as-code/cli
 * Re-exports everything that was previously exposed by @n8n-as-code/sync
 * so consumers can simply change their import path without touching business logic.
 */
export * from './core/index.js';
export * from '@n8n-as-code/workflow-core';
export * from '@n8n-as-code/manager-adapter';
export {
    ConfigService,
    type ILocalConfig,
    type IInstanceProfile,
    type IInstanceVerification,
    type IInstanceVerificationStatus,
    type IInstanceVerificationClient,
    type IUpsertInstanceConfigInput,
    type IUpsertInstanceConfigResult,
    type ISelectInstanceResult,
    type IWorkspaceConfig,
    type IManagedEnvironmentTarget,
    type IExternalEnvironmentTarget,
    type IEnvironmentTarget,
    type IWorkspaceEnvironment,
    type IPersistedWorkspaceConfigV4,
    type IResolvedWorkspaceEnvironment,
    type IWorkspaceMigrationPlan,
    type IWorkspaceMigrationResult,
    type IWorkspaceMigrationOptions,
    type IWorkspaceMigrationReport,
    type IWorkspaceMigrationReportOperation,
    type IWorkspaceMigrationReportInstance,
} from './services/config-service.js';
