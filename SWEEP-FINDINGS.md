# Sweep adversarial — branche claude/n8n-harness-benchmark-optimize-7d29cd (post-corrections)

Source : workflow wklav9a3t (89 agents, terminé 09/09 09:21).
Le critique final de complétude N'A PAS tourné (limite de session) — liste possiblement incomplète.
Bilan : 12 confirmés (4 HIGH, 3 MEDIUM, 5 LOW), 14 réfutés.

## 1. [HIGH] node-schema/node-info now return the parent node for any "<X> Trigger" / "<X> Tool" / sub-node display name (126 nodes), silently and with exit 0
**Fichier** : `packages/skills/src/services/node-schema-provider.ts:551`
**Vérification** : True (0 réfuteur(s) sur 3)

- **mechanism** : `isSameNodeName` (new, lines 545-552) accepts a candidate whenever the SHORTER normalized name is contained in the longer one, in EITHER direction: `const [short, long] = q.length <= c.length ? [q, c] : [c, q]; if (short.length >= 4 && long.includes(short)) return true;`. For the query `Slack Trigger` the normalized query is `slacktrigger` and the candidate `slack` normalizes to `slack`, so the candidate is the substring and the gate passes. `resolveNode` (line 575) then sorts survivors `a.name.length - b.name.length` ("shortest wins"), which puts the parent node `slack` ahead of the correct `slackTrigger`. Both commands route through this: skills-commander.ts:360 `const resolution = resolveNode(provider, name)` inside `emitNodes`. The mismatch is announced only on stderr (skills-commander.ts:371 `Note: 'X' resolved to 'Y'.`) while stdout carries the wrong node's TypeScript/JSON and the process exits 0, so an agent that reads stdout gets a confident wrong answer.

- **baseline** : origin/main's node-schema used the search relevance score: `const searchResults = provider.searchNodes(name, 1); if (searchResults.length > 0 && ((searchResults[0].relevanceScore || 0) > 80 || ...)) schema = provider.getNodeSchema(searchResults[0].name);`. searchNodes ranks an exact displayName match at +800, so `Slack Trigger` returned `slackTrigger`, `Google Sheets Trigger` returned `googleSheetsTrigger`, `OpenAI Chat Model` returned `lmChatOpenAi`, `Respond to Webhook` returned `respondToWebhook`. origin/main's node-info was exact-only, so it returned an honest "not found" rather than a wrong node.

- **repro** : cd G:/repos/n8n-as-code/.claude/worktrees/add-funding-yml-9b2f33 && npx tsc -b packages/skills, then run node-schema through the real command wiring: cat > /tmp/cli.mjs <<'EOF' import { Command } from 'file:///G:/repos/n8n-as-code/node_modules/commander/index.js'; const { registerSkillsCommands } = await import('file:///G:/repos/n8n-as-code/.claude/worktrees/add-funding-yml-9b2f33/packages/skills/dist/commands/skills-commander.js'); const program = new Command(); registerSkillsCommands(program, 'G:/repos/n8n-as-code/.claude/worktrees/add-funding-yml-9b2f33/packages/skills/dist/assets'); await program.parseAsync(process.argv); EOF node /tmp/cli.mjs node-schema "Slack Trigger" node /tmp/cli.mjs node-schema "Google Sheets Trigger" node /tmp/cli.mjs node-schema "OpenAI Chat Model" --json; echo EXIT=$?

- **observed** : `node-schema "Slack Trigger"` prints `type: 'n8n-nodes-base.slack'` with `Note: 'Slack Trigger' resolved to 'slack'.` on stderr. `node-schema "Google Sheets Trigger"` prints `type: 'n8n-nodes-base.googleSheets'`. `node-schema "OpenAI Chat Model" --json` prints `"name": "openAi"` on stdout and exits 0. Exhaustive sweep of all 831 node keys + their .type strings + their displayNames (2487 distinct queries): 126 queries resolve to a DIFFERENT node than origin/main did — 36 are "<X> Trigger", 66 are "<X> Tool", 24 are sub-nodes (`Respond to Webhook`->webhook, `Anthropic Chat Model`->anthropic, `Embeddings OpenAI`->openAi, `Postgres Chat Memory`->chat, `HTTP Request Tool`->httpRequest, `Function Item`->function, ...). All 126 are displayName queries; zero node keys and zero .type strings regressed.

