#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const severityRank = { low: 1, medium: 2, high: 3 };
const defaultMaxTextBytes = 25 * 1024 * 1024;
const defaultMaxFindings = 250;

const riskyExtensions = new Map([
  ['.exe', 'Windows executable'],
  ['.dll', 'Windows dynamic library'],
  ['.dylib', 'macOS dynamic library'],
  ['.so', 'Linux shared library'],
  ['.node', 'Native Node.js addon'],
  ['.wasm', 'WebAssembly module'],
  ['.msi', 'Windows installer'],
  ['.scr', 'Windows screensaver executable'],
  ['.ps1', 'PowerShell script'],
  ['.bat', 'Windows batch script'],
  ['.cmd', 'Windows command script'],
  ['.vbs', 'VBScript file'],
  ['.jar', 'Java archive'],
]);

const archiveExtensions = new Set(['.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.vsix']);
const textExtensions = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.map', '.md', '.mjs', '.txt', '.xml', '.yaml', '.yml',
]);

const contentRules = [
  {
    severity: 'high',
    label: 'forced git worktree deletion',
    pattern: /(?:git\s+worktree\s+remove\s+--force|["']worktree["']\s*,\s*["']remove["']\s*,\s*["']--force["'])/i,
  },
  {
    severity: 'high',
    label: 'hard git reset',
    pattern: /(?:git\s+reset\s+--hard|["']reset["']\s*,\s*["']--hard["'])/i,
  },
  {
    severity: 'high',
    label: 'download and execute shell pipeline',
    pattern: /(?:curl|wget)[^\n|]{0,200}\|\s*(?:bash|sh|zsh|powershell)/i,
  },
  {
    severity: 'medium',
    label: 'child process execution API',
    pattern: /(?:node:)?child_process|\bexecFile\b|\bspawn\b|\bexecSync\b|\bspawnSync\b/,
  },
  {
    severity: 'medium',
    label: 'shell interpreter reference',
    pattern: /\b(?:powershell(?:\.exe)?|cmd\.exe|\/bin\/sh|\/bin\/bash)\b/i,
  },
  {
    severity: 'medium',
    label: 'dynamic code evaluation',
    pattern: /\b(?:eval\s*\(|new\s+Function\s*\()/,
  },
  {
    severity: 'medium',
    label: 'base64 decode command',
    pattern: /base64\s+(?:-d|--decode)/i,
  },
  {
    severity: 'medium',
    label: 'recursive forced filesystem removal',
    pattern: /\brm\s+-rf\b|fs\.rmSync\([^\n)]*force\s*:\s*true|\.rm\([^\n)]*force\s*:\s*true/,
  },
];

function parseArgs(argv) {
  const args = {
    failOn: 'none',
    maxTextBytes: defaultMaxTextBytes,
    maxFindings: defaultMaxFindings,
    reportPath: undefined,
    vsixPath: undefined,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--fail-on') {
      args.failOn = requireValue(argv, ++index, arg);
    } else if (arg === '--max-text-bytes') {
      args.maxTextBytes = Number(requireValue(argv, ++index, arg));
    } else if (arg === '--max-findings') {
      args.maxFindings = Number(requireValue(argv, ++index, arg));
    } else if (arg === '--report') {
      args.reportPath = requireValue(argv, ++index, arg);
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (!args.vsixPath) {
      args.vsixPath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!args.vsixPath) {
    printUsage();
    throw new Error('Missing VSIX path.');
  }
  if (args.failOn !== 'none' && !Object.hasOwn(severityRank, args.failOn)) {
    throw new Error('--fail-on must be one of: none, low, medium, high');
  }
  if (!Number.isFinite(args.maxTextBytes) || args.maxTextBytes < 0) {
    throw new Error('--max-text-bytes must be a non-negative number.');
  }
  if (!Number.isInteger(args.maxFindings) || args.maxFindings < 1) {
    throw new Error('--max-findings must be a positive integer.');
  }

  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function printUsage() {
  console.log(`Usage: node scripts/vsix-security-preflight.mjs <extension.vsix> [options]

Options:
  --report <path>          Write a Markdown report.
  --fail-on <level>        Exit non-zero on findings at or above low, medium, or high. Default: none.
  --max-text-bytes <n>     Maximum text file size to inspect. Default: ${defaultMaxTextBytes}.
  --max-findings <n>       Maximum findings printed in detail. Default: ${defaultMaxFindings}.
`);
}

function listEntries(vsixPath) {
  const output = execFileSync('unzip', ['-l', vsixPath], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  const entries = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+\d{2,4}-\d{2}-\d{2,4}\s+\d{2}:\d{2}\s+(.+)$/);
    if (!match) continue;
    const size = Number(match[1]);
    const name = match[2];
    if (!name || name.endsWith('/')) continue;
    entries.push({ name, size });
  }
  return entries;
}

function readEntry(vsixPath, entry) {
  return execFileSync('unzip', ['-p', vsixPath, entry.name], {
    encoding: 'utf8',
    maxBuffer: entry.size + 1024 * 1024,
  });
}

function addFinding(findings, severity, file, reason, detail = '') {
  findings.push({ severity, file, reason, detail });
}

function inspectEntryPaths(entries, findings) {
  for (const entry of entries) {
    const ext = path.extname(entry.name).toLowerCase();
    const normalized = entry.name.replace(/\\/g, '/');

    if (riskyExtensions.has(ext)) {
      addFinding(findings, 'high', entry.name, riskyExtensions.get(ext), `${formatBytes(entry.size)}`);
    } else if (archiveExtensions.has(ext)) {
      addFinding(findings, 'medium', entry.name, 'nested archive', `${formatBytes(entry.size)}`);
    }

    if (/\/(?:prebuilds?|vendor|bin)\//i.test(normalized)) {
      addFinding(findings, 'medium', entry.name, 'runtime package vendor/bin/prebuild path', `${formatBytes(entry.size)}`);
    }

    if (entry.size > 10 * 1024 * 1024) {
      addFinding(findings, 'low', entry.name, 'large packaged file', `${formatBytes(entry.size)}`);
    }
  }
}

function inspectTextEntries(vsixPath, entries, findings, maxTextBytes) {
  for (const entry of entries) {
    const ext = path.extname(entry.name).toLowerCase();
    if (!textExtensions.has(ext) || entry.size > maxTextBytes) continue;
    // Info-ZIP treats names as glob patterns; skip metadata names containing
    // pattern characters instead of risking noisy warnings for non-runtime files.
    if (/[\[\]*?]/.test(entry.name)) continue;

    let text;
    try {
      text = readEntry(vsixPath, entry);
    } catch (error) {
      addFinding(findings, 'low', entry.name, 'could not read text entry', error instanceof Error ? error.message : String(error));
      continue;
    }

    for (const rule of contentRules) {
      if (rule.pattern.test(text)) {
        addFinding(findings, effectiveContentSeverity(rule.severity, entry.name), entry.name, rule.label, excerpt(text, rule.pattern));
      }
    }

    if (ext === '.js') {
      inspectJavaScriptShape(entry, text, findings);
    }
  }
}

function inspectJavaScriptShape(entry, text, findings) {
  if (entry.size < 100 * 1024) return;
  const lines = text.split('\n');
  const maxLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
  if (lines.length <= 5 || maxLineLength > 20000) {
    addFinding(
      findings,
      lines.length <= 5 ? 'medium' : 'low',
      entry.name,
      'possibly minified or obfuscated JavaScript',
      `${formatBytes(entry.size)}, ${lines.length} lines, max line ${maxLineLength} chars`,
    );
  }
}

function effectiveContentSeverity(severity, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (severity === 'high' && (ext === '.json' || ext === '.md' || ext === '.txt' || ext === '.map')) {
    return 'medium';
  }
  return severity;
}

function excerpt(text, pattern) {
  const match = text.match(pattern);
  if (!match || match.index === undefined) return '';
  const start = Math.max(0, match.index - 80);
  const end = Math.min(text.length, match.index + match[0].length + 80);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function summarize(entries, findings, maxFindings) {
  const sorted = findings.sort((a, b) => {
    const severityDelta = severityRank[b.severity] - severityRank[a.severity];
    return severityDelta || a.file.localeCompare(b.file) || a.reason.localeCompare(b.reason);
  });
  const counts = sorted.reduce((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] || 0) + 1;
    return acc;
  }, {});
  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  const lines = [
    '# VSIX Security Preflight',
    '',
    `Files inspected: ${entries.length}`,
    `Uncompressed size: ${formatBytes(totalBytes)}`,
    `Findings: high=${counts.high || 0}, medium=${counts.medium || 0}, low=${counts.low || 0}`,
    '',
  ];

  if (!sorted.length) {
    lines.push('No findings.');
    return lines.join('\n');
  }

  lines.push('| Severity | File | Reason | Detail |');
  lines.push('| --- | --- | --- | --- |');
  for (const finding of sorted.slice(0, maxFindings)) {
    lines.push(`| ${finding.severity} | \`${escapeMarkdown(finding.file)}\` | ${escapeMarkdown(finding.reason)} | ${escapeMarkdown(finding.detail)} |`);
  }
  if (sorted.length > maxFindings) {
    lines.push('');
    lines.push(`Truncated ${sorted.length - maxFindings} additional findings.`);
  }
  return lines.join('\n');
}

function escapeMarkdown(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function shouldFail(findings, failOn) {
  if (failOn === 'none') return false;
  const threshold = severityRank[failOn];
  return findings.some((finding) => severityRank[finding.severity] >= threshold);
}

function main() {
  const args = parseArgs(process.argv);
  const vsixPath = path.resolve(args.vsixPath);
  if (!fs.existsSync(vsixPath)) {
    throw new Error(`VSIX not found: ${vsixPath}`);
  }

  const entries = listEntries(vsixPath);
  const findings = [];
  inspectEntryPaths(entries, findings);
  inspectTextEntries(vsixPath, entries, findings, args.maxTextBytes);
  const report = summarize(entries, findings, args.maxFindings);

  console.log(report);
  if (args.reportPath) {
    fs.writeFileSync(path.resolve(args.reportPath), `${report}\n`);
  }
  if (shouldFail(findings, args.failOn)) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
