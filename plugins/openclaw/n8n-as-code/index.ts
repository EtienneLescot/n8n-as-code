import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerN8nAcCli } from "./src/cli.js";
import { createN8nAcTool } from "./src/tool.js";
import { getWorkspaceDir, isWorkspaceInitialized, readWorkspaceBinding } from "./src/workspace.js";

// ---------------------------------------------------------------------------
// Lightweight prompt context
// ---------------------------------------------------------------------------

const BOOTSTRAP_CONTEXT = `\
## n8n-as-code — Bootstrap

The n8n-as-code plugin is installed but the workspace has not been initialized yet.

**Tell the user:**
> "To start building n8n workflows I need your n8n host URL and API key."

Once you have both, call the \`n8nac\` tool with \`action: "init_auth"\`, then
\`action: "init_project"\` to finish setup.
`;

function buildStatusHeader(workspaceDir: string): string {
  const cfg = readWorkspaceBinding(workspaceDir);
  const host = cfg.host ?? "(unknown)";
  const project = cfg.projectName ?? cfg.projectId ?? "(unknown)";
  return [
    "## ✅ n8n-as-code Workspace Status",
    "",
    "**The workspace is already fully initialized. Do NOT ask the user for credentials.**",
    "",
    `- Workspace directory: \`${workspaceDir}\``,
    `- Active instance: \`${cfg.activeInstanceName ?? cfg.activeInstanceId ?? "(unknown)"}\``,
    `- n8n host: \`${host}\``,
    `- Active project: \`${project}\``,
  ].join("\n");
}

function hasAgentsContext(workspaceDir: string): boolean {
  const agentsPath = join(workspaceDir, "AGENTS.md");
  try {
    accessSync(agentsPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function buildPromptContext(workspaceDir: string): string {
  if (!isWorkspaceInitialized(workspaceDir)) {
    return BOOTSTRAP_CONTEXT;
  }

  const agentsPath = join(workspaceDir, "AGENTS.md");
  const guidanceLines = hasAgentsContext(workspaceDir)
    ? [
        "",
        "Detailed workflow-authoring guidance is intentionally scoped to the `n8n-architect` skill.",
        "Only use that deeper n8n workflow context when the request is clearly about n8n workflow work.",
        `When that happens, read \`${agentsPath}\` for workspace-specific instructions.`,
      ]
    : [
        "",
        "Detailed workflow-authoring guidance is intentionally scoped to the `n8n-architect` skill, but the generated workspace AI context file (`AGENTS.md`) is missing.",
        "If the user starts explicit n8n workflow work, regenerate `AGENTS.md` with `npx --yes n8nac update-ai` or rerun `openclaw n8nac:setup` first.",
      ];

  return [
    buildStatusHeader(workspaceDir),
    ...guidanceLines,
    "",
    "For unrelated requests, ignore this plugin context.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const n8nAcPlugin = {
  id: "n8nac",
  name: "n8n-as-code",
  description:
    "Create and manage n8n workflows from OpenClaw using n8n-as-code (n8nac). " +
    "Guides through workspace initialization, workflow CRUD, and AI-powered node schema lookup.",

  register(api: OpenClawPluginApi) {
    const workspaceDir = getWorkspaceDir();

    // Ensure the plugin workspace directory always exists.
    mkdirSync(workspaceDir, { recursive: true });

    // -- Context injection ---------------------------------------------------
    // Keep default context lightweight; full workflow-authoring guidance lives
    // in the bundled `n8n-architect` skill and the workspace AGENTS.md file.
    api.on("before_prompt_build", () => {
      return { prependContext: buildPromptContext(workspaceDir) };
    });

    // -- Agent tool ----------------------------------------------------------
    api.registerTool(createN8nAcTool({ workspaceDir }));

    // -- CLI wizard ----------------------------------------------------------
    api.registerCli(
      ({ program }) => registerN8nAcCli({ program, workspaceDir }),
      { commands: ["n8nac:setup", "n8nac:status"] },
    );

    // -- Service -------------------------------------------------------------
    api.registerService({
      id: "n8nac-context",
      start: async () => {
        if (isWorkspaceInitialized(workspaceDir)) {
          if (hasAgentsContext(workspaceDir)) {
            api.logger.info("[n8nac] Workspace ready — lightweight prompt context enabled; n8n skill available.");
          } else {
            api.logger.warn("[n8nac] Workspace ready, but AGENTS.md is missing or unreadable.");
          }
        } else {
          api.logger.info("[n8nac] Workspace not initialized. Run `openclaw n8nac:setup`.");
        }
      },
      stop: async () => {},
    });
  },
};

export default n8nAcPlugin;
