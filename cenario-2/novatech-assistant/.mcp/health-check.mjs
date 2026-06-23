#!/usr/bin/env node
// .mcp/health-check.mjs
// Uso: node .mcp/health-check.mjs  (a partir da raiz do repositório)
// Exit: 0=todos HEALTHY | 1=ao menos um DEGRADED | 2=ao menos um OFFLINE

import { spawn, execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');

// ── Cores ────────────────────────────────────────────────────────────────────
const C = {
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  reset:  '\x1b[0m',
};

// ── Status e exit code ────────────────────────────────────────────────────────
let exitCode = 0;

function report(status, server, detail) {
  const icon  = status === 'HEALTHY'  ? `${C.green}✓` : `${C.red}✗`;
  const color = status === 'HEALTHY'  ? C.green
              : status === 'DEGRADED' ? C.yellow
              : C.red;
  const label = status.padEnd(8);
  console.log(`${icon} ${color}${label}${C.reset}  ${C.bold}${server.padEnd(12)}${C.reset}  ${detail}`);
  if (status === 'DEGRADED' && exitCode < 1) exitCode = 1;
  if (status === 'OFFLINE'  && exitCode < 2) exitCode = 2;
}

// ── Cliente MCP via stdio (JSON-RPC 2.0) ─────────────────────────────────────
function mcpSession(command, args, sessionFn, timeoutMs = 15000) {
  return new Promise((done) => {
    let proc;
    try {
      // shell:true necessário no Windows onde npx/uvx são .cmd wrappers
      proc = spawn(command, args, { cwd: REPO, stdio: ['pipe', 'pipe', 'pipe'], shell: true });
    } catch (err) {
      return done({ ok: false, error: err.message });
    }

    let msgId = 1;
    let buffer = '';
    const pending = new Map();

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id != null && pending.has(msg.id)) {
            const { resolve: res } = pending.get(msg.id);
            pending.delete(msg.id);
            res(msg);
          }
        } catch {}
      }
    });

    proc.on('error', (err) => done({ ok: false, error: err.message }));

    const send = (method, params = {}) => {
      const id = msgId++;
      return new Promise((res, rej) => {
        pending.set(id, { resolve: res, reject: rej });
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            rej(new Error(`timeout: ${method}`));
          }
        }, timeoutMs);
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    };

    const notify = (method, params = {}) => {
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
    };

    (async () => {
      try {
        await send('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'health-check', version: '1.0' },
        });
        notify('notifications/initialized');
        const result = await sessionFn({ send, notify });
        done({ ok: true, result });
      } catch (err) {
        done({ ok: false, error: err.message });
      } finally {
        try { proc.kill(); } catch {}
      }
    })();
  });
}

// ── filesystem ────────────────────────────────────────────────────────────────
async function checkFilesystem() {
  const paths = {
    'docs/novatech':        join(REPO, 'docs', 'novatech'),
    'data/retrieval-corpus': join(REPO, 'data', 'retrieval-corpus'),
    'src':                  join(REPO, 'src'),
    'specs':                join(REPO, 'specs'),
    'skills':               join(REPO, 'skills'),
  };

  const missing = Object.entries(paths)
    .filter(([, p]) => !existsSync(p))
    .map(([k]) => k);

  if (missing.includes('docs/novatech')) {
    report('DEGRADED', 'filesystem', `docs/novatech/ ausente — base documental inacessível`);
    return;
  }

  const docCount = readdirSync(paths['docs/novatech']).length;

  const res = await mcpSession(
    'npx',
    ['-y', '@modelcontextprotocol/server-filesystem',
     './src', './specs', './skills', './docs/novatech', './data/retrieval-corpus'],
    async ({ send }) => {
      const resp = await send('tools/list');
      return resp?.result?.tools ?? [];
    }
  );

  if (!res.ok) {
    // Paths ok mas server não respondeu (ex: primeira execução com download npx demorado)
    report('DEGRADED', 'filesystem',
      `paths ok (${docCount} docs em docs/novatech/) · MCP server não respondeu: ${res.error}`);
    return;
  }

  const toolCount = res.result.length;
  const detail = missing.length > 0 ? ` · ausentes: ${missing.join(', ')}` : '';
  report('HEALTHY', 'filesystem',
    `${toolCount} tools · docs/novatech/ ok · ${docCount} arquivos visíveis${detail}`);
}

