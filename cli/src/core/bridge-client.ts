import { existsSync, readFileSync } from 'node:fs';
import { request } from 'node:http';
import { bridgePath } from '@shared/paths';

type BridgeFile = {
  port: number;
  token: string;
  pid: number;
  appVersion: string;
  startedAt: string;
};

export type BridgeHandle = {
  port: number;
  token: string;
  appVersion: string;
};

export function readBridgeFile(): BridgeHandle | null {
  const file = bridgePath();
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as BridgeFile;
    if (!parsed.port || !parsed.token) return null;
    return { port: parsed.port, token: parsed.token, appVersion: parsed.appVersion };
  } catch {
    return null;
  }
}

function post(
  handle: BridgeHandle,
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(
      {
        host: '127.0.0.1',
        port: handle.port,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          authorization: `Bearer ${handle.token}`,
        },
        timeout: timeoutMs,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          raw += chunk;
        });
        res.on('end', () => {
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`The app rejected the request (${res.statusCode ?? 'no status'})`));
            return;
          }
          resolve(raw);
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('The app did not answer in time'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export async function bridgeAvailable(handle: BridgeHandle): Promise<boolean> {
  try {
    await post(handle, '/v1/rpc', { op: 'vault.status', args: [] }, 1200);
    return true;
  } catch {
    return false;
  }
}

export async function bridgeCall<T>(
  handle: BridgeHandle,
  op: string,
  args: unknown[],
  timeoutMs = 15_000,
): Promise<T> {
  const raw = await post(handle, '/v1/rpc', { op, args }, timeoutMs);
  const parsed = JSON.parse(raw) as { ok: boolean; result?: T; error?: string };
  if (!parsed.ok) throw new Error(parsed.error ?? 'The app could not complete that');
  return parsed.result as T;
}
