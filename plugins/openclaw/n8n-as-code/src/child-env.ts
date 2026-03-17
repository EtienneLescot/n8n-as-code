/**
 * Build a minimal environment for child processes.
 * Only passes the vars needed for npx/node to operate, deliberately excluding
 * any sensitive credentials that the parent (agent host) may hold in its env
 * (e.g. LLM API keys), preventing accidental credential forwarding.
 */
export function getChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  // Matches var names that look like credentials anywhere in the name — these are never forwarded
  // even if they match another allowlist prefix (e.g. NODE_AUTH_TOKEN, npm_config_*:_authToken,
  // npm_config_authority is intentionally over-blocked since we prefer false-positives to leaks).
  const secretPattern = /(?:auth|token|password|secret|apikey|api_key|_key)/i;

  for (const key of Object.keys(process.env)) {
    const upperKey = key.toUpperCase();
    if (
      // Basic system vars needed by node/npx (case-insensitive, including Windows-specific ones)
      /^(PATH|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|TMPDIR|TMP|TEMP|LANG|LC_ALL|SHELL|TERM|TERM_PROGRAM|NODE_PATH|NODE_OPTIONS|SYSTEMROOT|COMSPEC|PATHEXT)$/.test(
        upperKey,
      ) ||
      // npm execution/config vars required by npx — but NOT auth/token vars
      // (e.g. excludes npm_config_//registry.npmjs.org/:_authToken)
      (key.startsWith("npm_") && !secretPattern.test(key)) ||
      // Specific safe NODE_* vars (deliberately NOT a prefix match to exclude NODE_AUTH_TOKEN)
      /^NODE_(ENV|NO_WARNINGS|ICU_DATA)$/.test(upperKey) ||
      // n8n-as-code specific vars
      key.startsWith("N8N_AS_CODE_")
    ) {
      env[key] = process.env[key];
    }
  }
  return env;
}