- **fix** : Judge the candidate on its displayName as well as its name, and let an exact normalized match win instead of "shortest wins". In `isSameNodeName`, compare the query against both `hit.name` and `hit.displayName`; in `resolveNode`, sort candidates by normalized edit distance to the query (closest first) rather than `a.name.length - b.name.length`. That makes `Slack Trigger` match `slackTrigger` on displayName exactly and rank it above `slack`. Additionally, restrict the containment rule to the direction that actually means abbreviation (query contained in candidate) — a candidate contained in the query means the query carries a qualifier the candidate lacks, which is exactly the Trigger/Tool failure.

## 2. [HIGH] node-schema resolves a node's display name to the wrong node (126 of 831 nodes), e.g. "Slack Trigger" -> slack
**Fichier** : `packages/skills/src/services/node-schema-provider.ts:575`
**Vérification** : True (0 réfuteur(s) sur 3)

- **mechanism** : skills-commander.ts:443-489 replaced node-schema's own fallback with the new shared `resolveNode`. In resolveNode the candidate list is filtered by `isSameNodeName` (line 573) and then sorted by name length only (line 575, "Shortest wins"), so a candidate that normalizes EXACTLY to the query loses to a shorter candidate that merely contains it as a substring. `normalizeNodeName('Slack Trigger') === 'slacktrigger'` matches `slackTrigger` exactly, but `slack` (5 chars, and 'slacktrigger'.includes('slack')) also passes the filter and sorts first, so `slack` is returned. The same collision hits every '<X> Trigger' display name and several others.

- **baseline** : origin/main's node-schema fallback (`searchNodes(name,1)` accepted when `relevanceScore > 80` or exact lowercase name) returned `slackTrigger`, which is the node the user named.

- **repro** : cd G:/repos/n8n-as-code/.claude/worktrees/add-funding-yml-9b2f33 && node packages/skills/dist/cli.js node-schema "Slack Trigger" | grep -m1 "type:" # also: node-schema "Google Sheets Trigger", "ClickUp Trigger", "Telegram Trigger", "OpenAI Chat Model"

- **observed** : stdout: `type: 'n8n-nodes-base.slack'` with exit code 0 (only stderr carries `Note: 'Slack Trigger' resolved to 'slack'.`). `node-schema "Google Sheets Trigger"` prints `type: 'n8n-nodes-base.googleSheets'`. A sweep of all 831 display names against origin/main's transcribed rule (run with the same, unchanged NodeSchemaProvider) gives: 612 unchanged, 126 that used to resolve to the right node and now resolve to a DIFFERENT one, 92 that now fail outright. `search` prints the display name as `name:` under the banner "Copy and paste the node you need", so this is the documented next step, and an agent piping stdout writes the non-trigger node's type into the workflow.

- **fix** : In resolveNode, rank an exactly-normalized name above the shortest name: `const q = normalizeNodeName(name); ... .sort((a, b) => (Number(normalizeNodeName(b.name) === q) - Number(normalizeNodeName(a.name) === q)) || a.name.length - b.name.length);`. Verified: it fixes 102 of the 126 wrong answers and every existing resolveNode test case still passes ('slackk'->slack, 'httpReq'->httpRequest, 'sheets'->googleSheets, 'postgresql'->postgres, misses stay misses).

## 3. [HIGH] node-schema now answers "not found" for 92 node display names it used to resolve (Send Email, Brevo, Customer.io, Monday.com, ...)
**Fichier** : `packages/skills/src/services/node-schema-provider.ts:573`
**Vérification** : True (0 réfuteur(s) sur 3)

