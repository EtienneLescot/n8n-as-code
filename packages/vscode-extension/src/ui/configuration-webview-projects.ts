import { ConfigService, N8nApiClient } from 'n8nac';
import { getCanonicalProjectName, getProjectDetail, getProjectDisplayLabel } from '../utils/project-display.js';

type UiProject = {
  id: string;
  name: string;
  type?: string;
  detail?: string;
  displayName?: string;
};

type ManagerProjectFacade = {
  listProjects(input: {
    workspaceRoot?: string;
    instanceId?: string;
    syncFolderDefault: 'workspace';
    consumer: 'vscode';
    autoStart: true;
  }): Promise<Array<{ id: string; name?: string; title?: string; displayName?: string; label?: string; type?: string }>>;
};

export type ProjectsLoadedMessage = {
  type: 'projectsLoaded';
  scope: string;
  requestId: number;
  requestKey?: string;
  projects: UiProject[];
  selectedProjectId: string;
  selectedProjectName: string;
};

const PERSONAL_PROJECT: UiProject = {
  id: 'personal',
  name: 'Personal',
  type: 'personal',
  detail: 'Type: personal | ID: personal',
  displayName: 'Personal',
};

function toUiProject(project: { id: string; name?: string; title?: string; displayName?: string; label?: string; type?: string; }): UiProject {
  const name = project.name || project.title || project.displayName || project.label || '';
  const displayable = { id: project.id, name, type: project.type };
  return {
    id: project.id,
    name: getCanonicalProjectName(displayable),
    type: project.type,
    detail: getProjectDetail(displayable),
    displayName: getProjectDisplayLabel(displayable),
  };
}

function dedupeUiProjects(projects: UiProject[]): UiProject[] {
  const byId = new Map<string, UiProject>();
  for (const project of projects) {
    if (!project.id) continue;
    const externalInstance = byId.get(project.id);
    if (!externalInstance || (!externalInstance.name && project.name) || externalInstance.id === 'personal') {
      byId.set(project.id, project);
    }
  }

  return [...byId.values()];
}

async function loadProjectsFromApi(host: string, apiKey: string): Promise<UiProject[]> {
  const client = new N8nApiClient({ host, apiKey });
  await client.assertApiAccess();
  return (await client.getProjects()).map(toUiProject);
}

function normalizeHost(host: string): string {
  const trimmed = (host || '').trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function envVarSlug(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function readWorkspaceTargetApiKey(targetId: string, targetName: string): string | undefined {
  const candidates = [
    `N8NAC_TARGET_${envVarSlug(targetId)}_API_KEY`,
    `N8NAC_TARGET_${envVarSlug(targetName)}_API_KEY`,
  ];
  for (const key of candidates) {
    const value = process.env[key]?.trim().replace(/^["']|["']$/g, '');
    if (value) return value;
  }
  return undefined;
}

export async function loadProjectsForConfigurationWebview(
  payload: Record<string, unknown>,
  options: {
    workspaceRoot?: string;
    workspaceFacade: ManagerProjectFacade;
    globalFacade: ManagerProjectFacade;
  },
): Promise<ProjectsLoadedMessage> {
  const scope = String(payload.scope || 'workspace');
  const requestId = Number(payload.requestId || 0);
  const requestKey = String(payload.requestKey || '');
  const selectedProjectId = String(payload.projectId || '');
  const selectedProjectName = String(payload.projectName || '');
  const postProjectsLoaded = (projects: UiProject[], fallbackProjectId = ''): ProjectsLoadedMessage => ({
    type: 'projectsLoaded',
    scope,
    requestId,
    requestKey,
    projects: dedupeUiProjects(projects),
    selectedProjectId: selectedProjectId || fallbackProjectId,
    selectedProjectName: selectedProjectName || (fallbackProjectId === 'personal' ? 'Personal' : ''),
  });

  let instanceId = String(payload.instanceId || '').trim() || undefined;
  const environmentTargetId = String(payload.environmentTargetId || '').trim();
  if (!instanceId && options.workspaceRoot && environmentTargetId) {
    const configService = new ConfigService(options.workspaceRoot);
    const environmentId = String(payload.environmentId || '').trim();
    const environment = environmentId ? configService.getEnvironment(environmentId) : undefined;
    const targetChanged = Boolean(environment && environmentTargetId && environment.environmentTargetId !== environmentTargetId);
    const target = configService.getInstanceTarget(environmentTargetId || environment?.environmentTargetId || '');
    if (environmentId && !targetChanged) {
      const resolvedEnvironment = await configService.prepareEnvironment(environmentId);
      if (!resolvedEnvironment.apiKey) throw new Error(`Environment "${resolvedEnvironment.environmentName}" needs an API key before projects can be loaded.`);
      return postProjectsLoaded(await loadProjectsFromApi(resolvedEnvironment.host, resolvedEnvironment.apiKey));
    }
    if (target.kind === 'managed-instance') instanceId = target.managedInstanceId;
    if (target.kind === 'external-instance') {
      const apiKey = readWorkspaceTargetApiKey(target.id, target.name) || configService.getWorkspaceTargetApiKey(target.id) || configService.getApiKey(target.url);
      if (!apiKey) {
        if (scope === 'environment') throw new Error('Missing API key. Add an API key before selecting project or sync settings.');
        return postProjectsLoaded([PERSONAL_PROJECT], 'personal');
      }
      return postProjectsLoaded(await loadProjectsFromApi(target.url, apiKey));
    }
  }

  const host = instanceId ? '' : normalizeHost(String(payload.host || ''));
  const apiKey = String(payload.apiKey || '').trim();
  if (host) {
    if (!apiKey) {
      if (scope === 'environment') throw new Error('Missing API key. Add an API key before selecting project or sync settings.');
      return postProjectsLoaded([PERSONAL_PROJECT], 'personal');
    }
    return postProjectsLoaded(await loadProjectsFromApi(host, apiKey));
  }

  const projectFacade = scope === 'environment' && instanceId
    ? options.globalFacade
    : options.workspaceFacade;
  const uiProjects = (await projectFacade.listProjects({
    workspaceRoot: scope === 'environment' && instanceId ? undefined : options.workspaceRoot,
    instanceId,
    syncFolderDefault: 'workspace',
    consumer: 'vscode',
    autoStart: true,
  })).map(toUiProject);
  return postProjectsLoaded(uiProjects);
}
