import { spawn } from "node:child_process";
import { Type } from "@sinclair/typebox";
import { getChildEnv } from "./child-env.js";
import { isWorkspaceInitialized } from "./workspace.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ACTIONS = [
  "setup_check",
  "manager_auth_set",
  "manager_projects_list",
  "manager_projects_select",
  "manager_instances_list",
  "manager_instances_select",
  "manager_instances_delete",
  "workspace_set_sync_folder",
  "workspace_set_project",
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
      "  manager_auth_set — save n8n credentials through n8n-manager. Requires n8nHost and n8nApiKey.",
      "  manager_projects_list — list n8n projects through n8n-manager.",
      "  manager_projects_select — set the instance default project through n8n-manager. Requires projectId or projectName.",
      "  manager_instances_list — list global n8n-manager instances as JSON.",
      "  manager_instances_select — switch the global active n8n-manager instance. Requires instanceId or instanceName.",
      "  manager_instances_delete — delete a global n8n-manager instance. Requires instanceId or instanceName.",
      "  workspace_set_sync_folder — set this workspace's local sync folder. Requires syncFolder.",
      "  workspace_set_project — set this workspace's project override. Requires projectId and projectName.",
      "  list         — list all workflows with their sync status.",
      "  pull         — download a workflow from n8n. Requires workflowId.",
      "  push         — upload a local workflow file. Requires filename (e.g. my-flow.workflow.ts).",
      "  verify       — fetch a workflow from n8n and validate it. Requires workflowId.",
      "  skills       — run any n8nac skills subcommand. Requires skillsArgs (e.g. 'search telegram' or 'node-info googleSheets').",
      "  validate     — validate a local workflow file. Requires validateFile.",
    ].join("\n"),
  }),
  // manager_auth_set
  n8nHost: Type.Optional(
    Type.String({ description: "n8n host URL (for manager_auth_set). Example: https://your-n8n.example.com" }),
  ),
  n8nApiKey: Type.Optional(Type.String({ description: "n8n API key (for manager_auth_set)" })),
  instanceName: Type.Optional(Type.String({ description: "Global n8n-manager instance name." })),
  // manager_projects_select / workspace_set_project
  projectId: Type.Optional(Type.String({ description: "n8n project ID" })),
  projectName: Type.Optional(Type.String({ description: "n8n project name" })),
  projectIndex: Type.Optional(
    Type.Number({ description: "n8n project index, 1-based, for selecting from manager_projects_list output" }),
  ),
  // manager_instances_select / manager_instances_delete
  instanceId: Type.Optional(Type.String({ description: "Global n8n-manager instance ID." })),
  instanceIndex: Type.Optional(Type.Number({ description: "Global n8n-manager instance index, 1-based." })),
  syncFolder: Type.Optional(Type.String({ description: "Workspace sync folder for workspace_set_sync_folder." })),
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

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  stdinInput?: string,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "pipe",
      env: getChildEnv(),
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

function getN8nManagerCommand(): { command: string; args: string[] } {
  const override = process.env.N8N_MANAGER_COMMAND?.trim();
  if (override) {
    const parsed = splitArgv(override);
    if (parsed?.length) {
      return { command: parsed[0], args: parsed.slice(1) };
    }
  }
  return { command: "npx", args: ["--yes", "n8n-manager"] };
}

function runN8nac(args: string[], cwd: string, stdinInput?: string): Promise<RunResult> {
  return runCommand("npx", ["--yes", "n8nac", ...args], cwd, stdinInput);
}