- **mechanism** : resolveNode's candidate filter (line 573) judges a search hit on `hit.name` alone. origin/main's node-schema fallback accepted the top search hit on `relevanceScore`, which the provider computes from displayName/description/keywords too. So every node whose display name shares no substring with its internal name — `Send Email`/emailSend, `Brevo`/sendInBlue, `Customer.io`/customerIo, `APITemplate.io`/apiTemplateIo, `Monday.com`/mondayCom, `Webex by Cisco`/ciscoWebex, `Execute Sub-workflow`/executeWorkflow — is filtered out even when the provider ranked it first.

- **baseline** : origin/main printed the emailSend snippet for `node-schema "Send Email"` and exited 0.

- **repro** : cd G:/repos/n8n-as-code/.claude/worktrees/add-funding-yml-9b2f33 && node packages/skills/dist/cli.js node-schema "Send Email"; echo EXIT=$?

- **observed** : Empty stdout, exit code 1, stderr `Node 'Send Email' not found. Did you mean: emailSend, emailSendTool, ...`. 92 of the 831 display names behave this way; each one costs the agent an extra round trip on a name the tool itself printed. The old rule resolved all 92 to the correct node.

- **fix** : Accept a candidate whose display name is the query: in the filter at line 573, `.filter(hit => isSameNodeName(name, hit.name) || normalizeNodeName(name) === normalizeNodeName(hit.displayName || ''))` (searchNodes already returns displayName). This is exact equality, not a second fuzzy channel, so it cannot invent a node. Caveat worth a decision: the branch's own test asserts `resolveNode(real, 'sendEmail')` is undefined ('refuses to invent a node'), and that case normalizes to the `Send Email` display name — so this fix intentionally overrides that test's premise.

## 4. [HIGH] SKILL.md step 3 now tells agents to skip environment setup when `env status --json` resolves, but the new keyless `.env` fallback resolves without an API key
**Fichier** : `skills/n8n-architect/SKILL.md:50`
**Vérification** : True (0 réfuteur(s) sur 3)

- **mechanism** : Two new lines of the diff combine. `packages/cli/src/services/config-service.ts:695` adds `resolveEnvironmentFromEnvFile()`, wired into `resolveEnvironment()` at the `config.environments.length === 0` branch; it builds a complete `default` environment from `.env` with `apiKey` OPTIONAL (`apiKey: cleanOptional(parsed.N8N_API_KEY)`), so `env status --json` returns a full resolved environment carrying `apiKeyAvailable: false` / `accessStatus: "missing-api-key"`. In parallel SKILL.md:50 (all five copies) changes step 3 from `Run env status --json.` to `Run env status --json. If it resolves, the workspace is ready — skip steps 4-9.` Steps 4-9 are exactly the ones that run `env auth set`. The doc's own new line 41 tells the agent `N8N_API_KEY` is optional. So a doc-following agent writes a host-only `.env`, sees status resolve, declares readiness and skips the key.

- **baseline** : At origin/main `resolveEnvironment()` unconditionally threw `No workspace environment is configured. Run \`n8nac env add\` first.` when `config.environments.length === 0`, so a workspace holding only a `.env` reported `configured: false` and the agent fell through to steps 4-9 and bound an API key. Step 3 at main had no skip clause.

- **repro** : mkdir /tmp/wsB && cd /tmp/wsB && printf 'N8N_HOST=http://localhost:5678\n' > .env node <worktree>/packages/cli/dist/index.js env status --json # step 3 per SKILL.md node <worktree>/packages/cli/dist/index.js list # agent proceeds, having skipped steps 4-9

- **observed** : `env status --json` exits 0 and returns a fully resolved environment (`"environmentName": "default"`, `"host": "http://localhost:5678"`) but with `"apiKeyAvailable": false`, `"apiKeySource": "missing"`, `"accessStatus": "missing-api-key"`. The human `env status` prints `API key : missing / Access : missing-api-key` and still exits 0. The very next command fails: `n8nac list` exits 1 with `Environment "default" needs a host and API key before this command can run.` The agent was told the workspace was ready and skipped the only steps that would have fixed it.

