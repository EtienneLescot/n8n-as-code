import { spawnSync } from "node:child_process";
import { Type } from "@sinclair/typebox";
import { isWorkspaceInitialized } from "./workspace.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ACTIONS = [
  "setup_check",
  "init_auth",
  "init_project",
  "list",
  "pull",
  "push",
  "verify",
  "skills",
  "validate",
] as const;

const N8nAcToolSchema = Type.Object({
  action: Type.Unsafe<(typeof ACTIONS)[number]>({
    type: "string",
    enum: [...ACTIONS],
    description: [
      "Action to perform:",
      "  setup_check  — check whether the workspace is initialized.",
      "  init_auth    — save n8n credentials. Requires n8nHost and n8nApiKey.",
      "  init_project — select the n8n project. Optionally pass projectId, projectName, or projectIndex (1-based, default 1).",
      "  list         — list all workflows with their sync status.",
      "  pull         — download a workflow from n8n. Requires workflowId.",
      "  push         — upload a local workflow file. Requires filename (e.g. my-flow.workflow.ts).",
      "  verify       — fetch a workflow from n8n and validate it. Requires workflowId.",
      "  skills       — run any n8nac skills subcommand. Requires skillsArgs (e.g. 'search telegram' or 'node-info googleSheets').",
      "  validate     — validate a local workflow file. Requires validateFile.",
    ].join("\n"),
  }),
  // init_auth
  n8nHost: Type.Optional(
    Type.String({ description: "n8n host URL (for init_auth). Example: https://your-n8n.example.com" }),
  ),
  n8nApiKey: Type.Optional(Type.String({ description: "n8n API key (for init_auth)" })),
  // init_project
  projectId: Type.Optional(Type.String({ description: "n8n project ID (for init_project)" })),
  projectName: Type.Optional(Type.String({ description: "n8n project name (for init_project)" })),
  projectIndex: Type.Optional(
    Type.Number({ description: "n8n project index, 1-based (for init_project, default: 1)" }),
  ),
  // pull / verify
  workflowId: Type.Optional(Type.String({ description: "Workflow ID (for pull, verify)" })),
  // push
  filename: Type.Optional(
    Type.String({
      description:
        "Workflow filename including .workflow.ts extension (for push). " +
        "Example: my-flow.workflow.ts. Do NOT pass a path.",
    }),
  ),
  // skills
  skillsArgs: Type.Optional(
    Type.String({
      description:
        "Arguments for the n8nac skills subcommand (for skills action). " +
        "Examples: 'search telegram', 'node-info googleSheets', 'examples search slack', 'docs OpenAI'",
    }),
  ),
  // validate
  validateFile: Type.Optional(
    Type.String({ description: "Workflow file path to validate (for validate action)" }),
  ),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runNpx(
  args: string[],
  cwd: string,
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("npx", ["--yes", "n8nac", ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 120_000,
    env: { ...process.env },
  });
  return {
    stdout: (result.stdout ?? "").toString(),
    stderr: (result.stderr ?? "").toString(),
    exitCode: result.status ?? 1,
  };
}

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createN8nAcTool(opts: { workspaceDir: string }) {
  const { workspaceDir } = opts;

  return {
    name: "n8nac",
    label: "n8n-as-code",
    description:
      "Create and manage n8n workflows using n8n-as-code. " +
      "Handles workspace initialization (init_auth → init_project), " +
      "workflow sync (list, pull, push, verify), and AI knowledge lookup (skills, validate). " +
      "Always call setup_check first to determine initialization state.",
    parameters: N8nAcToolSchema,

    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const action = str(params.action);

      // ---- setup_check --------------------------------------------------
      if (action === "setup_check") {
        const initialized = isWorkspaceInitialized(workspaceDir);
        return ok({
          initialized,
          workspaceDir,
          next: initialized
            ? "Workspace is ready. Use list, pull, push, verify, or skills."
            : "Workspace not initialized. Ask the user for their n8n host URL and API key, then call init_auth.",
        });
      }

      // ---- init_auth ----------------------------------------------------
      if (action === "init_auth") {
        const host = str(params.n8nHost);
        const key = str(params.n8nApiKey);
        if (!host || !key) {
          return ok({ error: "n8nHost and n8nApiKey are required for init_auth" });
        }
        const r = runNpx(["init-auth", "--host", host, "--api-key", key], workspaceDir);
        if (r.exitCode !== 0) {
          return ok({ error: r.stderr || r.stdout, exitCode: r.exitCode });
        }
        return ok({
          ok: true,
          output: r.stdout,
          next: "Credentials saved. Now call init_project. If unsure which project, use projectIndex: 1 for a single-project setup, or list --remote first.",
        });
      }

      // ---- init_project -------------------------------------------------
      if (action === "init_project") {
        const id = str(params.projectId);
        const name = str(params.projectName);
        const idx = typeof params.projectIndex === "number" ? params.projectIndex : 1;
        const args: string[] = ["init-project", "--sync-folder", "workflows"];
        if (id) args.push("--project-id", id);
        else if (name) args.push("--project-name", name);
        else args.push("--project-index", String(idx));

        const r = runNpx(args, workspaceDir);
        if (r.exitCode !== 0) {
          return ok({ error: r.stderr || r.stdout, exitCode: r.exitCode });
        }
        // Refresh AGENTS.md after successful init
        runNpx(["update-ai"], workspaceDir);
        return ok({
          ok: true,
          output: r.stdout,
          next: "Workspace initialized. AGENTS.md regenerated. You can now list, pull, push, and verify workflows.",
        });
      }

      // ---- list ---------------------------------------------------------
      if (action === "list") {
        const r = runNpx(["list"], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- pull ---------------------------------------------------------
      if (action === "pull") {
        const id = str(params.workflowId);
        if (!id) return ok({ error: "workflowId is required for pull" });
        const r = runNpx(["pull", id], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- push ---------------------------------------------------------
      if (action === "push") {
        const file = str(params.filename);
        if (!file) return ok({ error: "filename is required for push (e.g. my-flow.workflow.ts)" });
        const r = runNpx(["push", file, "--verify"], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- verify -------------------------------------------------------
      if (action === "verify") {
        const id = str(params.workflowId);
        if (!id) return ok({ error: "workflowId is required for verify" });
        const r = runNpx(["verify", id], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- skills -------------------------------------------------------
      if (action === "skills") {
        const skillsArgs = str(params.skillsArgs);
        if (!skillsArgs) {
          return ok({
            error:
              "skillsArgs is required. Examples: 'search telegram', 'node-info googleSheets', 'examples search slack notification'",
          });
        }
        const args = ["skills", ...skillsArgs.split(/\s+/).filter(Boolean)];
        const r = runNpx(args, workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- validate -----------------------------------------------------
      if (action === "validate") {
        const file = str(params.validateFile);
        if (!file) return ok({ error: "validateFile is required for validate" });
        const r = runNpx(["skills", "validate", file], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      return ok({ error: `Unknown action: ${action}` });
    },
  };
}
