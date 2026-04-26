import fs from 'fs';
import path from 'path';

export interface N8nacCommandRefs {
  cliCmd: string;
  skillsCmd: string;
  source: 'override' | 'env' | 'workspace-config' | 'published';
}

export interface ResolveN8nacCommandOptions {
  projectRoot?: string;
  distTag?: string;
  override?: string;
  env?: NodeJS.ProcessEnv;
}

interface DevCommandConfig {
  n8nacCommand?: string;
  commands?: {
    n8nac?: string;
  };
}

const DEV_CONFIG_FILENAMES = [
  '.n8nac-dev.json',
  '.n8n-as-code-dev.json',
];

export function resolveN8nacCommandRefs(options: ResolveN8nacCommandOptions = {}): N8nacCommandRefs {
  const env = options.env ?? process.env;
  const override = cleanCommand(options.override);
  if (override) return buildRefs(override, 'override');

  const envCommand = cleanCommand(env.N8NAC_COMMAND);
  if (envCommand) return buildRefs(envCommand, 'env');

  const workspaceCommand = cleanCommand(readWorkspaceCommand(options.projectRoot));
  if (workspaceCommand) return buildRefs(workspaceCommand, 'workspace-config');

  const published = options.distTag ? `npx --yes n8nac@${options.distTag}` : 'npx --yes n8nac';
  return buildRefs(published, 'published');
}

export function getN8nacDevConfigFilenames(): readonly string[] {
  return DEV_CONFIG_FILENAMES;
}

function buildRefs(cliCmd: string, source: N8nacCommandRefs['source']): N8nacCommandRefs {
  return {
    cliCmd,
    skillsCmd: `${cliCmd} skills`,
    source,
  };
}

function cleanCommand(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function readWorkspaceCommand(projectRoot: string | undefined): string | undefined {
  if (!projectRoot) return undefined;

  for (const filename of DEV_CONFIG_FILENAMES) {
    const filePath = path.join(projectRoot, filename);
    if (!fs.existsSync(filePath)) continue;

    try {
      const config = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DevCommandConfig;
      return config.commands?.n8nac ?? config.n8nacCommand;
    } catch {
      return undefined;
    }
  }

  return undefined;
}