- **fix** : Make the doc's predicate the same one the CLI gates on, in all five SKILL.md copies (edit `packages/skills/src/agent-skills/n8n-architect/SKILL.md:50`, then `npm run build:adapters --workspace=packages/skills`): `3. Run env status --json. If it resolves AND accessStatus is not missing-api-key, the workspace is ready — skip steps 4-9.` `accessStatus` is already computed by `deriveAccessStatus` for every environment kind, so this holds for `.env`-derived and `env add`-created environments alike — no per-case rule.

## 5. [MEDIUM] `env status` now asserts `Access: ready` for any host that answers, including a non-n8n host or an n8n with the public API disabled
**Fichier** : `packages/cli/src/core/services/n8n-api-client.ts:294`
**Vérification** : True (0 réfuteur(s) sur 2)

- **mechanism** : `verifyAccess()` (n8n-api-client.ts:287-298, new) treats every HTTP status other than 401/403 as success: `if (status) return { ok: true, status }`. `probeEnvironmentAccess` (index.ts:864) maps that to `'ready'`, and `env status` prints it as the readiness verdict. A 404 from a reverse proxy, a wrong port serving some other app, or n8n itself with `N8N_PUBLIC_API_DISABLED=true` (which 404s `/api/v1/*`) all satisfy the check, so the command that the generated guidance calls "the source of effective workspace readiness" green-lights a target on which every subsequent n8nac call fails.

- **baseline** : origin/main printed no Access line at all and left `accessStatus` at the never-written `unknown`; it made no reachability claim, so no consumer could be misled by one.

- **repro** : node -e "require('http').createServer((q,s)=>{s.writeHead(404);s.end('<html>not n8n</html>')}).listen(45998,'127.0.0.1')" & mkdir ws6 && cd ws6 && printf 'N8N_HOST=http://127.0.0.1:45998\nN8N_API_KEY=totally-invalid\n' > .env node G:/repos/n8n-as-code/.claude/worktrees/add-funding-yml-9b2f33/packages/cli/dist/index.js env status

- **observed** : `API key : env` / `Access : ready` against a server that is not n8n and with a bogus key; `env status --json` likewise carries `"accessStatus": "ready"`.

- **fix** : Only accept a response that proves the n8n public API answered: treat 2xx as `ready`, 401/403 as `invalid-api-key`, and every other status (404/5xx/HTML) as `runtime-unavailable` instead of `ok: true`.

## 6. [MEDIUM] `env status` hangs for ~30s on an unresponsive host: the 5s probe cap bounds the printout, not the process
**Fichier** : `packages/cli/src/index.ts:851`
**Vérification** : True (0 réfuteur(s) sur 3)

- **mechanism** : `probeEnvironmentAccess` (index.ts:838-869, new in this diff) races `client.verifyAccess()` against a `setTimeout` rejection at 5000ms. When the timer wins, nothing aborts the in-flight axios request — there is no `signal`/per-request `timeout` — so its open Socket keeps the Node event loop alive. The action prints and returns, `parseAsync` resolves, but the process cannot exit until the axios instance default `timeout: 30_000` (added in the same diff at packages/cli/src/core/services/n8n-api-client.ts:94) finally kills the socket. `env status` never calls `process.exit` on the success path. Same mechanism makes any host slower than 5s report `runtime-unavailable` while still holding the process for the remaining 25s.

- **baseline** : origin/main's `env status` action did no network I/O at all (it only called `configService.resolveEnvironment` and printed); it returned in ~0.25s regardless of host reachability.

- **repro** : node -e "require('net').createServer(()=>{}).listen(45999,'127.0.0.1')" & # accepts TCP, never answers mkdir ws && cd ws && printf 'N8N_HOST=http://127.0.0.1:45999\nN8N_API_KEY=abc\n' > .env node G:/repos/n8n-as-code/.claude/worktrees/add-funding-yml-9b2f33/packages/cli/dist/index.js env status # also isolated: C:/Users/etien/AppData/Local/Temp/claude/probe-repro.mjs replays the exact race

