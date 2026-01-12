import fs from 'fs';
import path from 'path';

export class AiContextGenerator {
  constructor() { }

  async generate(projectRoot: string, n8nVersion: string = "Unknown"): Promise<void> {
    const agentsContent = this.getAgentsContent(n8nVersion);
    const cursorContent = this.getCursorRulesContent();
    const clineContent = this.getClineRulesContent();
    const windsurfContent = this.getWindsurfRulesContent();
    const commonRules = this.getCommonRulesContent();

    // 1. AGENTS.md (Central documentation)
    this.injectOrUpdate(path.join(projectRoot, 'AGENTS.md'), agentsContent, true);

    // 2. Specialized Rule Files
    this.injectOrUpdate(path.join(projectRoot, '.cursorrules'), cursorContent);
    this.injectOrUpdate(path.join(projectRoot, '.clinerules'), clineContent);
    this.injectOrUpdate(path.join(projectRoot, '.windsurfrules'), windsurfContent);

    // 3. General AI Context (for Claude, Mistral, etc.)
    this.injectOrUpdate(path.join(projectRoot, '.ai-rules.md'), commonRules);
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

  private getAgentsContent(n8nVersion: string): string {
    return [
      `## 🎭 Role: Expert n8n Engineer`,
      `You manage n8n workflows as **clean, version-controlled JSON**.`,
      ``,
      `### 🌍 Context`,
      `- **n8n Version**: ${n8nVersion}`,
      `- **Schema**: Use \`n8n-schema.json\` for structural validation.`,
      ``,
      `### 🛠 Coding Standards`,
      `1. **Expressions**: Use \`{{ $json.field }}\` (modern) instead of \`{{ $node["Name"].json.field }}\` when possible.`,
      `2. **Nodes**: Always prefer the \`Code\` node for custom logic.`,
      `3. **Credentials**: NEVER hardcode API keys. Mention needed credentials by name.`,
      ``,
      `### 🔬 Research Protocol (MANDATORY)`,
      `Do NOT hallucinate node parameters. Use these tools via \`npx @n8n-as-code/agent-cli\`:`,
      `- \`search "<term>"\`: Find the correct node named (camelCase).`,
      `- \`get "<nodeName>"\`: Get the EXACT property definitions for a node.`,
      `- \`list\`: See all available nodes.`,
      ``,
      `Apply the Knowledge: Use the \`get\` tool's output as the absolute source of truth for JSON parameter names.`
    ].join('\n');
  }

  private getCursorRulesContent(): string {
    return [
      `# n8n-as-code rules`,
      `- Refer to AGENTS.md for n8n workflow standards.`,
      `- Use @n8n-as-code/agent-cli tools to prevent parameter hallucinations.`,
      `- Validate all workflow JSON against n8n-schema.json.`
    ].join('\n');
  }

  private getClineRulesContent(): string {
    return [
      `n8n_engineer_role:`,
      `  description: Expert in n8n-as-code`,
      `  instructions:`,
      `    - Read AGENTS.md for core principles.`,
      `    - Use npx @n8n-as-code/agent-cli search/get before editing workflow JSON.`,
      `    - Ensure connections are correctly indexed.`
    ].join('\n');
  }

  private getWindsurfRulesContent(): string {
    return [
      `### n8n Development Rules`,
      `- Follow the Research Protocol in AGENTS.md.`,
      `- Tooling: Use @n8n-as-code/agent-cli to fetch node schemas.`,
    ].join('\n');
  }

  private getCommonRulesContent(): string {
    return [
      `# Common Rules for All AI Agents (Claude, Mistral, etc.)`,
      `- Role: Expert n8n Automation Engineer.`,
      `- Workflow Source of Truth: \`@n8n-as-code/agent-cli\` tools.`,
      `- Documentation: Read AGENTS.md for full syntax rules.`
    ].join('\n');
  }
}
