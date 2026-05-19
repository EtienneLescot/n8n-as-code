import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveN8nacCommandRefs, type N8nacCommandRefs } from './cli-command-resolver.js';

// Helper to get __dirname in ESM
const _filename = typeof __filename !== 'undefined'
  ? __filename
  : (typeof import.meta !== 'undefined' && typeof import.meta.url === 'string' ? fileURLToPath(import.meta.url) : '');

const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : (_filename ? path.dirname(_filename as string) : '');

export class AiContextGenerator {
  constructor() { }

  private getCommandRefs(distTag?: string, cliCommandOverride?: string, projectRoot?: string): N8nacCommandRefs {
    return resolveN8nacCommandRefs({
      projectRoot,
      distTag,
      override: cliCommandOverride,
      env: projectRoot ? process.env : {},
    });
  }

  getAgentSkillContent(
    skillName: 'n8n-architect',
    distTag?: string,
    options: { cliCommandOverride?: string; managerCommandOverride?: string } = {},
    projectRoot?: string,
  ): string {
    const { cliCmd, skillsCmd } = this.getCommandRefs(distTag, options.cliCommandOverride, projectRoot);
    const managerCmd = resolveN8nManagerCommand(distTag, options.managerCommandOverride, projectRoot ? process.env : {});
    const contextRootHint = projectRoot
      ? `Generated context root hint: \`${path.resolve(projectRoot)}\`. If this path exists, run workspace commands from there.`
      : 'Generated context root hint: not embedded. Use the shell launch directory or the workspace path explicitly given by the user.';
    return this.readCanonicalAgentSkill(skillName)
      .replaceAll('{{N8NAC_CMD}}', cliCmd)
      .replaceAll('{{N8NAC_SKILLS_CMD}}', skillsCmd)
      .replaceAll('{{N8N_MANAGER_CMD}}', managerCmd)
      .replaceAll('{{N8NAC_CONTEXT_ROOT_HINT}}', contextRootHint);
  }

  private readCanonicalAgentSkill(skillName: string): string {
    const candidates = [
      path.resolve(_dirname, '../../src/agent-skills', skillName, 'SKILL.md'),
      path.resolve(_dirname, 'agent-skills', skillName, 'SKILL.md'),
      path.resolve(_dirname, '../agent-skills', skillName, 'SKILL.md'),
      path.resolve(_dirname, '../../agent-skills', skillName, 'SKILL.md'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf8');
      }
    }

    throw new Error(`Canonical agent skill not found: ${skillName}`);
  }

  async generate(
    projectRoot: string,
    n8nVersion: string = "Unknown",
    distTag?: string,
    options: { cliCommandOverride?: string; managerCommandOverride?: string; cliVersion?: string } = {},
  ): Promise<void> {
    const agentsContent = this.getAgentsContent(n8nVersion, distTag, options, projectRoot);

    // 1. AGENTS.md (lightweight context-root bootstrap)
    this.injectOrUpdate(path.join(projectRoot, 'AGENTS.md'), agentsContent, true);

    // 2. VS Code/Copilot workspace agents plus portable skills for other agent runtimes.
    this.removeLegacySplitSkillArtifacts(projectRoot);
    this.materializeWorkspaceAgents(projectRoot, distTag, options);
    this.materializeAgentSkills(projectRoot, distTag, options);
  }

  private removeLegacySplitSkillArtifacts(projectRoot: string): void {
    fs.rmSync(path.join(projectRoot, '.github', 'agents', 'n8n-manager.agent.md'), { force: true });
    fs.rmSync(path.join(projectRoot, '.agents', 'skills', 'n8n-manager'), { recursive: true, force: true });
  }

  private materializeWorkspaceAgents(
    projectRoot: string,
    distTag?: string,
    options: { cliCommandOverride?: string; managerCommandOverride?: string } = {},
  ): void {
    const agentsRoot = path.join(projectRoot, '.github', 'agents');
    const agentNames = ['n8n-architect'] as const;
    fs.mkdirSync(agentsRoot, { recursive: true });
    for (const agentName of agentNames) {
      fs.writeFileSync(
        path.join(agentsRoot, `${agentName}.agent.md`),
        this.getWorkspaceAgentContent(agentName, distTag, options, projectRoot),
      );
    }
  }

