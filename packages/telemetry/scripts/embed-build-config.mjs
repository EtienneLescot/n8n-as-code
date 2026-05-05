import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const distIndexPath = resolve(here, '..', 'dist', 'index.js');

function readBuildEnvironment() {
  const explicit = process.env.N8NAC_TELEMETRY_ENV || process.env.N8NAC_ENV;
  if (explicit?.trim()) return explicit.trim();

  const refName = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF?.replace(/^refs\/heads\//, '').replace(/^refs\/tags\//, '');
  if (refName === 'main') return 'prod';
  if (refName === 'next') return 'next';

  return '';
}

function replaceConst(source, name, value) {
  const pattern = new RegExp(`const ${name} = ['\"][^'\"]*['\"];`);
  const replacement = `const ${name} = ${JSON.stringify(value)};`;
  if (!pattern.test(source)) {
    throw new Error(`Unable to find build config constant ${name} in ${distIndexPath}`);
  }
  return source.replace(pattern, replacement);
}

const values = {
  BUILD_POSTHOG_KEY: (process.env.N8NAC_POSTHOG_KEY || process.env.POSTHOG_KEY || '').trim(),
  BUILD_POSTHOG_HOST: (process.env.N8NAC_POSTHOG_HOST || process.env.POSTHOG_HOST || '').trim(),
  BUILD_TELEMETRY_ENVIRONMENT: readBuildEnvironment(),
};

let source = readFileSync(distIndexPath, 'utf8');
for (const [name, value] of Object.entries(values)) {
  source = replaceConst(source, name, value);
}
writeFileSync(distIndexPath, source, 'utf8');

const configured = Boolean(values.BUILD_POSTHOG_KEY);
const host = values.BUILD_POSTHOG_HOST || '(runtime default)';
const environment = values.BUILD_TELEMETRY_ENVIRONMENT || '(runtime default)';
console.log(`[telemetry] build config embedded: configured=${configured} host=${host} environment=${environment}`);