- **observed** : Output printed at +5.2s, process exited at +30.2s (timestamped spawn: `[+5239ms stdout] ... [+30253ms exit] code=0`). The isolated repro prints `[+5154ms] caught: probe timed out` then `handles: [ 'Socket' ]` and `[+30161ms] process exit`. Same command with `--no-probe` returns in 0.26s. This is the first command the shipped agent guidance tells an agent to run (`packages/skills/src/agent-skills/n8n-architect/SKILL.md:24`, `packages/cli/README.md:92`), so an agent on a VPN-down/sleeping-container host now blocks 30s on step 1.

- **fix** : Make the request itself cancellable instead of racing an unabortable promise: give `verifyAccess(timeoutMs)` the budget and pass it through — `this.client.get('/api/v1/projects', { params: { limit: 1 }, timeout: timeoutMs, signal: AbortSignal.timeout(timeoutMs) })` — then delete the `Promise.race`/`setTimeout` in `probeEnvironmentAccess` and just await it.

## 7. [MEDIUM] 92 node display names that resolved at origin/main now exit 1 with "not found" (Send Email, Edit Fields (Set), Simple Memory, Structured Output Parser, Pinecone Vector Store, ...)
**Fichier** : `packages/skills/src/services/node-schema-provider.ts:545`
**Vérification** : True (0 réfuteur(s) sur 3)

- **mechanism** : `isSameNodeName` judges only on the candidate's `name` (its ontology key) — `resolveNode` line 573 filters `provider.searchNodes(name, 8).filter((hit: any) => isSameNodeName(name, hit.name))`. A display name that is not a morphological variant of the key never passes: `Send Email` normalizes to `sendemail` while the key `emailSend` normalizes to `emailsend` — not equal, no containment, edit distance 8 (> 2). The hit is dropped, `resolveNode` returns undefined, and skills-commander.ts:365-374 prints `Node 'X' not found.` and `process.exit(1)` (line 379).

- **baseline** : origin/main's node-schema accepted the top search hit when `relevanceScore > 80`. `calculateRelevance` adds +800 for an exact displayName match, so `Send Email` scored well past the threshold and returned `emailSend`; `Edit Fields (Set)` returned `set`; `Simple Memory` returned `memoryBufferWindow`; `Basic LLM Chain` returned `chainLlm`; `Pinecone Vector Store` returned `vectorStorePinecone`.

- **repro** : Using the /tmp/cli.mjs harness from the previous finding: node /tmp/cli.mjs node-schema "Send Email"; echo EXIT=$? node /tmp/cli.mjs node-schema "Edit Fields (Set)"; echo EXIT=$? node /tmp/cli.mjs node-schema "Basic LLM Chain"; echo EXIT=$?

- **observed** : `Node 'Send Email' not found. Did you mean: emailSend, emailSendTool, awsSesTool, sendGridTool, slackTool?` with EXIT=1; `Node 'Edit Fields (Set)' not found. Did you mean: set, ...` with EXIT=1. The suggestion list contains the correct node, so the resolver had the right answer in hand and rejected it. Full sweep: 92 of the 831 display names regress this way, including `Send Email`, `Edit Fields (Set)`, `Execute Sub-workflow`, `RSS Read`, `Simple Memory`, `Structured Output Parser`, `Ollama Chat Model`, `Pinecone Vector Store`, `Qdrant Vector Store`, `Groq Chat Model`, `MCP Server Trigger`, `Code Tool`.

- **fix** : Same one-line change as the previous finding: have `isSameNodeName` also compare the normalized query against the candidate's `displayName` (searchNodes already returns it on every stub). Every one of the 92 is an exact normalized displayName match, so a single `normalizeNodeName(query) === normalizeNodeName(hit.displayName)` branch recovers all of them without any per-node heuristic.

