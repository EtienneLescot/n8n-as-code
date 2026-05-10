import {
    ConfigService,
    type IWorkspaceMigrationReport,
} from './config-service.js';

export type WorkspaceMigrationLegacySettings = { host?: string; apiKey?: string } | undefined;

export interface IWorkspaceMigrationFacadeOptions {
    workspaceRoot?: string;
    configService?: ConfigService;
    legacySettingsProvider?: () => WorkspaceMigrationLegacySettings | Promise<WorkspaceMigrationLegacySettings>;
}

export interface IWorkspaceMigrationFacadeRunOptions {
    write?: boolean;
}

export class WorkspaceMigrationFacade {
    private readonly configService: ConfigService;
    private readonly legacySettingsProvider?: IWorkspaceMigrationFacadeOptions['legacySettingsProvider'];

    constructor(options: IWorkspaceMigrationFacadeOptions = {}) {
        this.configService = options.configService ?? new ConfigService(options.workspaceRoot);
        this.legacySettingsProvider = options.legacySettingsProvider;
    }

    inspect(): IWorkspaceMigrationReport | undefined {
        const plan = this.configService.detectWorkspaceMigration();
        return plan ? this.configService.workspaceMigrationPlanToReport(plan) : undefined;
    }

    async migrate(options: IWorkspaceMigrationFacadeRunOptions = {}): Promise<IWorkspaceMigrationReport> {
        const plan = this.configService.detectWorkspaceMigration();
        if (!plan) {
            return this.configService.toWorkspaceMigrationReport(this.configService.migrateWorkspaceConfiguration({ write: false }));
        }

        const legacyApiKeyFallback = options.write && plan.legacyMigration && this.legacySettingsProvider
            ? await this.legacySettingsProvider()
            : undefined;

        const result = this.configService.migrateWorkspaceConfiguration({
            write: Boolean(options.write),
            legacyApiKeyFallback,
        });
        return this.configService.toWorkspaceMigrationReport(result);
    }
}
