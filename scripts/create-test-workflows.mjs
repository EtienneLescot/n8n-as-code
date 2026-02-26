#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

const ENV_PATH = path.resolve(process.cwd(), '.env.test');
const OUT_FILE = path.resolve(process.cwd(), 'scripts', 'created_test_workflows.json');

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function main() {
  // Load environment variables from .env.test
  dotenv.config({ path: ENV_PATH });

  const host = process.env.N8N_HOST;
  const apiKey = process.env.N8N_API_KEY;
  if (!host || !apiKey) {
    console.error('Missing N8N_HOST or N8N_API_KEY in .env.test');
    process.exit(1);
  }

  const normalizedHost = host.replace(/['"]+/g, '').replace(/\/+$/,'');
  const total = Number(process.env.TOTAL || 300);
  const concurrency = Number(process.env.CONCURRENCY || 10);
  const prefix = process.env.PREFIX || `iac-test-${Date.now()}`;

  console.log(`Creating ${total} workflows on ${normalizedHost} (concurrency=${concurrency})`);

  // Allow explicit override via env vars to avoid probing (useful for cloud instances)
  const overrideHeader = process.env.AUTH_HEADER;
  const overrideValue = process.env.AUTH_VALUE;

  // Detect API prefix and preferred auth header by probing candidate prefixes.
  // We prioritize /api/v1 which is the public API path for cloud/recent n8n.
  const candidates = ['/api/v1', '', '/rest', '/api', '/v1'];
  const authCandidates = [
    { header: 'X-N8N-API-KEY', value: apiKey },
    { header: 'Authorization', value: `Bearer ${apiKey}` },
  ];

  let apiBase = null;
  let authHeader = null;

  async function probe() {
    const probeBody = { name: 'probe-test', nodes: [], connections: {}, active: false };
    
    if (overrideHeader && overrideValue) {
      console.log(`Using explicit auth override: ${overrideHeader}`);
      authHeader = { header: overrideHeader, value: overrideValue };
      for (const base of candidates) {
        try {
          const url = `${normalizedHost}${base}/workflows`;
          const res = await fetch(url, { method: 'GET', headers: { [authHeader.header]: authHeader.value } }).catch(() => null);
          if (res && res.status !== 404) {
            apiBase = base;
            return;
          }
        } catch (e) {}
      }
      return;
    }

    console.log('Probing for API base and auth header...');
    let possibleBase = null;
    let possibleAuth = null;

    for (const base of candidates) {
      for (const a of authCandidates) {
        const url = `${normalizedHost}${base}/workflows`;
        try {
          const res = await fetch(url, {
            method: 'GET', // Using GET /workflows to probe instead of POST to be safer
            headers: {
              'Accept': 'application/json',
              [a.header]: a.value,
            },
          }).catch(() => null);

          if (!res) continue;
          
          if (res.ok) {
            console.log(`  [OK] Found working API: ${url} with ${a.header}`);
            apiBase = base;
            authHeader = a;
            return;
          }

          if (res.status === 401 || res.status === 403) {
            console.log(`  [Auth Fail] ${url} returned ${res.status} with ${a.header}`);
            if (!possibleBase) {
              possibleBase = base;
              possibleAuth = a;
            }
          } else if (res.status !== 404) {
            console.log(`  [Other] ${url} returned ${res.status} with ${a.header}`);
          }
        } catch (err) {
          continue;
        }
      }
    }

    apiBase = apiBase || possibleBase;
    authHeader = authHeader || possibleAuth;
  }

  await probe();
  if (!apiBase) {
    console.error('Could not detect API path for workflows. Tried prefixes:', candidates.join(', '));
    console.error('Server may expose workflows under a different path or block programmatic access.');
    process.exit(1);
  }

  console.log('Using API base:', apiBase || '/', 'with auth header:', authHeader.header);

  const created = [];

  async function createOne(i) {
    const name = `${prefix}-${i}`;
    const body = {
      name,
      nodes: [],
      connections: {},
      settings: {},
    };

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    headers[authHeader.header] = authHeader.value;

    let res = await fetch(`${normalizedHost}${apiBase}/workflows`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }).catch(() => null);

    // If unauthorized or no response, try alternate auth headers (fallback)
    if (!res || res.status === 401) {
      const alt = authCandidates.find((a) => (!authHeader) || a.header !== authHeader.header);
      if (alt) {
        const altHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        altHeaders[alt.header] = alt.value;
        const altRes = await fetch(`${normalizedHost}${apiBase}/workflows`, {
          method: 'POST',
          headers: altHeaders,
          body: JSON.stringify(body),
        }).catch(() => null);
        if (altRes && altRes.ok) {
          authHeader = alt; // use the working header for subsequent requests
          res = altRes;
        } else if (altRes && altRes.status === 401) {
          // try query param fallback
          const qpRes = await fetch(`${normalizedHost}${apiBase}/workflows?apiKey=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(body),
          }).catch(() => null);
          if (qpRes && qpRes.ok) {
            res = qpRes;
          }
        }
      } else {
        // no alternative headers to try; attempt query param directly
        const qpRes = await fetch(`${normalizedHost}${apiBase}/workflows?apiKey=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(body),
        }).catch(() => null);
        if (qpRes && qpRes.ok) res = qpRes;
      }
    }

    if (!res) {
      throw new Error('No response from server (network error)');
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '<no body>');
      throw new Error(`Create failed ${res.status}: ${txt}`);
    }
    const json = await res.json().catch(() => null);
    const id = json.id ?? json.data?.id ?? json.workflow?.id ?? json.workflowId ?? null;
    created.push({ id, name, raw: json });
    process.stdout.write('.');
  }

  const tasks = Array.from({ length: total }, (_, i) => i + 1);
  let idx = 0;
  while (idx < tasks.length) {
    const batch = tasks.slice(idx, idx + concurrency);
    await Promise.all(batch.map((i) =>
      createOne(i).catch(async (err) => {
        console.error('\nError creating', i, err.message);
        await sleep(500);
      })
    ));
    idx += concurrency;
  }

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(created, null, 2), 'utf8');
  console.log('\nDone. Created', created.length, 'workflows. IDs written to', OUT_FILE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
