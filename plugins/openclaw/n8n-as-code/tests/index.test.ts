import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createTestPluginApi(api: Partial<OpenClawPluginApi>): OpenClawPluginApi {
  return {
    id: "n8nac",
    name: "n8n-as-code",
    source: "test",
    config: {},
    runtime: {} as never,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    registerTool() {},
    registerHook() {},
    registerHttpRoute() {},
    registerChannel() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerService() {},
    registerProvider() {},
    registerCommand() {},
    registerContextEngine() {},
    resolvePath(input: string) {
      return input;
    },
    on() {},
    ...api,
  };
}

describe("OpenClaw prompt context scoping", () => {
  it("injects AGENTS.md only for the active n8n workspace session", async () => {
    const n8nWorkspaceDir = createTempDir("n8nac-workspace-");
    fs.mkdirSync(n8nWorkspaceDir, { recursive: true });
    fs.writeFileSync(
      path.join(n8nWorkspaceDir, "n8nac-config.json"),
      JSON.stringify(
        {
          host: "https://n8n.example.com",
          projectId: "proj_123",
          projectName: "Demo Project",
          syncFolder: "workflows",
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(n8nWorkspaceDir, "AGENTS.md"), "# Generated AI Context\n");

    const otherWorkspaceDir = createTempDir("other-workspace-");
    const on = vi.fn();

    vi.doMock("../src/workspace.js", async () => {
      const actual = await vi.importActual<typeof import("../src/workspace.js")>("../src/workspace.js");
      return {
        ...actual,
        getWorkspaceDir: () => n8nWorkspaceDir,
      };
    });

    const { default: plugin } = await import("../index.js");
    plugin.register?.(
      createTestPluginApi({
        id: "n8nac",
        name: "n8n-as-code",
        description: "n8n-as-code",
        source: "test",
        config: {},
        runtime: {} as never,
        on,
      }),
    );

    const beforePromptBuild = on.mock.calls.find((call) => call[0] === "before_prompt_build")?.[1];
    expect(beforePromptBuild).toBeTypeOf("function");

    expect(
      await beforePromptBuild?.({ prompt: "hello", messages: [] }, { workspaceDir: otherWorkspaceDir }),
    ).toBeUndefined();

    const result = await beforePromptBuild?.({ prompt: "hello", messages: [] }, { workspaceDir: n8nWorkspaceDir });
    expect(result).toMatchObject({
      prependContext: expect.stringContaining("# Generated AI Context"),
    });
    expect(result?.prependContext).toContain("## ✅ n8n-as-code Workspace Status");
    expect(result?.prependContext).toContain(`- Workspace directory: \`${n8nWorkspaceDir}\``);
  });
});
