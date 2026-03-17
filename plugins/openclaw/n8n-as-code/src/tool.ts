import { spawn } from "node:child_process";
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

const LIST_SCOPES = ["all", "local", "remote", "distant"] as const;

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
  listScope: Type.Optional(
    Type.Unsafe<(typeof LIST_SCOPES)[number]>({
      type: "string",
      enum: [...LIST_SCOPES],
      description: "Workflow list scope (for list). One of: all, local, remote, distant.",
    }),
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
  skillsArgv: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Array form of arguments for the n8nac skills subcommand (preferred when values contain spaces). " +
        'Example: ["examples", "search", "slack notification"]',
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

type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

function runNpx(
  args: string[],
  cwd: string,
  stdinInput?: string,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["--yes", "n8nac", ...args], {
      cwd,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve(result);
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    if (stdinInput !== undefined) {
      child.stdin.write(`${stdinInput}\n`);
      child.stdin.end();
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (settled) return;
        child.kill("SIGKILL");
        finish({ stdout, stderr: stderr || "Process timed out.", exitCode: 1, timedOut: true });
      }, 2_000);
    }, 120_000);

    child.on("error", (error) => {
      finish({ stdout, stderr: error.message || stderr, exitCode: 1, timedOut });
    });

    child.on("close", (code) => {
      finish({ stdout, stderr, exitCode: code ?? 1, timedOut });
    });
  });
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

export function splitArgv(input: string): string[] | null {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const ch of input) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }

    if (ch === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (escaping) current += "\\";
  if (quote) return null;
  if (current) args.push(current);
  return args;
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
        const r = await runNpx(["init-auth", "--host", host, "--api-key-stdin"], workspaceDir, key);
        if (r.exitCode !== 0) {
          return ok({ error: r.stderr || r.stdout, exitCode: r.exitCode });
        }
        return ok({
          ok: true,
          output: r.stdout,
          next: "Credentials saved. Now call init_project. If you need to inspect remote workflows first, use list with listScope: 'remote'.",
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

        const r = await runNpx(args, workspaceDir);
        if (r.exitCode !== 0) {
          return ok({ error: r.stderr || r.stdout, exitCode: r.exitCode });
        }
        // Refresh AGENTS.md after successful init
        const ai = await runNpx(["update-ai"], workspaceDir);
        if (ai.exitCode !== 0) {
          return ok({
            ok: true,
            output: r.stdout,
            warning: ai.stderr || ai.stdout || "AGENTS.md regeneration failed.",
            next:
              "Workspace initialized, but AI context regeneration failed. Run `npx --yes n8nac update-ai` before relying on agent-guided workflow work.",
          });
        }
        return ok({
          ok: true,
          output: r.stdout,
          next: "Workspace initialized. AGENTS.md regenerated. You can now list, pull, push, and verify workflows.",
        });
      }

      // ---- list ---------------------------------------------------------
      if (action === "list") {
        const scope = str(params.listScope) || "all";
        const args = ["list"];
        if (scope === "local" || scope === "remote" || scope === "distant") {
          args.push(`--${scope}`);
        }
        const r = await runNpx(args, workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- pull ---------------------------------------------------------
      if (action === "pull") {
        const id = str(params.workflowId);
        if (!id) return ok({ error: "workflowId is required for pull" });
        const r = await runNpx(["pull", id], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- push ---------------------------------------------------------
      if (action === "push") {
        const file = str(params.filename);
        if (!file) return ok({ error: "filename is required for push (e.g. my-flow.workflow.ts)" });
        const r = await runNpx(["push", file, "--verify"], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- verify -------------------------------------------------------
      if (action === "verify") {
        const id = str(params.workflowId);
        if (!id) return ok({ error: "workflowId is required for verify" });
        const r = await runNpx(["verify", id], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- skills -------------------------------------------------------
      if (action === "skills") {
        const skillsArgv = Array.isArray(params.skillsArgv)
          ? params.skillsArgv.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        const skillsArgs = str(params.skillsArgs);
        if (!skillsArgv.length && !skillsArgs) {
          return ok({
            error:
              "skillsArgv or skillsArgs is required. Examples: skillsArgv: ['examples', 'search', 'slack notification']",
          });
        }
        const parsedArgs = skillsArgv.length ? skillsArgv : splitArgv(skillsArgs);
        if (!parsedArgs) {
          return ok({ error: "skillsArgs contains an unterminated quote. Prefer skillsArgv when values contain spaces." });
        }
        const args = ["skills", ...parsedArgs];
        const r = await runNpx(args, workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- validate -----------------------------------------------------
      if (action === "validate") {
        const file = str(params.validateFile);
        if (!file) return ok({ error: "validateFile is required for validate" });
        const r = await runNpx(["skills", "validate", file], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      return ok({ error: `Unknown action: ${action}` });
    },
  };
}
