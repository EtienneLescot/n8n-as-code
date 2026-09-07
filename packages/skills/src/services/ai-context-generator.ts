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

export interface NativeMcpLevelContext {
    /** Effective native MCP usage level (0 = off) for the active environment. */
    level: number;
    /** Display name of the active environment, when known. */
    environmentName?: string;
}

const NATIVE_MCP_LEVEL_LABELS: Record<number, string> = {
    0: 'off (bundled ontology only)',
    1: 'schema sync (instance ontology overlay)',
    2: 'live validation at push',
    3: 'read-only discovery',
};

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
    options: { cliCommandOverride?: string; managerCommandOverride?: string; nativeMcp?: NativeMcpLevelContext } = {},
    projectRoot?: string,
  ): string {
    const { cliCmd, skillsCmd } = this.getCommandRefs(distTag, options.cliCommandOverride, projectRoot);
    const managerCmd = resolveN8nManagerCommand(distTag, options.managerCommandOverride, projectRoot ? process.env : {});
    const contextRootHint = 'Generated context root hint: not embedded. Use the shell launch directory or the workspace path explicitly given by the user.';
    const skill = this.readCanonicalAgentSkill(skillName)
      .replaceAll('{{N8NAC_CMD}}', cliCmd)
      .replaceAll('{{N8NAC_SKILLS_CMD}}', skillsCmd)
      .replaceAll('{{N8N_MANAGER_CMD}}', managerCmd)
      .replaceAll('{{N8NAC_CONTEXT_ROOT_HINT}}', contextRootHint);
    // The level block is per-environment state: only embedded when the caller
    // resolved an environment, so neutral generation stays byte-identical to
    // the canonical packaged skills.
    return options.nativeMcp ? skill + this.nativeMcpLevelNote(options.nativeMcp) : skill;
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
    options: { cliCommandOverride?: string; managerCommandOverride?: string; cliVersion?: string; nativeMcp?: NativeMcpLevelContext } = {},
  ): Promise<void> {
    const agentsContent = this.getAgentsContent(n8nVersion, distTag, options, projectRoot);

    // 1. AGENTS.md (lightweight context-root bootstrap)
    this.injectOrUpdate(path.join(projectRoot, 'AGENTS.md'), agentsContent, true);

    // 2. VS Code/Copilot workspace agents plus portable skills for other agent runtimes.
    this.removeLegacySplitSkillArtifacts(projectRoot);
    this.materializeWorkspaceAgents(projectRoot, distTag, options);
    this.materializeAgentSkills(projectRoot, distTag, options);
  }

  /**
   * Per-environment native MCP usage-level note, appended to generated agent
   * context (AGENTS.md, workspace agent, portable skill). Documents which
   * instance calls the toolchain may make — it never grants the agent new
   * permissions and never delegates the level choice to the agent.
   */
  private nativeMcpLevelNote(nativeMcp?: NativeMcpLevelContext): string {
    const active = nativeMcp && Number.isInteger(nativeMcp.level)
      ? `\n\nThe pinned environment${nativeMcp.environmentName ? ` "${nativeMcp.environmentName}"` : ''} uses native n8n MCP at level ${nativeMcp.level} — ${NATIVE_MCP_LEVEL_LABELS[nativeMcp.level] ?? 'unknown'}.`
      : '';
    return [
      ``,
      `## Native MCP Usage Level${active}`,
      ``,
      `Native MCP usage is a cumulative ladder, configured per environment (\`n8nac native-mcp configure --level 1|2|3\`):`,
      ``,
      `- level 0 (off) — bundled ontology only, no instance calls. DISCOURAGED except offline: validation runs against the bundled schema only and may drift from the instance. Upgrade with \`n8nac native-mcp configure --level 1\` (or higher).`,
      `- level 1 (schema sync) — n8nac refreshes a per-instance schema overlay, then validates locally. Do not call instance MCP tools yourself; \`n8nac push\` may be blocked by validation errors — fix the reported node parameters and retry.`,
      `- level 2 (live validation) — \`n8nac push\` validates against the instance before any write. Same fix-and-retry loop; never bypass with \`N8NAC_PUSH_SKIP_VALIDATION\` unless the user explicitly asks.`,
      `- level 3 (read-only discovery) — instance read tools may be available through the toolchain. You must NEVER list, search, or inspect existing workflows unless the user explicitly asks; only interact with workflows you create.`,
      ``,
      `You must never change the level yourself (\`native-mcp configure\`); if validation is degraded, report the toolchain message verbatim.`,
    ].join('\n');
  }

  private removeLegacySplitSkillArtifacts(projectRoot: string): void {
    fs.rmSync(path.join(projectRoot, '.github', 'agents', 'n8n-manager.agent.md'), { force: true });
    fs.rmSync(path.join(projectRoot, '.agents', 'skills', 'n8n-manager'), { recursive: true, force: true });
  }

  private materializeWorkspaceAgents(
    projectRoot: string,
    distTag?: string,
    options: { cliCommandOverride?: string; managerCommandOverride?: string; nativeMcp?: NativeMcpLevelContext } = {},
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
    options: { cliCommandOverride?: string; managerCommandOverride?: string; nativeMcp?: NativeMcpLevelContext } = {},
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
    options: { cliCommandOverride?: string; managerCommandOverride?: string; nativeMcp?: NativeMcpLevelContext } = {},
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
    options: { cliCommandOverride?: string; managerCommandOverride?: string; cliVersion?: string; nativeMcp?: NativeMcpLevelContext } = {},
    projectRoot?: string,
  ): string {
    const { cliCmd, skillsCmd } = this.getCommandRefs(distTag, options.cliCommandOverride, projectRoot);
    const managerCmd = resolveN8nManagerCommand(distTag, options.managerCommandOverride, process.env);
    const versionStamp = options.cliVersion ? [`<!-- n8nac-version: ${options.cliVersion} -->`, ``] : [];
    return [
      ...versionStamp,
      `## n8n-as-code Context Root`,      ``,
      `This file is generated by \`${cliCmd} update-ai\`. It is bootstrap context only, not a configuration source of truth.`,
      ``,
      `- Context root: the current Git worktree root.`,
      `- n8n version at generation time: ${n8nVersion}`,
      `- n8nac command: \`${cliCmd}\``,
      `- n8n-manager command: \`${managerCmd}\``,
      `- n8n knowledge command: \`${skillsCmd}\``,
      ``,
      `Run workspace commands from the current Git worktree root. Do not \`cd\` into the n8n-as-code source repository, n8n-manager source repository, plugin directory, or package directory to run \`${cliCmd} workspace ...\`, \`${cliCmd} list\`, \`${cliCmd} pull\`, \`${cliCmd} push\`, or \`${cliCmd} update-ai\`.`,
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
      `Do not infer configuration from this file. It intentionally avoids storing the effective instance, project, or workflow directory.`,
      ``,
      `n8nac backend resolution remains the only source of effective workspace state.`,
      `- Workspace environments live in \`n8nac-config.json\` and are managed by \`${cliCmd} env ...\`.`,
      `- Managed local runtime state and secrets live in n8n-manager storage and are managed by \`${managerCmd} ...\`.`,
      `- The effective context is resolved by the backend.`,
      ``,
      `Before any n8n workflow command, resolve the active workspace environment:`,
      ``,
      `\`\`\`bash`,
      `cd \"$(git rev-parse --show-toplevel)\"`,
      `${cliCmd} env status --json`,
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
      `- Workspace environment status: \`${cliCmd} env status --json\``,
      `- Workflow sync and validation: \`${cliCmd} ...\``,
      `- Node knowledge and schema lookup: \`${skillsCmd} ...\``,
      ``,
      `Never write \`n8nac-config.json\`, \`~/.n8n-manager\`, or n8n-manager secret files by hand.`,
      ...(options.nativeMcp ? [this.nativeMcpLevelNote(options.nativeMcp)] : []),
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
