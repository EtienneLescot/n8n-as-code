import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getChildEnv } from "../src/child-env.js";

// Snapshot the original env so tests don't bleed into each other
const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe("getChildEnv", () => {
  it("forwards essential system vars", () => {
    process.env.PATH = "/usr/bin:/usr/local/bin";
    process.env.HOME = "/home/user";
    process.env.TMPDIR = "/tmp";

    const env = getChildEnv();

    expect(env.PATH).toBe("/usr/bin:/usr/local/bin");
    expect(env.HOME).toBe("/home/user");
    expect(env.TMPDIR).toBe("/tmp");
  });

  it("forwards Windows path vars case-insensitively", () => {
    process.env.Path = "C:\\Windows\\System32";
    process.env.SYSTEMROOT = "C:\\Windows";
    process.env.COMSPEC = "C:\\Windows\\System32\\cmd.exe";
    process.env.PATHEXT = ".COM;.EXE;.BAT";

    const env = getChildEnv();

    expect(env.Path).toBe("C:\\Windows\\System32");
    expect(env.SYSTEMROOT).toBe("C:\\Windows");
    expect(env.COMSPEC).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(env.PATHEXT).toBe(".COM;.EXE;.BAT");
  });

  it("forwards safe npm_ vars", () => {
    process.env.npm_execpath = "/usr/lib/node_modules/npm/bin/npm-cli.js";
    process.env.npm_node_execpath = "/usr/bin/node";
    process.env.npm_config_cache = "/home/user/.npm";

    const env = getChildEnv();

    expect(env.npm_execpath).toBe("/usr/lib/node_modules/npm/bin/npm-cli.js");
    expect(env.npm_node_execpath).toBe("/usr/bin/node");
    expect(env.npm_config_cache).toBe("/home/user/.npm");
  });

  it("blocks npm_ vars that look like credentials", () => {
    process.env["npm_config_//registry.npmjs.org/:_authToken"] = "secret-token"; // standard npm per-registry auth token format
    process.env.npm_config_password = "hunter2";
    process.env.npm_config_registry_token = "reg-token";

    const env = getChildEnv();

    expect(env["npm_config_//registry.npmjs.org/:_authToken"]).toBeUndefined();
    expect(env.npm_config_password).toBeUndefined();
    expect(env.npm_config_registry_token).toBeUndefined();
  });

  it("blocks NODE_AUTH_TOKEN and other secret NODE_ vars", () => {
    process.env.NODE_AUTH_TOKEN = "ghp_secret";
    process.env.NODE_API_KEY = "some-api-key";
    process.env.NODE_SECRET = "s3cr3t";

    const env = getChildEnv();

    expect(env.NODE_AUTH_TOKEN).toBeUndefined();
    expect(env.NODE_API_KEY).toBeUndefined();
    expect(env.NODE_SECRET).toBeUndefined();
  });

  it("forwards safe NODE_* vars", () => {
    process.env.NODE_ENV = "production";
    process.env.NODE_OPTIONS = "--max-old-space-size=4096";
    process.env.NODE_NO_WARNINGS = "1";

    const env = getChildEnv();

    expect(env.NODE_ENV).toBe("production");
    expect(env.NODE_OPTIONS).toBe("--max-old-space-size=4096");
    expect(env.NODE_NO_WARNINGS).toBe("1");
  });

  it("forwards N8N_AS_CODE_ vars", () => {
    process.env.N8N_AS_CODE_ASSETS_DIR = "/workspace/assets";

    const env = getChildEnv();

    expect(env.N8N_AS_CODE_ASSETS_DIR).toBe("/workspace/assets");
  });

  it("blocks arbitrary LLM API keys and other sensitive vars", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-secret";
    process.env.OPENAI_API_KEY = "sk-openai-secret";
    process.env.OPENAI_API_SECRET = "sk-secret";
    process.env.CLAUDE_API_KEY = "claude-secret";
    process.env.MY_CUSTOM_SECRET = "top-secret";

    const env = getChildEnv();

    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_SECRET).toBeUndefined();
    expect(env.CLAUDE_API_KEY).toBeUndefined();
    expect(env.MY_CUSTOM_SECRET).toBeUndefined();
  });
});
