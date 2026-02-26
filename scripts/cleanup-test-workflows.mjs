#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

const ENV_PATH = path.resolve(process.cwd(), '.env.test');
const IN_FILE = path.resolve(process.cwd(), 'scripts', 'created_test_workflows.json');

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
  let items = [];
  try {
    const rawList = await fs.readFile(IN_FILE, 'utf8');
    items = JSON.parse(rawList);
  } catch (e) {
    console.error('Could not read created workflows file:', IN_FILE);
    process.exit(1);
  }

  const ids = items.map((i) => i.id).filter(Boolean);
  console.log(`Deleting ${ids.length} workflows from ${normalizedHost}`);

  // detect api base and auth header similarly to create script
  const candidates = ['/api/v1', '', '/rest', '/api', '/v1'];
  const authCandidates = [
    { header: 'X-N8N-API-KEY', value: apiKey },
    { header: 'Authorization', value: `Bearer ${apiKey}` },
  ];

  const overrideHeader = process.env.AUTH_HEADER;
  const overrideValue = process.env.AUTH_VALUE;

  let apiBase = null;
  let authHeader = null;

  async function probe() {
    if (overrideHeader && overrideValue) {
      authHeader = { header: overrideHeader, value: overrideValue };
      for (const base of candidates) {
        try {
          const url = `${normalizedHost}${base}/workflows`;
          const res = await fetch(url, { method: 'GET', headers: { [authHeader.header]: authHeader.value } }).catch(() => null);
          if (res && res.status !== 404) {
            apiBase = base;
            return;
          }
        } catch (e) { continue; }
      }
      return;
    }

    for (const base of candidates) {
      for (const a of authCandidates) {
        try {
          const url = `${normalizedHost}${base}/workflows`;
          const res = await fetch(url, { method: 'GET', headers: { [a.header]: a.value } }).catch(() => null);
          if (!res) continue;
          if (res.status === 404) continue;
          
          if (res.ok) {
            apiBase = base;
            authHeader = a;
            return;
          }
          
          if (res.status === 401 || res.status === 403) {
            if (!apiBase) {
              apiBase = base;
              authHeader = a;
            }
          }
        } catch (e) {
          continue;
        }
      }
    }
  }

  await probe();
  if (!apiBase) {
    console.error('Could not detect API path for workflows. Tried prefixes:', candidates.join(', '));
    process.exit(1);
  }
  console.log('Using API base:', apiBase || '/', 'with auth header:', (authHeader || {}).header || overrideHeader || '<unknown>');

  let deleted = 0;
  for (const id of ids) {
    try {
      const headers = { 'Accept': 'application/json' };
      if (authHeader) headers[authHeader.header] = authHeader.value;
      let res = await fetch(`${normalizedHost}${apiBase}/workflows/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      }).catch(() => null);

      // If unauthorized or no response, try alternate header then query param
      if (!res || res.status === 401) {
        const alt = authCandidates.find((a) => (!authHeader) || a.header !== authHeader.header);
        if (alt) {
          const altHeaders = { 'Accept': 'application/json' };
          altHeaders[alt.header] = alt.value;
          const altRes = await fetch(`${normalizedHost}${apiBase}/workflows/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: altHeaders,
          }).catch(() => null);
          if (altRes && altRes.ok) {
            authHeader = alt;
            res = altRes;
          } else if (altRes && altRes.status === 401) {
            const qpRes = await fetch(`${normalizedHost}${apiBase}/workflows/${encodeURIComponent(id)}?apiKey=${encodeURIComponent(apiKey)}`, { method: 'DELETE' }).catch(() => null);
            if (qpRes && qpRes.ok) res = qpRes;
          }
        } else {
          const qpRes = await fetch(`${normalizedHost}${apiBase}/workflows/${encodeURIComponent(id)}?apiKey=${encodeURIComponent(apiKey)}`, { method: 'DELETE' }).catch(() => null);
          if (qpRes && qpRes.ok) res = qpRes;
        }
      }

      if (!res) {
        console.error('Delete failed', id, 'no response');
        continue;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '<no body>');
        console.error('Delete failed', id, res.status, txt);
      } else {
        deleted++;
        process.stdout.write('.');
      }
    } catch (err) {
      console.error('Error deleting', id, err.message);
    }
  }

  console.log('\nDone. Deleted', deleted, 'workflows.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
