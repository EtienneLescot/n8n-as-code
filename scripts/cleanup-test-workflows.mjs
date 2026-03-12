#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

const IN_FILE = path.resolve(process.cwd(), 'scripts', 'created_test_workflows.json');

async function resolveEnvPath() {
  const explicitPath = process.env.ENV_FILE;
  if (explicitPath) {
    return path.resolve(process.cwd(), explicitPath);
  }

  const defaultPath = path.resolve(process.cwd(), '.env');
  const fallbackPath = path.resolve(process.cwd(), '.env.test');

  try {
    await fs.access(defaultPath);
    return defaultPath;
  } catch {
    return fallbackPath;
  }
}

async function main() {
  const envPath = await resolveEnvPath();
  dotenv.config({ path: envPath });

  const host = process.env.N8N_HOST;
  const apiKey = process.env.N8N_API_KEY;
  if (!host || !apiKey) {
    console.error(`Missing N8N_HOST or N8N_API_KEY in ${path.basename(envPath)}`);
    process.exit(1);
  }

  const normalizedHost = host.replace(/['"]+/g, '').replace(/\/+$/,'');
  let items = [];
  const scanPrefix = process.env.SCAN_PREFIX || 'iac-test-';
  const doScan = process.env.SCAN === 'true';

  if (!doScan) {
    try {
      const rawList = await fs.readFile(IN_FILE, 'utf8');
      items = JSON.parse(rawList);
    } catch (e) {
      console.warn('Could not read created workflows file, falling back to scanning if SCAN=true is set.');
      if (!process.env.SCAN) {
          console.error('To scan and delete by prefix instead, run with SCAN=true SCAN_PREFIX=iac-test-');
          process.exit(1);
      }
    }
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

  if (doScan) {
    console.log(`Scanning for workflows with prefix: ${scanPrefix}...`);
    try {
      const headers = { 'Accept': 'application/json' };
      if (authHeader) headers[authHeader.header] = authHeader.value;
      
      const collected = [];
      let cursor = null;
      let url = `${normalizedHost}${apiBase}/workflows?limit=250`;
      
      do {
        const fullUrl = cursor ? `${url}&cursor=${encodeURIComponent(cursor)}` : url;
        const res = await fetch(fullUrl, { headers });
        if (!res.ok) {
          console.error('Failed to fetch workflows for scanning:', res.status);
          process.exit(1);
        }
        const data = await res.json();
        const workflows = Array.isArray(data) ? data : (data.data || []);
        collected.push(...workflows);
        cursor = data.nextCursor;
      } while (cursor);

      const matched = collected.filter(w => w.name && w.name.startsWith(scanPrefix));
      console.log(`Found ${matched.length} workflows matching prefix (out of ${collected.length} total).`);
      items = matched;
    } catch (e) {
      console.error('Error scanning workflows:', e.message);
      process.exit(1);
    }
  }

  const concurrency = Number(process.env.CONCURRENCY || 10);
  const remainingItems = [...items];
  const results = { deleted: 0, alreadyGone: 0, failed: 0 };
  const toDelete = [...items];

  async function deleteOne(item) {
    const id = item.id;
    try {
      const headers = { 'Accept': 'application/json' };
      if (authHeader) headers[authHeader.header] = authHeader.value;
      
      let res = await fetch(`${normalizedHost}${apiBase}/workflows/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      }).catch(() => null);

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

      if (res && (res.ok || res.status === 404)) {
        if (res.status === 404) {
          results.alreadyGone++;
        } else {
          results.deleted++;
        }
        process.stdout.write('.');
        return true; 
      } else {
        const txt = res ? await res.text().catch(() => '<no body>') : 'no response';
        if (res && res.status !== 404) {
            console.error(`\nDelete failed for ${id}: ${res.status} ${txt}`);
        }
        results.failed++;
        return false;
      }
    } catch (err) {
      console.error(`\nError deleting ${id}:`, err.message);
      results.failed++;
      return false;
    }
  }

  const successfullyRemoved = new Set();
  
  // Simple concurrency pool
  for (let i = 0; i < toDelete.length; i += concurrency) {
    const chunk = toDelete.slice(i, i + concurrency);
    await Promise.all(chunk.map(async (item) => {
      const ok = await deleteOne(item);
      if (ok) {
        successfullyRemoved.add(item.id);
      }
    }));
  }

  const updatedItems = items.filter(item => !successfullyRemoved.has(item.id));
  
  if (updatedItems.length === 0) {
    await fs.unlink(IN_FILE).catch(() => {});
    console.log('\nAll workflows cleaned up. Removed tracking file.');
  } else {
    await fs.writeFile(IN_FILE, JSON.stringify(updatedItems, null, 2));
    console.log(`\nUpdated tracking file with ${updatedItems.length} remaining items.`);
  }

  console.log(`Done. Deleted: ${results.deleted}, Already gone: ${results.alreadyGone}, Failed: ${results.failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
