import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { bridgePath, defaultVaultDir } from '../shared/paths';
import { searchVault } from '../shared/tree';
import type { VaultData } from '../shared/types';
import * as ops from './operations';
import {
  isLocked,
  lock,
  replaceVault,
  requireUnlocked,
  unlockWithDeviceKey,
  unlockWithPassword,
} from './vault';

type Handler = (args: unknown[]) => unknown;

let server: Server | null = null;
let token = '';
let port: number | null = null;
let onChange: ((data: VaultData) => void) | null = null;

export function setBridgeChangeHandler(handler: (data: VaultData) => void): void {
  onChange = handler;
}

function tokenMatches(candidate: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 8_000_000) {
        reject(new Error('The request is too large'));
        req.destroy();
        return;
      }
      raw += chunk.toString('utf8');
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function arg<T>(args: unknown[], index: number): T {
  return args[index] as T;
}

const handlers: Record<string, Handler> = {
  'vault.status': () => ({ locked: isLocked() }),
  'vault.data': () => requireUnlocked(),
  'vault.replace': async (args) => {
    const next = await replaceVault(arg<Partial<VaultData>>(args, 0));
    onChange?.(next);
    return { ok: true };
  },
  'vault.lock': () => {
    lock();
    return { locked: true };
  },
  'vault.unlock': async (args) => {
    const password = arg<string>(args, 0);
    if (password) await unlockWithPassword(password);
    else await unlockWithDeviceKey();
    return { locked: isLocked() };
  },
  'search.run': (args) =>
    searchVault(requireUnlocked(), arg<string>(args, 0), arg<number>(args, 1) ?? 100),

  'workspaces.create': (args) => ops.createWorkspace(arg(args, 0), 'cli'),
  'workspaces.update': (args) => ops.updateWorkspace(arg(args, 0), arg(args, 1)),
  'workspaces.remove': (args) => ops.removeWorkspace(arg(args, 0)),

  'projects.create': (args) => ops.createProject(arg(args, 0), 'cli'),
  'projects.update': (args) => ops.updateProject(arg(args, 0), arg(args, 1)),
  'projects.remove': (args) => ops.removeProject(arg(args, 0)),
  'projects.linkPath': (args) => ops.linkProjectPath(arg(args, 0), arg(args, 1)),
  'projects.unlinkPath': (args) => ops.unlinkProjectPath(arg(args, 0), arg(args, 1)),

  'folders.create': (args) => ops.createFolder(arg(args, 0), 'cli'),
  'folders.update': (args) => ops.updateFolder(arg(args, 0), arg(args, 1)),
  'folders.remove': (args) => ops.removeFolder(arg(args, 0)),

  'files.create': (args) => ops.createFile(arg(args, 0), 'cli'),
  'files.update': (args) => ops.updateFile(arg(args, 0), arg(args, 1)),
  'files.remove': (args) => ops.removeFile(arg(args, 0)),
  'files.duplicate': (args) => ops.duplicateFile(arg(args, 0), arg(args, 1)),
  'files.render': (args) => ops.renderFile(arg(args, 0), arg(args, 1) ?? {}),
  'files.preview': (args) => ops.previewImport(arg(args, 0), arg(args, 1), arg(args, 2) ?? 'auto'),

  'vars.create': (args) => ops.createVar(arg(args, 0), 'cli'),
  'vars.update': (args) => ops.updateVar(arg(args, 0), arg(args, 1)),
  'vars.remove': (args) => ops.removeVars(arg(args, 0)),
  'vars.bulk': (args) => ops.bulkUpsertVars(arg(args, 0), 'cli'),
  'vars.copyTo': (args) => ops.copyVarsTo(arg(args, 0), arg(args, 1), arg(args, 2)),
  'vars.moveTo': (args) => ops.moveVarsTo(arg(args, 0), arg(args, 1), arg(args, 2)),

  'history.list': (args) => ops.listRevisions(arg(args, 0) ?? {}),
  'history.restore': (args) => ops.restoreRevision(arg(args, 0)),
};

function unauthorised(res: ServerResponse): void {
  json(res, 401, { error: 'Unauthorised' });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host ?? '';
  if (!/^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) {
    unauthorised(res);
    return;
  }
  if (req.headers.origin) {
    unauthorised(res);
    return;
  }

  const auth = req.headers.authorization ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!provided || !tokenMatches(provided)) {
    unauthorised(res);
    return;
  }

  if (req.method === 'GET' && req.url === '/v1/ping') {
    json(res, 200, { ok: true, app: 'Fuse', locked: isLocked() });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/v1/rpc') {
    json(res, 404, { error: 'Unknown endpoint' });
    return;
  }

  try {
    const body = JSON.parse(await readBody(req)) as { op?: string; args?: unknown[] };
    const handler = body.op ? handlers[body.op] : undefined;
    if (!handler) {
      json(res, 400, { error: `Unknown operation ${body.op ?? ''}` });
      return;
    }
    const result = await handler(body.args ?? []);
    json(res, 200, { ok: true, result: result ?? null });
  } catch (err) {
    json(res, 200, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export function bridgeInfo(): { running: boolean; port: number | null; tokenPath: string } {
  return { running: server !== null, port, tokenPath: bridgePath() };
}

export function startBridge(appVersion: string): void {
  if (server) return;
  token = randomBytes(32).toString('base64url');

  server = createServer((req, res) => {
    void handleRequest(req, res).catch(() => {
      json(res, 500, { error: 'The request failed' });
    });
  });

  server.on('error', () => {
    stopBridge();
  });

  server.listen(0, '127.0.0.1', () => {
    const address = server?.address();
    if (address && typeof address === 'object') port = address.port;
    mkdirSync(defaultVaultDir(), { recursive: true });
    writeFileSync(
      bridgePath(),
      JSON.stringify({
        port,
        token,
        pid: process.pid,
        appVersion,
        startedAt: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
  });
}

export function stopBridge(): void {
  server?.close();
  server = null;
  port = null;
  token = '';
  try {
    if (existsSync(bridgePath())) unlinkSync(bridgePath());
  } catch {}
}

export function vaultDataForBridge(): VaultData {
  return requireUnlocked();
}