## 8. [LOW] `env list --json` returns a bare array with different record fields when the environment comes from a workspace `.env`
**Fichier** : `packages/cli/src/index.ts:533`
**Vérification** : True (1 réfuteur(s) sur 3)

- **mechanism** : The new early-return branch at index.ts:522-539 calls `printJsonOrText(options, [{ name, host, source, active }], ...)` — a top-level JSON *array* of a four-field record — while the unchanged fall-through path at index.ts:546-548 still prints the object `{ activeEnvironmentId, environments: [{ id, name, syncSlug, environmentTargetId, workflowsPath, projectId, ..., resolved }] }`. The branch is taken whenever `listEnvironments()` is empty but `resolveEnvironment()` succeeds, i.e. exactly the new zero-config `.env` workspace the branch advertises. `id` and `workflowsPath` — the values needed to feed `env pin`/`env status`/`env remove` — are absent from the derived record.

- **baseline** : origin/main had a single `printJsonOrText` in this action, so `env list --json` always returned the object form; in a `.env`-only workspace it returned `{ environments: [] }`, which `.environments` consumers read as an empty list rather than as `undefined`.

- **repro** : CLI=G:/repos/n8n-as-code/.claude/worktrees/add-funding-yml-9b2f33/packages/cli/dist/index.js mkdir a && cd a && printf 'N8N_HOST=http://127.0.0.1:9\nN8N_API_KEY=abc\n' > .env && node $CLI env list --json cd .. && mkdir b && cd b && node $CLI env list --json

- **observed** : In the `.env` dir: `[ { "name": "default", "host": "http://127.0.0.1:9", "source": "env-file", "active": true } ]`. In the empty dir: `{ "environments": [] }`. Same command, same flag, two incompatible top-level types; `jq '.environments'` yields null in the first case and any script reading `.environments[].id` silently sees zero environments in a workspace that has one.

- **fix** : Emit the derived environment through the existing shape — `{ activeEnvironmentId: derived.environmentId, environments: [{ ...derivedRecord, resolved: redactResolvedEnvironment(derived) }] }` — and keep the friendlier wording for the text branch only.

## 9. [LOW] A missing workflows index kills every `examples` subcommand with a raw unhandled-rejection stack trace instead of the intended message
**Fichier** : `packages/skills/src/commands/skills-commander.ts:186`
**Vérification** : True (0 réfuteur(s) sur 1)

- **mechanism** : WorkflowRegistry's constructor now throws on a missing index (workflow-registry.ts:69-73) and getRegistry (line 186) passes an explicit `join(assetsDir,'workflows-index.json')`, so the registry can no longer self-resolve. None of the four `examples` actions (lines 884, 914, 924, 959) has a try/catch — unlike every other command in the file — so the throw escapes the async action handler as an unhandled promise rejection.

- **baseline** : origin/main constructed `new WorkflowRegistry()` with no path; on a miss it logged `Workflow index not found ... AI workflow search will be disabled.` and returned an empty index, so `examples search x` printed `No workflows found matching "x"` and exited 0.

- **repro** : node -e "const {Command}=await import('file:///G:/repos/n8n-as-code/node_modules/commander/index.js');const {registerSkillsCommands}=await import('file:///G:/repos/n8n-as-code/.claude/worktrees/add-funding-yml-9b2f33/packages/skills/dist/cli-entry.js');const p=new Command();registerSkillsCommands(p,'G:/does/not/exist/assets');p.parse(['n','x','examples','search','invoice'])" --input-type=module

- **observed** : Node prints the constructor's stack trace (`Error: Workflow example index not found (searched G:\does\not\exist\assets\workflows-index.json)...` plus 3 frames of internal paths) and exits 1. Failing loudly is the intended change; leaking a stack trace is not, and it is the only command family in the file that does.

- **fix** : Wrap the four `examples` action bodies in the same boundary the rest of the file uses: `catch (error: any) { console.error(chalk.red(error.message)); process.exit(1); }` — or put it once inside getRegistry.

