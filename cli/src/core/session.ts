import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { defaultVaultDir, sessionPath } from '@shared/paths';
import { openForMachine, sealForMachine } from '@shared/vault-crypto';

type SessionFile = {
  key: string;
  expiresAt: string;
  createdAt: string;
};

export function readSession(): Buffer | null {
  const file = sessionPath();
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as SessionFile;
    if (new Date(parsed.expiresAt).getTime() < Date.now()) {
      clearSession();
      return null;
    }
    return openForMachine(parsed.key);
  } catch {
    clearSession();
    return null;
  }
}

export function writeSession(dek: Buffer, ttlSeconds: number): void {
  mkdirSync(defaultVaultDir(), { recursive: true });
  const payload: SessionFile = {
    key: sealForMachine(dek),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
  writeFileSync(sessionPath(), JSON.stringify(payload), { mode: 0o600 });
}

export function clearSession(): void {
  try {
    if (existsSync(sessionPath())) unlinkSync(sessionPath());
  } catch {
    /* nothing to clear */
  }
}

export function sessionExpiry(): Date | null {
  const file = sessionPath();
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as SessionFile;
    const expires = new Date(parsed.expiresAt);
    return Number.isNaN(expires.getTime()) ? null : expires;
  } catch {
    return null;
  }
}

export function parseDuration(value: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d)?$/i.exec(value.trim());
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = (match[2] ?? 'm').toLowerCase();
  if (unit.startsWith('s')) return amount;
  if (unit.startsWith('h')) return amount * 3600;
  if (unit.startsWith('d')) return amount * 86400;
  return amount * 60;
}
