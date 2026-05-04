#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const args = parseArgs(process.argv.slice(2));
const managerHome = path.resolve(args.home || process.env.N8N_MANAGER_HOME || path.join(os.homedir(), '.n8n-manager'));
const intervalMs = Number(args.interval || 500);
const logPath = path.resolve(args.log || path.join(managerHome, `tunnel-observer-${new Date().toISOString().replace(/[:.]/g, '-')}.log`));
const runtimeDir = path.join(managerHome, 'runtime');
const instancesPath = path.join(managerHome, 'instances.json');
const logOffsets = new Map();
let previous = undefined;
let stopped = false;

fs.mkdirSync(path.dirname(logPath), { recursive: true });

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

log('observer.start', {
  managerHome,
  runtimeDir,
  instancesPath,
  intervalMs,
  logPath,
  pid: process.pid,
});

while (!stopped) {
  try {
    const snapshot = await collectSnapshot();
    emitDiff(previous, snapshot);
    previous = snapshot;
    tailCloudflaredLogs();
  } catch (error) {
    log('observer.error', { message: error instanceof Error ? error.message : String(error) });
  }
  await sleep(intervalMs);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : 'true';
    result[key] = value;
  }
  return result;
}

function stop(signal) {
  log('observer.stop', { signal, pid: process.pid });
  stopped = true;
}

async function collectSnapshot() {
  const instances = readJson(instancesPath)?.instances || [];
  const runtimeStates = listRuntimeStates();
  const cloudflared = await listCloudflaredProcesses();
  return {
    instances: Object.fromEntries(instances.map((instance) => [instance.id, pickTunnelFields(instance)])),
    runtime: Object.fromEntries(runtimeStates.map((state) => [state.id || path.basename(state.__path), pickTunnelFields(state)])),
    processes: Object.fromEntries(cloudflared.map((proc) => [String(proc.pid), proc])),
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function listRuntimeStates() {
  try {
    return fs.readdirSync(runtimeDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const filePath = path.join(runtimeDir, name);
        const value = readJson(filePath);
        return value ? { ...value, __path: filePath } : undefined;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function pickTunnelFields(source) {
  return {
    id: source.id,
    name: source.name,
    mode: source.mode,
    baseUrl: source.baseUrl,
    desiredState: source.desiredState,
    publicUrlEnabled: source.publicUrlEnabled,
    tunnelPublicUrl: source.tunnelPublicUrl,
    tunnelTargetUrl: source.tunnelTargetUrl,
    tunnelPid: source.tunnelPid,
    tunnelPidAlive: typeof source.tunnelPid === 'number' ? pidAlive(source.tunnelPid) : false,
    tunnelLastAttemptAt: source.tunnelLastAttemptAt,
    tunnelLastError: source.tunnelLastError,
    tunnelNextRetryAt: source.tunnelNextRetryAt,
    updatedAt: source.updatedAt,
    runtimeStatePath: source.runtimeStatePath,
  };
}

async function listCloudflaredProcesses() {
  try {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,ppid=,pgid=,sid=,stat=,etimes=,command='], { encoding: 'utf8' });
    return stdout.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parsePsLine)
      .filter((proc) => proc.command.includes('cloudflared') || proc.command.includes('trycloudflare'));
  } catch (error) {
    log('process.scan.error', { message: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

function parsePsLine(line) {
  const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.+)$/);
  if (!match) {
    return { pid: 0, ppid: 0, pgid: 0, sid: 0, stat: '?', etimes: 0, command: line };
  }
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    pgid: Number(match[3]),
    sid: Number(match[4]),
    stat: match[5],
    etimes: Number(match[6]),
    command: match[7],
  };
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function emitDiff(before, after) {
  if (!before) {
    log('snapshot.initial', after);
    return;
  }
  diffGroup('instance', before.instances, after.instances);
  diffGroup('runtime', before.runtime, after.runtime);
  diffGroup('process', before.processes, after.processes);
}

function diffGroup(kind, before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (!(key in before)) {
      log(`${kind}.added`, { key, value: after[key] });
      continue;
    }
    if (!(key in after)) {
      log(`${kind}.removed`, { key, value: before[key] });
      continue;
    }
    const changes = shallowChanges(before[key], after[key]);
    if (Object.keys(changes).length > 0) {
      log(`${kind}.changed`, { key, changes });
    }
  }
}

function shallowChanges(before, after) {
  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) {
      changes[key] = { from: before?.[key], to: after?.[key] };
    }
  }
  return changes;
}

function tailCloudflaredLogs() {
  const files = findCloudflaredLogFiles();
  for (const filePath of files) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!logOffsets.has(filePath)) {
      logOffsets.set(filePath, stat.size);
      log('cloudflared.log.discovered', { filePath, size: stat.size });
      continue;
    }
    const offset = logOffsets.get(filePath);
    if (stat.size < offset) {
      logOffsets.set(filePath, 0);
    }
    if (stat.size <= offset) continue;
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - offset);
      fs.readSync(fd, buffer, 0, buffer.length, offset);
      logOffsets.set(filePath, stat.size);
      for (const line of buffer.toString('utf8').split('\n').filter(Boolean)) {
        log('cloudflared.log.line', { filePath, line });
      }
    } finally {
      fs.closeSync(fd);
    }
  }
}

function findCloudflaredLogFiles() {
  const directories = [runtimeDir, path.join(managerHome, 'logs')];
  const files = [];
  for (const directory of directories) {
    try {
      for (const name of fs.readdirSync(directory)) {
        if (name.includes('cloudflared') && name.endsWith('.log')) {
          files.push(path.join(directory, name));
        }
      }
    } catch {
      // Directory may not exist yet.
    }
  }
  return files.sort();
}

function log(event, data) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...data });
  fs.appendFileSync(logPath, `${line}\n`);
  console.log(line);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
