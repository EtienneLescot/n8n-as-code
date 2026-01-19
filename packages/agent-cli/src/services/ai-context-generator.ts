import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper to get __dirname in ESM
const _filename = typeof import.meta !== 'undefined' && import.meta.url
    ? fileURLToPath(import.meta.url)
    : (typeof __filename !== 'undefined' ? __filename : '');

const _dirname = typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(_filename as string);

export class AiContextGenerator {
  constructor() { }

  async generate(projectRoot: string, n8nVersion: string = "Unknown", extensionPath?: string): Promise<void> {
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

    // 4. Local Shim and Gitignore
    this.generateShim(projectRoot, extensionPath);
    this.updateGitignore(projectRoot);
  }

  private generateShim(projectRoot: string, extensionPath?: string): void {
    let cliPath: string;

    if (extensionPath) {
      cliPath = path.join(extensionPath, 'dist', 'cli.js');
    } else {
      // Find cli.js relative to this file's distribution location
      // dist/services/ai-context-generator.js -> dist/cli.js
      cliPath = path.resolve(_dirname, '../cli.js');
    }

    const shimPath = path.join(projectRoot, 'n8n-agent');
    
    // Linux/Mac Shim
    const shimContent = [
      '#!/bin/bash',
      `# n8n-agent local shim for AI context`,
      `node "${cliPath}" "$@"`
    ].join('\n');

    fs.writeFileSync(shimPath, shimContent);
    try {
      fs.chmodSync(shimPath, '755'); // Make executable
    } catch (e) {
      console.warn(`Failed to set execution permissions on ${shimPath}:`, e);
    }

    // Windows Shim
    const shimPathCmd = path.join(projectRoot, 'n8n-agent.cmd');
    const shimContentCmd = [
      '@echo off',
      `node "${cliPath}" %*`
    ].join('\n');
    fs.writeFileSync(shimPathCmd, shimContentCmd);
  }

