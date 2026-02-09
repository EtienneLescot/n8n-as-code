#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');

const DEFAULT_PREFIX = 'Auto Workflow ';

function loadEnv(envPath) {
  const full = path.resolve(envPath);
  if (!fs.existsSync(full)) throw new Error(`Env file not found: ${full}`);
  const raw = fs.readFileSync(full, 'utf8');
  const obj = {};
  for (const line of raw.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, '');
    obj[key] = val;
  }
  return obj;
}

function createClient(cfg) {
  const host = cfg.N8N_HOST || cfg.N8N_URL || cfg.N8N_API_HOST || cfg.N8N_HOST_URL;
  const apiKey = cfg.N8N_API_KEY || cfg.N8N_KEY || cfg.N8N_TOKEN;

  if (!host || !apiKey) {
    throw new Error('Missing N8N_HOST or N8N_API_KEY in env file');
  }

  const client = axios.create({
    baseURL: host.replace(/\/$/, ''),
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    httpsAgent: new https.Agent({ rejectUnauthorized: false })
  });

  return { client, host };
}

async function fetchAllWorkflows(client) {
  const collected = [];
  let cursor;

  do {
    const res = await client.get('/api/v1/workflows', cursor ? { params: { cursor } } : undefined);
    const data = Array.isArray(res.data) ? res.data : (res.data.data || res.data.workflows || res.data);
    if (Array.isArray(data)) {
      collected.push(...data);
    }
    cursor = res.data?.nextCursor;
  } while (cursor);

  return collected;
}

async function createWorkflows(options) {
  const {
    envPath = '.env',
    count = 150,
    prefix = DEFAULT_PREFIX,
    delayMs = 120
  } = options || {};

  const cfg = loadEnv(envPath);
  const { client, host } = createClient(cfg);

  const created = [];
  for (let i = 1; i <= count; i++) {
    const name = `${prefix}${String(i).padStart(3, '0')}`;
    const payload = {
      name,
      nodes: [
        {
          id: `${i}`,
          name: 'Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          position: [250, 300],
          parameters: {}
        }
      ],
      connections: {},
      settings: {}
    };

    try {
      const res = await client.post('/api/v1/workflows', payload);
      created.push({ id: res.data.id || res.data, name, host });
    } catch (err) {
      throw new Error(`Failed to create ${name}: ${err.response?.status} ${JSON.stringify(err.response?.data || err.message)}`);
    }

    await new Promise(r => setTimeout(r, delayMs));
  }

  return created;
}

async function deleteWorkflowsByPrefix(options) {
  const {
    envPath = '.env',
    prefix = DEFAULT_PREFIX,
    confirm = false,
    delayMs = 120
  } = options || {};

  const cfg = loadEnv(envPath);
  const { client } = createClient(cfg);

  if (!confirm) {
    const workflows = await fetchAllWorkflows(client);
    return workflows.filter(w => typeof w.name === 'string' && w.name.startsWith(prefix));
  }

  let deleted = 0;
  while (true) {
    const workflows = await fetchAllWorkflows(client);
    const matches = workflows.filter(w => typeof w.name === 'string' && w.name.startsWith(prefix));
    if (matches.length === 0) break;

    for (const w of matches) {
      await client.delete(`/api/v1/workflows/${encodeURIComponent(w.id)}`);
      deleted += 1;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return deleted;
}

module.exports = {
  DEFAULT_PREFIX,
  loadEnv,
  createClient,
  fetchAllWorkflows,
  createWorkflows,
  deleteWorkflowsByPrefix
};
