'use strict';

/**
 * Shared view of "what must a packaged dependency be able to resolve at runtime".
 *
 * `peerDependencies` count. Every LangChain v1 package we bundle
 * (`@langchain/anthropic`, `@langchain/openai`, `langchain`, `deepagents`, …) declares
 * `@langchain/core` as a peer rather than a regular dependency, and imports it eagerly.
 * npm installs required peers automatically, so they exist in the workspace and the
 * extension works from source — but a copy closure that walks only `dependencies` leaves
 * them out of `out/node_modules`, and the published VSIX throws ERR_MODULE_NOT_FOUND
 * while loading the runtime.
 *
 * Optional peers (`peerDependenciesMeta[name].optional`) are excluded: npm does not
 * install them, and a package that declares one is expected to work without it.
 */

/** Dependencies that must resolve for the packaged extension to load. */
function collectRequiredDependencyNames(packageJson) {
    const peerDependenciesMeta = packageJson.peerDependenciesMeta || {};
    const requiredPeerNames = Object.keys(packageJson.peerDependencies || {})
        .filter(name => peerDependenciesMeta[name]?.optional !== true);

    return [...new Set([
        ...Object.keys(packageJson.dependencies || {}),
        ...requiredPeerNames,
    ])];
}

/**
 * Dependencies worth copying into `out/node_modules`. Superset of the required ones:
 * `optionalDependencies` are copied when installed, but their absence is not an error.
 */
function collectRuntimeDependencyNames(packageJson) {
    return [...new Set([
        ...collectRequiredDependencyNames(packageJson),
        ...Object.keys(packageJson.optionalDependencies || {}),
    ])];
}

/**
 * Peers supplied by the VS Code host rather than the VSIX. `vscode` is never installable
 * from npm — it is injected by the extension host at activation time.
 */
const HOST_PROVIDED_PACKAGES = new Set(['vscode']);

module.exports = {
    collectRequiredDependencyNames,
    collectRuntimeDependencyNames,
    HOST_PROVIDED_PACKAGES,
};