  private materializeAgentSkills(
    projectRoot: string,
    distTag?: string,
    options: { cliCommandOverride?: string; managerCommandOverride?: string } = {},
  ): void {
    const skillsRoot = path.join(projectRoot, '.agents', 'skills');
    const skillNames = ['n8n-architect'] as const;
    for (const skillName of skillNames) {
      const content = this.getAgentSkillContent(skillName, distTag, options, projectRoot);
      const skillDir = path.join(skillsRoot, skillName);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        content,
      );
    }
  }

  private getWorkspaceAgentContent(
    agentName: 'n8n-architect',
    distTag?: string,
    options: { cliCommandOverride?: string; managerCommandOverride?: string } = {},
    projectRoot?: string,
  ): string {
    return this.getAgentSkillContent(agentName, distTag, options, projectRoot)
      .replaceAll('Use this skill', 'Use this workspace agent');
  }

  private injectOrUpdate(filePath: string, content: string, isMarkdownFile: boolean = false): void {
    const startMarker = isMarkdownFile ? '<!-- n8n-as-code-start -->' : '### 🤖 n8n-as-code-start';
    const endMarker = isMarkdownFile ? '<!-- n8n-as-code-end -->' : '### 🤖 n8n-as-code-end';

    const block = `\n${startMarker}\n${content.trim()}\n${endMarker}\n`;

    if (!fs.existsSync(filePath)) {
      // Create new file with header if it's AGENTS.md
      const header = filePath.endsWith('AGENTS.md') ? '# 🤖 AI Agents Guidelines\n' : '';
      fs.writeFileSync(filePath, header + block.trim() + '\n');
      return;
    }

    let existing = fs.readFileSync(filePath, 'utf8');
    const startIdx = existing.indexOf(startMarker);
    const endIdx = existing.indexOf(endMarker);

    if (startIdx !== -1 && endIdx !== -1) {
      // Update existing block while preserving what's before/after
      const before = existing.substring(0, startIdx);
      const after = existing.substring(endIdx + endMarker.length);
      fs.writeFileSync(filePath, before + block.trim() + after);
    } else {
      // Append to end of existing file
      fs.writeFileSync(filePath, existing.trim() + '\n' + block);
    }
  }

  private getAgentsContent(
    n8nVersion: string,
    distTag?: string,
    options: { cliCommandOverride?: string; managerCommandOverride?: string; cliVersion?: string } = {},
    projectRoot?: string,
  ): string {
    const { cliCmd, skillsCmd } = this.getCommandRefs(distTag, options.cliCommandOverride, projectRoot);
    const managerCmd = resolveN8nManagerCommand(distTag, options.managerCommandOverride, process.env);
    const versionStamp = options.cliVersion ? [`<!-- n8nac-version: ${options.cliVersion} -->`, ``] : [];
    const contextRoot = projectRoot ? path.resolve(projectRoot) : process.cwd();
    return [
      ...versionStamp,
      `## n8n-as-code Context Root`,
      ``,
      `This file is generated by \`${cliCmd} update-ai\`. It is bootstrap context only, not a configuration source of truth.`,
      ``,
      `- Context root: \`${contextRoot}\``,
      `- n8n version at generation time: ${n8nVersion}`,
      `- n8nac command: \`${cliCmd}\``,
      `- n8n-manager command: \`${managerCmd}\``,
      `- n8n knowledge command: \`${skillsCmd}\``,
      ``,
      `Run workspace commands from this context root. Do not \`cd\` into the n8n-as-code source repository, n8n-manager source repository, plugin directory, or package directory to run \`${cliCmd} workspace ...\`, \`${cliCmd} list\`, \`${cliCmd} pull\`, \`${cliCmd} push\`, or \`${cliCmd} update-ai\`.`,
      ``,
      `---`,
      ``,
      `## Required Local Agent`,
      ``,
      `A VS Code and GitHub Copilot-compatible agent is generated here:`,
      ``,
      `- \`.github/agents/n8n-architect.agent.md\``,
      ``,
      `A portable skill fallback is also generated for runtimes that do not read \`.github/agents\`:`,
      ``,
      `- \`.agents/skills/n8n-architect/SKILL.md\``,
      ``,
      `If your agent runtime supports workspace agents, use the \`.github/agents/*.agent.md\` file. If it supports skills instead, load the skill file. Otherwise, treat these files as mandatory instructions.`,
      ``,
      `---`,
      ``,
      `## Source Of Truth`,
      ``,
      `Do not infer configuration from this file. It intentionally avoids storing the effective instance, project, sync folder, or workflow directory.`,
      ``,
      `n8nac backend resolution remains the only source of effective workspace state.`,
      `- Workspace environments live in \`n8nac-config.json\` and are managed by \`${cliCmd} env ...\`.`,
      `- Managed local runtime state and secrets live in n8n-manager storage and are managed by \`${managerCmd} ...\`.`,
      `- The effective context is resolved by the backend.`,
      ``,
      `Before any n8n workflow command, run migration dry-run first, then workspace status only after migration is not required or has been applied:`,
      ``,
      `\`\`\`bash`,
      `cd ${contextRoot}`,
      `${cliCmd} workspace migrate --json`,
      `${cliCmd} workspace status --json`,
      `\`\`\``,
      ``,
      `Use the returned \`workflowsPath\` exactly as provided. It is the configured workflow directory for the active environment.`,
      `Do not reconstruct \`workflowsPath\` from environment name/id, instance identifier, instance user identifier, project id, project name, or legacy sync fields.`,
      ``,
      `---`,
      ``,
      `## Safe Commands`,
      ``,
      `- Primary workspace, environment, sync, validation, push, and pull work: \`${cliCmd} ...\``,
      `- Local managed runtime lifecycle and tunnels only: \`${managerCmd} ...\``,
      `- Workspace status and migration: \`${cliCmd} workspace ...\``,
      `- Workflow sync and validation: \`${cliCmd} ...\``,
      `- Node knowledge and schema lookup: \`${skillsCmd} ...\``,
      ``,
      `Never write \`n8nac-config.json\`, \`~/.n8n-manager\`, or n8n-manager secret files by hand.`,
    ].join('\n');
  }

  getSkillContent(): string {
    return this.getAgentSkillContent('n8n-architect');
  }

  getOpenClawSkillContent(): string {
    return this.getAgentSkillContent('n8n-architect');
  }

}

function resolveN8nManagerCommand(
  distTag?: string,
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = override?.trim() || env.N8N_MANAGER_COMMAND?.trim();
  if (explicit) {
    return explicit;
  }
  return distTag
    ? `npx --yes @n8n-as-code/n8n-manager@${distTag}`
    : 'npx --yes @n8n-as-code/n8n-manager';
}