// ── git ───────────────────────────────────────────────────────────────────────
async function checkGit() {
  // uvx é o runtime do mcp-server-git — verificar antes de tentar iniciar
  try {
    execSync('uvx --version', { stdio: 'pipe' });
  } catch {
    // uvx ausente: MCP server não pode iniciar; fazer diagnóstico direto via CLI
    let gitInfo = '';
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD',
        { cwd: REPO, stdio: 'pipe' }).toString().trim();
      const statusOut = execSync('git status --porcelain',
        { cwd: REPO, stdio: 'pipe' }).toString();
      const conflicted = statusOut.split('\n')
        .filter(l => l.startsWith('UU') || l.startsWith('AA') || l.startsWith('DD')).length;
      gitInfo = `repo acessível via CLI · branch=${branch} · conflitos=${conflicted}`;
    } catch {
      gitInfo = 'repositório git também inacessível via CLI';
    }
    report('OFFLINE', 'git', `uvx não encontrado no PATH — server não iniciou · ${gitInfo}`);
    return;
  }

  const res = await mcpSession(
    'uvx', ['mcp-server-git', '--repository', '.'],
    async ({ send }) => {
      const toolsResp = await send('tools/list');
      const tools = toolsResp?.result?.tools ?? [];
      const statusResp = await send('tools/call',
        { name: 'git_status', arguments: { repo_path: '.' } });
      return { toolCount: tools.length, status: statusResp?.result };
    }
  );

  if (!res.ok) {
    report('OFFLINE', 'git', `server não respondeu: ${res.error}`);
    return;
  }

  report('HEALTHY', 'git', `${res.result.toolCount} tools · repositório acessível`);
}

// ── memory ────────────────────────────────────────────────────────────────────
async function checkMemory() {
  const PROBE = 'health-check-probe';

  const res = await mcpSession(
    'npx', ['-y', '@modelcontextprotocol/server-memory'],
    async ({ send }) => {
      await send('tools/call', {
        name: 'create_entities',
        arguments: {
          entities: [{ name: PROBE, entityType: 'probe', observations: ['health-check-roundtrip'] }],
        },
      });

      const readResp = await send('tools/call', {
        name: 'search_nodes',
        arguments: { query: PROBE },
      });

      await send('tools/call', {
        name: 'delete_entities',
        arguments: { entityNames: [PROBE] },
      });

      const found = JSON.stringify(readResp?.result ?? '').includes(PROBE);
      return { roundtrip: found };
    }
  );

  if (!res.ok) {
    report('OFFLINE', 'memory', `server não respondeu: ${res.error}`);
    return;
  }

  if (!res.result.roundtrip) {
    report('DEGRADED', 'memory', 'server iniciou mas roundtrip write→read falhou');
    return;
  }

  report('HEALTHY', 'memory', 'grafo writable · roundtrip write→read→delete ok');
}

// ── everything ────────────────────────────────────────────────────────────────
async function checkEverything() {
  const res = await mcpSession(
    'npx', ['-y', '@modelcontextprotocol/server-everything'],
    async ({ send }) => {
      const resp = await send('tools/list');
      return resp?.result?.tools ?? [];
    }
  );

  if (!res.ok) {
    report('OFFLINE', 'everything', `server não respondeu: ${res.error}`);
    return;
  }

  const tools = res.result;
  const names = tools.map(t => t.name).join(', ');

  if (tools.length < 5) {
    report('DEGRADED', 'everything',
      `apenas ${tools.length} tools retornadas (mín: 5) · ${names}`);
    return;
  }

  report('HEALTHY', 'everything', `${tools.length} tools · ${names}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);
console.log(`\n${C.bold}NovaTech Assistant — MCP Health Check${C.reset}  ${C.dim}${ts}${C.reset}`);
console.log(`${C.dim}Repositório: ${REPO}${C.reset}`);
console.log(`${C.dim}${'─'.repeat(68)}${C.reset}\n`);

await checkFilesystem();
await checkGit();
await checkMemory();
await checkEverything();

console.log(`\n${C.dim}${'─'.repeat(68)}${C.reset}`);
const sumColor = exitCode === 0 ? C.green : exitCode === 1 ? C.yellow : C.red;
const sumLabel = exitCode === 0 ? 'ALL HEALTHY' : exitCode === 1 ? 'DEGRADED' : 'OFFLINE';
console.log(`${sumColor}${C.bold}${sumLabel}${C.reset}  (exit=${exitCode})\n`);

process.exit(exitCode);

// ── EXECUTION LOG ─────────────────────────────────────────────────────────────
// --- EXECUTION LOG (2026-06-23 12:29) ---
//
// NovaTech Assistant — MCP Health Check  2026-06-23 12:29
// Repositório: C:\projetos\dgs-ai\dgs-ai-first\cenario-2\novatech-assistant
// ────────────────────────────────────────────────────────────────────
//
// ✓ HEALTHY   filesystem    14 tools · docs/novatech/ ok · 6 arquivos visíveis
// ✗ OFFLINE   git           uvx não encontrado no PATH — server não iniciou · repo acessível via CLI · branch=cenario-2 · conflitos=0
// ✓ HEALTHY   memory        grafo writable · roundtrip write→read→delete ok
// ✓ HEALTHY   everything    13 tools · echo, get-annotated-message, get-env, get-resource-links,
//                           get-resource-reference, get-structured-content, get-sum, get-tiny-image,
//                           gzip-file-as-resource, toggle-simulated-logging,
//                           toggle-subscriber-updates, trigger-long-running-operation,
//                           simulate-research-query
//
// ────────────────────────────────────────────────────────────────────
// OFFLINE  (exit=2)
//
// Causa do OFFLINE: uvx (runtime do mcp-server-git) não está instalado nesta máquina.
// O repositório git está íntegro e acessível via CLI (git rev-parse confirmado).
// Ação: instalar uvx (https://docs.astral.sh/uv/getting-started/installation/) e re-executar.
// --- END LOG ---
