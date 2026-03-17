import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import type { ChildProcess, ChildProcessWithoutNullStreams } from "node:child_process";
import * as p from "@clack/prompts";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { isWorkspaceInitialized } from "./workspace.js";

type CliProgram = Parameters<Parameters<OpenClawPluginApi["registerCli"]>[0]>[0]["program"];

type CliOpts = {
  program: CliProgram;
  workspaceDir: string;
};

type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

function runN8nac(
  args: string[],
  opts: {
    cwd: string;
    timeout: number;
    stdinInput?: string;
    stdio?: "pipe" | "inherit";
  },
): Promise<RunResult> {
  return new Promise((resolve) => {
    const baseOptions = {
      cwd: opts.cwd,
    };

    const child: ChildProcess | ChildProcessWithoutNullStreams =
      opts.stdio === "inherit"
        ? spawn("npx", ["--yes", "n8nac", ...args], { ...baseOptions, stdio: "inherit" })
        : spawn("npx", ["--yes", "n8nac", ...args], { ...baseOptions, stdio: "pipe" });

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

    if ("stdout" in child && child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
    }

    if ("stderr" in child && child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
    }

    if (opts.stdinInput !== undefined && "stdin" in child && child.stdin) {
      child.stdin.write(`${opts.stdinInput}\n`);
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
    }, opts.timeout);

    child.on("error", (error: Error) => {
      finish({ stdout, stderr: error.message || stderr, exitCode: 1, timedOut });
    });

    child.on("close", (code: number | null) => {
      finish({ stdout, stderr, exitCode: code ?? 1, timedOut });
    });
  });
}

