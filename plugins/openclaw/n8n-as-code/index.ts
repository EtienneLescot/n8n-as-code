import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";
import { N8N_FACADE_SETUP_MODES } from "@n8n-as-code/workflow-core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerN8nAcCli } from "./src/cli.js";
import { getWorkspaceDir, isWorkspaceInitialized, readWorkspaceBinding } from "./src/workspace.js";

// ---------------------------------------------------------------------------
// Lightweight prompt context
// ---------------------------------------------------------------------------

const SETUP_MODE_CONTEXT = N8N_FACADE_SETUP_MODES
  .map((mode) => `- \`${mode.id}\`: ${mode.description}`)
  .join("\n");

const BOOTSTRAP_CONTEXT = `\
## n8n-as-code — Bootstrap

The n8n-as-code plugin is installed but the workspace has not been initialized yet.

**Tell the user:**
> "To start building n8n workflows, choose whether I should connect to your existing n8n access, let n8n-manager prepare runtime access, or stay in generation-only mode."

Supported facade runtime modes:
${SETUP_MODE_CONTEXT}

If the user chooses an existing n8n instance, run \`openclaw n8nac:setup\`.
For agent-driven flows, use the installed \`n8n-manager\` and \`n8n-architect\`
skills and their documented shell commands. Instance/auth/project management
belongs to \`n8n-manager\`; context-root overrides belong to \`n8nac workspace\`.
`;

function buildStatusHeader(workspaceDir: string): string {
  const cfg = readWorkspaceBinding(workspaceDir);
  return [
    "## n8n-as-code Context Root Status",
    "",
    "**The context root is initialized. Do NOT infer effective n8n config from this prompt.**",
    "",
    `- Context root: \`${workspaceDir}\``,
    `- Local overrides file: \`${join(workspaceDir, "n8nac-config.json")}\``,
    `- Bootstrap file: \`${join(workspaceDir, "AGENTS.md")}\``,
    "",
    "Before n8n work, run `n8nac workspace status --json` from the context root and use the backend-resolved result.",
    cfg.activeInstanceId || cfg.projectId || cfg.projectName || cfg.syncFolder
      ? "The local overrides file exists, but n8n-manager plus n8nac backend resolution remains the only source of effective state."
      : "The local overrides file is present but incomplete.",
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
        `When that happens, read \`${agentsPath}\` and the local \`${join(workspaceDir, ".agents", "skills")}\` skills.`,
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
    // in the bundled skills and the context-root AGENTS.md file.
    api.on("before_prompt_build", () => {
      return { prependContext: buildPromptContext(workspaceDir) };
    });

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
