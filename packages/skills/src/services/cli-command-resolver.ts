import fs from 'fs';
import path from 'path';

export interface N8nacCommandRefs {
  cliCmd: string;
  skillsCmd: string;
  source: 'override' | 'env' | 'workspace-config' | 'local-install' | 'published';
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

/**
 * Entry point of a locally installed n8nac, relative to the project root.
 * Kept as segments so the filesystem probe and the emitted command cannot drift apart.
 */
const LOCAL_ENTRYPOINT_SEGMENTS = ['node_modules', 'n8nac', 'dist', 'index.js'];

export function resolveN8nacCommandRefs(options: ResolveN8nacCommandOptions = {}): N8nacCommandRefs {
  const env = options.env ?? process.env;
  const override = cleanCommand(options.override);
  if (override) return buildRefs(override, 'override');

  const envCommand = cleanCommand(env.N8NAC_COMMAND);
  if (envCommand) return buildRefs(envCommand, 'env');

  const workspaceCommand = cleanCommand(readWorkspaceCommand(options.projectRoot));
  if (workspaceCommand) return buildRefs(workspaceCommand, 'workspace-config');

  const localCommand = readLocalInstallCommand(options.projectRoot);
  if (localCommand) return buildRefs(localCommand, 'local-install');

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

/**
 * A locally installed n8nac, named directly instead of through npx. npx pays npm's own
 * startup on every invocation; naming the entry point does not, and an agent makes tens of
 * calls per task.
 *
 * The emitted path is relative, and deliberately so on three counts:
 * - the generated context is committed in user projects, so an absolute path would name a
 *   directory that exists on one machine and breaks for every teammate and in CI;
 * - a relative path carries no spaces, so it needs no shell quoting and survives cmd.exe,
 *   which does not strip the POSIX single quotes the CLI's own quoting helper emits;
 * - the generated context already requires workspace commands to run from the worktree
 *   root, which is the only precondition a relative path has.
 *
 * Returns undefined without a projectRoot. That guard is load-bearing: the packaged skill
 * mirrors are pre-rendered with no project root and diff-gated in CI, so anything
 * machine-specific leaking into them turns the build red.
 */
function readLocalInstallCommand(projectRoot: string | undefined): string | undefined {
  if (!projectRoot) return undefined;

  const entrypoint = path.join(projectRoot, ...LOCAL_ENTRYPOINT_SEGMENTS);
  return fs.existsSync(entrypoint)
    ? `node ${LOCAL_ENTRYPOINT_SEGMENTS.join('/')}`
    : undefined;
}