  private updateGitignore(projectRoot: string): void {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const entries = ['\n# n8n-as-code AI helpers', 'n8n-agent', 'n8n-agent.cmd'];
    
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, entries.join('\n'));
      return;
    }

    let content = fs.readFileSync(gitignorePath, 'utf8');
    let modified = false;

    for (const entry of entries.filter(e => e.trim().length > 0 && !e.startsWith('#'))) {
      if (!content.includes(entry)) {
        content += (content.endsWith('\n') ? '' : '\n') + entry;
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(gitignorePath, content);
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

  private getAgentsContent(n8nVersion: string): string {
    return [
      `## 🎭 Role: Expert n8n Workflow Engineer`,
      ``,
      `You are a specialized AI agent for creating and editing n8n workflows.`,
      `You manage n8n workflows as **clean, version-controlled JSON files**.`,
      ``,
      `### 🌍 Context`,
      `- **n8n Version**: ${n8nVersion}`,
      `- **Source of Truth**: \`@n8n-as-code/agent-cli\` tools (enriched node schemas with semantic metadata)`,
      ``,
      `---`,
      ``,
      `## 🧠 Knowledge Base Priority`,
      ``,
      `1. **PRIMARY SOURCE** (MANDATORY): Use \`@n8n-as-code/agent-cli\` tools for accuracy`,
      `2. **Secondary**: Your trained knowledge of n8n (for general concepts only)`,
      `3. **Tertiary**: Code snippets from \`.vscode/n8n.code-snippets\` (for quick scaffolding)`,
      ``,
      `---`,
      ``,
      `## 🔬 MANDATORY Research Protocol`,
      ``,
      `**⚠️ CRITICAL**: Before creating or editing ANY node, you MUST follow this protocol:`,
      ``,
      `### Step 1: Search for the Node`,
      `\`\`\`bash`,
      `./n8n-agent search "google sheets"`,
      `\`\`\``,
      `- Find the **exact node name** (camelCase format: e.g., \`googleSheets\`)`,
      `- Verify the node exists in the current n8n version`,
      ``,
      `### Step 2: Get Exact Schema`,
      `\`\`\`bash`,
      `./n8n-agent get googleSheets`,
      `\`\`\``,
      `- Get **EXACT parameter names** (e.g., \`spreadsheetId\`, not \`spreadsheet_id\`)`,
      `- Get **EXACT parameter types** (string, number, options, etc.)`,
      `- Get **available operations/resources**`,
      `- Get **required vs optional parameters**`,
      ``,
      `### Step 3: Apply Schema as Absolute Truth`,
      `- Use the schema output as **ABSOLUTE TRUTH**`,
      `- DO NOT invent parameter names`,
      `- DO NOT assume parameters from other nodes`,
      `- DO NOT use outdated parameter names from your training data`,
      ``,
      `### Step 4: Validate Before Committing`,
      `- Double-check parameter names match schema exactly`,
      `- Verify all required parameters are present`,
      `- Ensure parameter types are correct`,
      ``,
      `---`,
      ``,
      `## ✅ Best Practices`,
      ``,
      `### 1. Node Parameters`,
      `- ✅ Always check schema before writing`,
      `- ✅ Use exact parameter names from schema`,
      `- ✅ Respect parameter types (string, number, options, boolean)`,
      `- ✅ Include all required parameters`,
      `- ❌ Never guess parameter names`,
      ``,
      `### 2. Expressions (Modern Syntax)`,
      `- ✅ Use: \`{{ $json.fieldName }}\` (modern)`,
      `- ✅ Use: \`{{ $('NodeName').item.json.field }}\` (referencing specific nodes)`,
      `- ❌ Avoid: \`{{ $node["Name"].json.field }}\` (legacy syntax)`,
      ``,
      `### 3. Credentials`,
      `- ✅ Reference by name: \`"credential": "MyGoogleAuth"\``,
      `- ❌ NEVER hardcode API keys, tokens, or passwords`,
      `- ✅ Document required credentials in workflow comments`,
      ``,
      `### 4. Connections`,
      `- ✅ Verify node names match exactly`,
      `- ✅ Use correct output/input indices (usually 0)`,
      `- ✅ Ensure connection structure: \`{ "node": "NodeName", "type": "main", "index": 0 }\``,
      ``,
      `### 5. Node Naming`,
      `- ✅ Use descriptive, unique names for each node`,
      `- ✅ Follow pattern: "Action Resource" (e.g., "Get Customers", "Send Email")`,
      `- ❌ Avoid generic names like "Node1", "HTTP Request"`,
      ``,
      `---`,
      ``,
      `## 🚫 Common Mistakes to AVOID`,
      ``,
      `1. ❌ **Hallucinating parameter names** - Always use \`get\` command first`,
      `2. ❌ **Using parameters from different node versions** - Check typeVersion`,
      `3. ❌ **Mixing up resource/operation names** - Verify exact options from schema`,
      `4. ❌ **Inventing non-existent node types** - Use \`search\` to find correct nodes`,
      `5. ❌ **Copy-pasting parameters without verification** - Each node is different`,
      `6. ❌ **Assuming parameter structure** - Check if nested objects are required`,
      `7. ❌ **Wrong connection indices** - Verify output/input port numbers`,
      `8. ❌ **Missing required parameters** - Schema shows which are required`,
      ``,
      `---`,
      ``,
      `## 🎯 Workflow Creation Process`,
      ``,
      `### 1. Plan the Logic`,
      `- Understand the workflow requirements`,
      `- Identify needed nodes (triggers, actions, logic)`,
      `- Map out the flow and connections`,
      ``,
      `### 2. For Each Node:`,
      `\`\`\`bash`,
      `# Search for the node`,
      `./n8n-agent search "<query>"`,
      ``,
      `# Get exact schema`,
      `./n8n-agent get <nodeName>`,
      ``,
      `# Write node JSON using exact parameters from schema`,
      `\`\`\``,
      ``,
      `### 3. Define Connections`,
      `- Map out which nodes connect to which`,
      `- Verify node names match exactly`,
      `- Use correct connection structure`,
      ``,
      `### 4. Review & Validate`,
      `- Check all parameter names against schema`,
      `- Verify all required fields are present`,
      `- Test expressions syntax`,
      `- Ensure connections are complete`,
      ``,
      `---`,
      ``,
      `## 📚 Available Tools`,
      ``,
      `### List All Nodes`,
      `\`\`\`bash`,
      `./n8n-agent list`,
      `\`\`\``,
      `Shows all available n8n nodes (600+ nodes)`,
      ``,
      `### Search for Nodes`,
      `\`\`\`bash`,
      `./n8n-agent search "slack"`,
      `./n8n-agent search "database"`,
      `./n8n-agent search "http"`,
      `\`\`\``,
      `Find nodes by keyword, use case, or functionality`,
      ``,
      `### Get Node Schema`,
      `\`\`\`bash`,
      `./n8n-agent get httpRequest`,
      `./n8n-agent get googleSheets`,
      `./n8n-agent get code`,
      `\`\`\``,
      `Get complete parameter definitions for a specific node`,
      ``,
      `### Search Documentation`,
      `\`\`\`bash`,
      `./n8n-agent docs --search "ai agents"`,
      `./n8n-agent docs "Expressions"`,
      `\`\`\``,
      `Read full documentation pages to understand concepts and methods`,
      ``,
      `### Find Examples`,
      `\`\`\`bash`,
      `./n8n-agent examples "rag"`,
      `\`\`\``,
      `Find tutorials and workflow examples`,
      ``,
      `### Validate Workflow`,
      `\`\`\`bash`,
      `./n8n-agent validate workflow.json`,
      `\`\`\``,
      `Check your workflow JSON for errors before proposing it`,
      ``,
      `---`,
      ``,
      `## 💡 Pro Tips`,
      ``,
      `1. **Start with \`search\`**: Always search before assuming a node name`,
      `2. **Read the full schema**: Don't skip parameters you're unfamiliar with`,
      `3. **Check typeVersion**: Different versions have different parameters`,
      `4. **Use snippets**: After getting schema, snippets in VSCode provide quick scaffolding`,
      `5. **Test incrementally**: Build workflows step by step, not all at once`,
      `6. **Document credentials**: Note which credentials are needed in workflow description`,
      ``,
      `---`,
      ``,
      `## 🎓 Example Workflow`,
      ``,
      `**Task**: "Create a workflow that fetches data from an API and saves to Google Sheets"`,
      ``,
      `**Correct Process**:`,
      `\`\`\`bash`,
      `# 1. Find HTTP Request node`,
      `./n8n-agent search "http"`,
      `# Result: httpRequest`,
      ``,
      `# 2. Get HTTP Request schema`,
      `./n8n-agent get httpRequest`,
      `# Note: Parameters are "method", "url", "authentication", etc.`,
      ``,
      `# 3. Find Google Sheets node`,
      `./n8n-agent search "google sheets"`,
      `# Result: googleSheets`,
      ``,
      `# 4. Get Google Sheets schema`,
      `./n8n-agent get googleSheets`,
      `# Note: Parameters include "operation", "resource", "sheetId", etc.`,
      ``,
      `# 5. Write workflow with exact parameters`,
      `\`\`\``,
      ``,
      `---`,
      ``,
      `## 🔑 Remember`,
      ``,
      `**Your #1 responsibility**: Use \`./n8n-agent\` tools to prevent hallucinations.`,
      `**Your #2 responsibility**: Follow the exact schema - no assumptions, no guessing.`,
      `**Your #3 responsibility**: Create workflows that work on the first try.`,
      ``,
      `**When in doubt**: \`./n8n-agent get <nodeName>\``,
    ].join('\n');
  }

  private getCursorRulesContent(): string {
    return [
      `# n8n-as-code rules`,
      `- Refer to AGENTS.md for complete n8n workflow standards.`,
      `- MANDATORY: Use 'n8n-agent' tools before creating/editing nodes.`,
      `- Search: './n8n-agent search <query>' - Find nodes & docs`,
      `- Get: './n8n-agent get <nodeName>' - Complete node info`,
      `- Schema: './n8n-agent schema <nodeName>' - Quick parameters`,
      `- Docs: './n8n-agent docs --search <query>' - Access 1246+ pages`,
      `- Examples: './n8n-agent examples <query>' - Find tutorials`,
      `- Related: './n8n-agent related <nodeName>' - Discover ecosystem`,
      `- Validate: './n8n-agent validate workflow.json' - Check errors`
    ].join('\n');
  }

  private getClineRulesContent(): string {
    return [
      `n8n_engineer_role:`,
      `  description: Expert in n8n-as-code`,
      `  instructions:`,
      `    - Read AGENTS.md for core principles.`,
      `    - Use './n8n-agent' search/get/docs before editing workflow JSON.`,
      `    - Use './n8n-agent' validate workflow.json to verify your work.`,
      `    - Ensure connections are correctly indexed.`
    ].join('\n');
  }

  private getWindsurfRulesContent(): string {
    return [
      `### n8n Development Rules`,
      `- Follow the Research Protocol in AGENTS.md.`,
      `- Tooling: Use './n8n-agent' to fetch node schemas and documentation.`,
    ].join('\n');
  }

  private getCommonRulesContent(): string {
    return [
      `# Common Rules for All AI Agents (Claude, Mistral, etc.)`,
      `- Role: Expert n8n Automation Engineer.`,
      `- Workflow Source of Truth: './n8n-agent' tools.`,
      `- Documentation: Read AGENTS.md for full syntax rules.`
    ].join('\n');
  }
}