function runN8nManager(args: string[], cwd: string, stdinInput?: string): Promise<RunResult> {
  const manager = getN8nManagerCommand();
  return runCommand(manager.command, [...manager.args, ...args], cwd, stdinInput);
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
      "Uses n8n-manager for global instance/auth/project management, n8nac workspace commands for workspace-local context, " +
      "and n8nac workflow commands for sync (list, pull, push, verify) plus AI knowledge lookup (skills, validate). " +
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
            ? "Workspace is ready. Use manager_instances_list, manager_instances_select, list, pull, push, verify, or skills."
            : "Workspace not initialized. Ask the user for their n8n host URL and API key, then call manager_auth_set, manager_projects_select, and workspace_set_sync_folder.",
        });
      }

      // ---- manager_auth_set --------------------------------------------
      if (action === "manager_auth_set") {
        const host = str(params.n8nHost);
        const key = str(params.n8nApiKey);
        const instanceName = str(params.instanceName);
        if (!host || !key) {
          return ok({ error: "n8nHost and n8nApiKey are required for manager_auth_set" });
        }
        const args = ["auth", "set", "--url", host, "--api-key-stdin"];
        if (instanceName) args.push("--name", instanceName);
        const r = await runN8nManager(args, workspaceDir, key);
        if (r.exitCode !== 0) {
          return ok({ error: r.stderr || r.stdout, exitCode: r.exitCode });
        }
        return ok({
          ok: true,
          output: r.stdout,
          next: "Credentials saved. Now call manager_projects_list, manager_projects_select, and workspace_set_sync_folder.",
        });
      }

      // ---- manager_projects_list ---------------------------------------
      if (action === "manager_projects_list") {
        const r = await runN8nManager(["projects", "list"], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- manager_projects_select -------------------------------------
      if (action === "manager_projects_select") {
        const id = str(params.projectId);
        const name = str(params.projectName);
        if (!id && !name) return ok({ error: "projectId or projectName is required for manager_projects_select" });
        const r = await runN8nManager(["projects", "select", id || name], workspaceDir);
        if (r.exitCode !== 0) {
          return ok({ error: r.stderr || r.stdout, exitCode: r.exitCode });
        }
        return ok({
          ok: true,
          output: r.stdout,
          next: "Instance default project selected. Now call workspace_set_sync_folder and update-ai if needed.",
        });
      }

      // ---- manager_instances_list --------------------------------------
      if (action === "manager_instances_list") {
        const r = await runN8nManager(["instances", "list"], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- manager_instances_select ------------------------------------
      if (action === "manager_instances_select") {
        const instanceId = str(params.instanceId);
        const instanceName = str(params.instanceName);
        if (!instanceId && !instanceName) {
          return ok({ error: "instanceId or instanceName is required for manager_instances_select" });
        }

        const r = await runN8nManager(["instances", "select", instanceId || instanceName], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- manager_instances_delete ------------------------------------
      if (action === "manager_instances_delete") {
        const instanceId = str(params.instanceId);
        const instanceName = str(params.instanceName);
        if (!instanceId && !instanceName) {
          return ok({ error: "instanceId or instanceName is required for manager_instances_delete" });
        }

        const r = await runN8nManager(["instances", "delete", instanceId || instanceName, "--force"], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- workspace_set_sync_folder -----------------------------------
      if (action === "workspace_set_sync_folder") {
        const syncFolder = str(params.syncFolder) || "workflows";
        const r = await runN8nac(["workspace", "set-sync-folder", syncFolder], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- workspace_set_project ---------------------------------------
      if (action === "workspace_set_project") {
        const id = str(params.projectId);
        const name = str(params.projectName);
        if (!id || !name) {
          return ok({ error: "projectId and projectName are required for workspace_set_project" });
        }
        const r = await runN8nac(["workspace", "set-project", "--project-id", id, "--project-name", name], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- list ---------------------------------------------------------
      if (action === "list") {
        const scope = str(params.listScope) || "all";
        const args = ["list"];
        if (scope === "local" || scope === "remote" || scope === "distant") {
          args.push(`--${scope}`);
        }
        const r = await runN8nac(args, workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- pull ---------------------------------------------------------
      if (action === "pull") {
        const id = str(params.workflowId);
        if (!id) return ok({ error: "workflowId is required for pull" });
        const r = await runN8nac(["pull", id], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- push ---------------------------------------------------------
      if (action === "push") {
        const file = str(params.filename);
        if (!file) return ok({ error: "filename is required for push (e.g. my-flow.workflow.ts)" });
        const r = await runN8nac(["push", file, "--verify"], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- verify -------------------------------------------------------
      if (action === "verify") {
        const id = str(params.workflowId);
        if (!id) return ok({ error: "workflowId is required for verify" });
        const r = await runN8nac(["verify", id], workspaceDir);
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
        const r = await runN8nac(args, workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      // ---- validate -----------------------------------------------------
      if (action === "validate") {
        const file = str(params.validateFile);
        if (!file) return ok({ error: "validateFile is required for validate" });
        const r = await runN8nac(["skills", "validate", file], workspaceDir);
        return ok({ exitCode: r.exitCode, output: r.stdout, error: r.stderr || undefined });
      }

      return ok({ error: `Unknown action: ${action}` });
    },
  };
}