export function registerN8nAcCli({ program, workspaceDir }: CliOpts): void {
  // -------------------------------------------------------------------------
  // n8nac:status — quick health check
  // -------------------------------------------------------------------------
  program
    .command("n8nac:status")
    .description("Show n8n-as-code workspace status")
    .action(() => {
      const initialized = isWorkspaceInitialized(workspaceDir);
      console.log(`\nn8n-as-code workspace: ${workspaceDir}`);
      console.log(`Status: ${initialized ? "✓  Initialized" : "✗  Not initialized"}`);
      if (!initialized) {
        console.log("\nRun `openclaw n8nac:setup` to connect your n8n instance.");
      }
      console.log();
    });

  // -------------------------------------------------------------------------
  // n8nac:setup — interactive wizard
  // -------------------------------------------------------------------------
  program
    .command("n8nac:setup")
    .description("Initialize or reconfigure the n8n-as-code workspace")
    .option("--host <url>", "n8n host URL (skip prompt)")
    .option("--api-key <key>", "n8n API key (skip prompt)")
    .option("--project-index <n>", "Project index to select non-interactively")
    .action(async (opts: { host?: string; apiKey?: string; projectIndex?: string }) => {
      p.intro("n8n-as-code setup");

      // Ensure workspace dir exists.
      mkdirSync(workspaceDir, { recursive: true });
      p.log.info(`Workspace: ${workspaceDir}`);

      // ------------------------------------------------------------------
      // Step 1: Collect credentials
      // ------------------------------------------------------------------
      let host = opts.host ?? "";
      if (!host) {
        const answer = await p.text({
          message: "n8n host URL",
          placeholder: "https://your-n8n.example.com",
          validate: (v) => (v && v.startsWith("http") ? undefined : "Must start with http:// or https://"),
        });
        if (p.isCancel(answer)) {
          p.cancel("Setup cancelled.");
          process.exit(0);
        }
        host = answer as string;
      }

      let apiKey = opts.apiKey ?? "";
      if (!apiKey) {
        const answer = await p.password({
          message: "n8n API key",
          validate: (v) => (v && v.length > 0 ? undefined : "API key cannot be empty"),
        });
        if (p.isCancel(answer)) {
          p.cancel("Setup cancelled.");
          process.exit(0);
        }
        apiKey = answer as string;
      }

      // ------------------------------------------------------------------
      // Step 2: init-auth
      // ------------------------------------------------------------------
      const authSpinner = p.spinner();
      authSpinner.start("Saving credentials…");

      const authResult = await runN8nac(["init-auth", "--host", host, "--api-key-stdin"], {
        cwd: workspaceDir,
        timeout: 60_000,
        stdinInput: apiKey,
      });

      if (authResult.exitCode !== 0) {
        authSpinner.stop("Failed to save credentials.");
        if (authResult.timedOut) {
          p.log.error("n8nac init-auth timed out.");
        }
        p.log.error(authResult.stderr || authResult.stdout || "Unknown error.");
        p.outro("Setup failed. Check your host URL and API key and try again.");
        process.exit(1);
      }
      authSpinner.stop("Credentials saved ✓");

      // ------------------------------------------------------------------
      // Step 3: init-project
      // If the user passed --project-index, run non-interactively.
      // Otherwise inherit stdio so n8nac's own interactive project picker can appear.
      // ------------------------------------------------------------------
      const projectSpinner = p.spinner();
      const projectArgs = ["init-project", "--sync-folder", "workflows"];
      let projectResult: RunResult;

      if (opts.projectIndex) {
        const projectIdx = Number.parseInt(opts.projectIndex, 10);
        if (!Number.isInteger(projectIdx) || projectIdx < 1) {
          p.log.error("--project-index must be a positive integer.");
          p.outro("Setup failed.");
          process.exit(1);
        }
        projectSpinner.start("Selecting project…");
        projectResult = await runN8nac([...projectArgs, "--project-index", String(projectIdx)], {
          cwd: workspaceDir,
          timeout: 120_000,
        });
      } else {
        projectSpinner.start("Opening project picker…");
        projectSpinner.stop("Project picker ready");
        projectResult = await runN8nac(projectArgs, {
          cwd: workspaceDir,
          timeout: 120_000,
          stdio: "inherit",
        });
      }

      if (projectResult.exitCode !== 0) {
        projectSpinner.stop("Failed to select project.");
        if (projectResult.timedOut) {
          p.log.error("n8nac init-project timed out.");
        }
        p.log.error(projectResult.stderr || projectResult.stdout || "Unknown error.");
        p.log.info("If you have multiple projects, rerun with --project-index <n>.");
        p.outro("Setup failed.");
        process.exit(1);
      }
      projectSpinner.stop("Project selected ✓");

      // ------------------------------------------------------------------
      // Step 4: update-ai — generate AGENTS.md
      // ------------------------------------------------------------------
      const aiSpinner = p.spinner();
      aiSpinner.start("Generating AI context (AGENTS.md)…");
      const aiResult = await runN8nac(["update-ai"], {
        cwd: workspaceDir,
        timeout: 60_000,
      });

      if (aiResult.exitCode !== 0) {
        aiSpinner.stop("Failed to generate AI context.");
        if (aiResult.timedOut) {
          p.log.error("n8nac update-ai timed out.");
        }
        p.log.error(aiResult.stderr || aiResult.stdout || "Unknown error.");
        p.outro(
          "Setup partially completed: credentials and project were saved, but AGENTS.md generation failed. " +
            "Run `npx --yes n8nac update-ai` after fixing the issue.",
        );
        process.exit(1);
      }
      aiSpinner.stop("AI context ready ✓");

      p.log.step("What's next?");
      p.log.message(
        [
          "  1. Restart the OpenClaw gateway to activate the plugin:",
          "       openclaw gateway restart",
          "",
          "  2. Ask OpenClaw to create a workflow in plain language, for example:",
          '       "Create an n8n workflow that sends a Slack message every morning"',
          "",
          "  3. Useful commands:",
          "       openclaw n8nac:status   — check workspace + connection health",
          "       openclaw n8nac:setup    — reconfigure host / API key",
          "",
          "  4. Manage workflows directly:",
          "       npx n8nac list          — list local & remote workflows",
          "       npx n8nac pull <id>     — download a workflow from n8n",
          "       npx n8nac push <file>   — upload a workflow to n8n",
        ].join("\n"),
      );

      p.outro(
        `Setup complete!\n` +
          `Workspace: ${workspaceDir}`,
      );
    });
}
