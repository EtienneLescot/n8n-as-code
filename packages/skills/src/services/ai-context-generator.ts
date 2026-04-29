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
    });
  }

  getAgentSkillContent(
    skillName: 'n8n-manager' | 'n8n-architect',
    distTag?: string,
    options: { cliCommandOverride?: string; managerCommandOverride?: string } = {},
    projectRoot?: string,
  ): string {
    const { cliCmd, skillsCmd } = this.getCommandRefs(distTag, options.cliCommandOverride, projectRoot);
    const managerCmd = options.managerCommandOverride || process.env.N8N_MANAGER_COMMAND || 'n8n-manager';
    return this.readCanonicalAgentSkill(skillName)
      .replaceAll('{{N8NAC_CMD}}', cliCmd)
      .replaceAll('{{N8NAC_SKILLS_CMD}}', skillsCmd)
      .replaceAll('{{N8N_MANAGER_CMD}}', managerCmd);
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

    // 2. Local portable skills for agents that only see the context root.
    this.materializeAgentSkills(projectRoot, distTag, options);
  }

  private materializeAgentSkills(
    projectRoot: string,
    distTag?: string,
    options: { cliCommandOverride?: string; managerCommandOverride?: string } = {},
  ): void {
    const skillsRoot = path.join(projectRoot, '.agents', 'skills');
    const skillNames = ['n8n-manager', 'n8n-architect'] as const;
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
    const managerCmd = options.managerCommandOverride || process.env.N8N_MANAGER_COMMAND || 'n8n-manager';
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
      `---`,
      ``,
      `## Required Local Skills`,
      ``,
      `Read these local skill files before doing n8n work:`,
      ``,
      `- \`.agents/skills/n8n-manager/SKILL.md\``,
      `- \`.agents/skills/n8n-architect/SKILL.md\``,
      ``,
      `If your agent runtime supports skills, load those skills. If it does not, treat the files as mandatory instructions.`,
      ``,
      `---`,
      ``,
      `## Source Of Truth`,
      ``,
      `Do not infer configuration from this file. It intentionally avoids storing the effective instance, project, sync folder, or workflow directory.`,
      ``,
      `n8n-manager plus n8nac backend resolution remains the only source of effective state.`,
      `- Global n8n state and secrets live in \`n8n-manager\`.`,
      `- Context-root overrides live in \`n8nac-config.json\`.`,
      `- The effective context is resolved by the backend.`,
      ``,
      `Before any n8n workflow command, run:`,
      ``,
      `\`\`\`bash`,
      `${cliCmd} workspace status --json`,
      `\`\`\``,
      ``,
      `Use the returned \`workflowDir\` exactly as provided. Do not reconstruct paths from raw config files.`,
      ``,
      `---`,
      ``,
      `## Safe Commands`,
      ``,
      `- Instance/runtime/auth/project work: \`${managerCmd} ...\``,
      `- Context-root overrides: \`${cliCmd} workspace ...\``,
      `- Workflow sync and validation: \`${cliCmd} ...\``,
      `- Node knowledge and schema lookup: \`${skillsCmd} ...\``,
      ``,
      `Never write \`n8nac-config.json\` or n8n-manager secret files by hand.`,
    ].join('\n');
  }

  getSkillContent(): string {
    return this.getAgentSkillContent('n8n-architect');
  }

  getOpenClawSkillContent(): string {
    return this.getAgentSkillContent('n8n-architect');
  }

}
