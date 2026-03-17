/**
 * Build a minimal environment for child processes.
 * Only passes the vars needed for npx/node to operate, deliberately excluding
 * any sensitive credentials that the parent (agent host) may hold in its env
 * (e.g. LLM API keys), preventing accidental credential forwarding.
 */
export function getChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(process.env)) {
    if (
      // Basic system vars needed by node/npx
      /^(PATH|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|TMPDIR|TMP|TEMP|LANG|LC_ALL|SHELL|TERM|TERM_PROGRAM|NODE_PATH|NODE_OPTIONS)$/.test(key) ||
      // npm/node config vars required by npx
      key.startsWith("npm_") ||
      key.startsWith("NODE_") ||
      // n8n-as-code specific vars
      key.startsWith("N8N_AS_CODE_")
    ) {
      env[key] = process.env[key];
    }
  }
  return env;
}