## 10. [LOW] node-info --json and node-schema --json no longer emit their next-step hints
**Fichier** : `packages/skills/src/commands/skills-commander.ts:386`
**Vérification** : True (0 réfuteur(s) sur 2)

- **mechanism** : At origin/main the hint block sat inside `if (schema)` but outside the `if (options.json) ... else ...`, so it ran in both modes. `emitNodes` returns immediately after printing JSON (line 386), and the `hint?.()` call is gated on `!options.compact && names.length === 1` below it, so the JSON path never reaches it.

- **baseline** : origin/main printed `💡 Next steps: - 'node-schema gmail' ... - 'guides gmail' ... - 'related gmail' ...` on stderr for `node-info gmail --json`, and `💡 Hint: Use 'node-info <name>' ...` for `node-schema <name> --json`. The package README still advertises node-info as "Includes hints for next steps!".

- **repro** : cd G:/repos/n8n-as-code/.claude/worktrees/add-funding-yml-9b2f33 && node packages/skills/dist/cli.js node-info gmail --json 2>&1 >/dev/null; node packages/skills/dist/cli.js node-info gmail 2>&1 >/dev/null

- **observed** : First command prints nothing on stderr; second prints the three next-step lines. stdout is unaffected in both cases.

- **fix** : Move the `if (!options.compact && names.length === 1) hint?.(found[0].name);` call above the `if (options.json)` early return (it writes to stderr, so it cannot corrupt JSON on stdout).

## 11. [LOW] normalizeNodeName's greedy package-prefix strip reduces any dotted display name to its TLD, so Monday.com / Customer.io / Sentry.io / urlscan.io / APITemplate.io no longer resolve
**Fichier** : `packages/skills/src/services/node-schema-provider.ts:518`
**Vérification** : True (0 réfuteur(s) sur 3)

- **mechanism** : `normalizeNodeName` strips everything up to the last dot with a greedy regex intended for package prefixes: `return name.replace(/^.*\./, '').replace(/[^a-z0-9]/gi, '').toLowerCase();`. It cannot tell a package prefix from a brand name, so `Monday.com` becomes `com`, and `Customer.io` / `Sentry.io` / `urlscan.io` / `APITemplate.io` all become `io`. The result is 2-3 characters, below both gates in `isSameNodeName` (`short.length >= 4` for containment, `short.length >= 5` for edit distance), so no candidate can ever match and `resolveNode` returns undefined.

- **baseline** : origin/main's node-schema never normalized the query; it took the top `searchNodes` hit, which scored the exact displayName match at +800 and returned `mondayCom`, `customerIo`, `sentryIo`, `urlScanIo`, `apiTemplateIo`.

- **repro** : node /tmp/cli.mjs node-schema "Monday.com"; echo EXIT=$? And the normalizer in isolation: node -e "const n=s=>s.replace(/^.*\./,'').replace(/[^a-z0-9]/gi,'').toLowerCase(); for(const s of ['Monday.com','Customer.io','Sentry.io','urlscan.io','APITemplate.io']) console.log(s,'->',n(s));"

- **observed** : `Node 'Monday.com' not found. Did you mean: mondayCom, mondayComTool, nasaTool, nasa, bambooHrTool?` with EXIT=1. The normalizer prints `Monday.com -> com`, `Customer.io -> io`, `Sentry.io -> io`, `urlscan.io -> io`, `APITemplate.io -> io`.

- **fix** : Strip only an actual package prefix instead of everything before the last dot: `name.replace(/^(?:@[\w-]+\/)?[\w-]*n8n-nodes[\w-]*\./, '')`. That still turns `n8n-nodes-base.googleSheets` and `@n8n/n8n-nodes-langchain.lmChatOpenAi` into their short names (verified) while leaving `Monday.com` intact so it normalizes to `mondaycom` and matches the `mondayCom` key exactly.

## 12. [LOW] The maxShape cap truncates a required param's type mid-token and, unlike every other cap, gives no pointer to the full shape
**Fichier** : `packages/skills/src/services/typescript-formatter.ts:292`
**Vérification** : True (1 réfuteur(s) sur 1)

