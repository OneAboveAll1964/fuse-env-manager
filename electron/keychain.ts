import { safeStorage } from 'electron';
import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { defaultVaultDir } from '../shared/paths';

const DEVICE_FILE = 'device.key';

function devicePath(): string {
  return path.join(defaultVaultDir(), DEVICE_FILE);
}

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function deviceKeyExists(): boolean {
  return existsSync(devicePath());
}

export function saveDeviceKey(dek: Buffer): void {
  if (!encryptionAvailable()) throw new Error('This device cannot store keys securely');
  mkdirSync(defaultVaultDir(), { recursive: true });
  const encrypted = safeStorage.encryptString(dek.toString('base64'));
  writeFileSync(devicePath(), encrypted, { mode: 0o600 });
}

export function loadDeviceKey(): Buffer | null {
  if (!deviceKeyExists() || !encryptionAvailable()) return null;
  try {
    const raw = readFileSync(devicePath());
    return Buffer.from(safeStorage.decryptString(raw), 'base64');
  } catch {
    return null;
  }
}

export function clearDeviceKey(): void {
  try {
    if (deviceKeyExists()) unlinkSync(devicePath());
  } catch {}
}