- **mechanism** : Line 292 wraps the structured-type shape in `this.truncate(..., maxShape)` (maxShape = 240, line 256). truncate (lines 337-340) is a blind `slice(0, n-1) + '…'` written for prose, so applied to a TypeScript type it cuts inside a string literal and leaves `{`, `Array<{` and the quote unclosed. Every other cap in this function appends a pointer - `... (+N more required — see node-schema --json)` (line 300), `... (+N more — see node-info --json)` (line 322), `... (+N more flags — see node-info --json)` (line 348) - but the shape cap appends only `…`, so the line reads as a complete-but-elided type rather than "go look it up". The function's own comment at lines 288-290 claims it does "point at the projection that carries the rest"; it does not. Affects 3 nodes on the bundled ontology (awsCognito.userAttributes, zammad.article, zammadTool.article).

- **baseline** : origin/main had no compact projection. `node-info awsCognito` emitted the complete doc, whose interface carries the entire `userAttributes` type uncut, so the shape was always fully available.

- **repro** : npx tsc -b packages/skills && node --input-type=module -e "const W='file:///G:/repos/n8n-as-code/.claude/worktrees/add-funding-yml-9b2f33/packages/skills/dist';const {TypeScriptFormatter:F}=await import(W+'/services/typescript-formatter.js');const {NodeSchemaProvider}=await import(W+'/services/node-schema-provider.js');const s=new NodeSchemaProvider().getNodeSchema('awsCognito');const d=F.generateCompactNodeDoc({name:s.name,type:s.type,displayName:s.displayName,description:s.description,version:s.version,properties:s.schema.properties});console.log(JSON.stringify(d.split('\n').find(l=>l.includes('\u2026'))))"

- **observed** : The line ends `...| 'nickname' | 'phone_number' | 'preferred_usernam…` - cut inside the string literal `'preferred_username'`, with `{`, `Array<{` and the quote all left open, and nothing telling the reader where the rest is.

- **fix** : Make the cap self-describing the way the other three are - one line at the truncate site: const shape = this.mapTypeToTypeScript(p); const text = shape.length > maxShape ? `${p.type} (shape > ${maxShape} chars — see node-info --json)` : shape; A name plus a pointer is both shorter and usable; a mid-literal cut is neither.

## Réfutés (pour mémoire, ne pas re-signaler)
- node-info --compact prints `any` for every required resourceMapper param, erasing the type name the schema carries
- compact's snippet drops `operation` whenever the operation enum is not gated on `resource`, contradicting the `// operation:` line it printed two lines earlier
- validate_n8n_workflow loads the custom-node sidecar from the server process's cwd, not from --cwd / N8N_AS_CODE_PROJECT_DIR
- A failed first workflow-example index load is memoized forever, permanently disabling two tools for the life of the server
- get_n8n_node_info's published input schema no longer marks any argument as required
- The .env-derived environment resolves but is unaddressable: every write command dead-ends on "Unknown workspace environment: env-file"
- verifyAccess() treats any non-401/403 HTTP status as success, so `env status` reports "Access: ready" for a host whose public API is unreachable
- A blanket 30s axios timeout turns every slow-but-working n8n API call into a hard failure
- The derived environment discards N8NAC_ENV_*/N8NAC_TARGET_* API keys that resolveEnvironmentFromTarget already found
- A .env silently retargets a workspace whose v4 config exists but has zero environments
- Folded concatenation silently corrupts exponential-notation numeric literals that origin/main rejected loudly
- SKILL.md tells agents a `.env` holding `N8N_HOST` is enough, but the code silently rejects any value that is not an absolute http(s) URL — which is the form n8n itself documents
- SKILL.md and README claim `--compact` returns required params for `node-schema` and `search`; both return zero parameters, and `node-schema --compact` returns strictly less than plain `node-schema` did at origin/main
- resolveSkillsAssetsDir prefers a global __filename over import.meta.url, so it returns a bogus relative assets path in any host that defines one (e.g. node -e)