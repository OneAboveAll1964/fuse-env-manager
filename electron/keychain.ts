import { safeStorage, systemPreferences } from 'electron';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { defaultVaultDir } from '../shared/paths';
import {
  deriveKey,
  open,
  seal,
  VaultError,
  type KdfParams,
  type Sealed,
} from '../shared/vault-crypto';

const DEVICE_FILE = 'device.key';
const BIOMETRIC_FILE = 'device.biometric';
const ATTEMPTS_FILE = 'device.attempts';
const CHECK_PLAINTEXT = 'fuse-device-check';

export const MAX_ATTEMPTS = 5;

type DeviceFile = {
  v: 1;
  kdf: KdfParams;
  wrapped: Sealed;
  check: Sealed;
  biometric: boolean;
};

type AttemptsFile = {
  failed: number;
};

function filePath(name: string): string {
  return path.join(defaultVaultDir(), name);
}

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function biometricsAvailable(): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    return systemPreferences.canPromptTouchID();
  } catch {
    return false;
  }
}

export async function promptBiometrics(reason: string): Promise<boolean> {
  if (!biometricsAvailable()) return false;
  try {
    await systemPreferences.promptTouchID(reason);
    return true;
  } catch {
    return false;
  }
}

export function deviceKeyExists(): boolean {
  return existsSync(filePath(DEVICE_FILE));
}

function readDeviceFile(): DeviceFile | null {
  if (!deviceKeyExists() || !encryptionAvailable()) return null;
  try {
    const raw = readFileSync(filePath(DEVICE_FILE));
    return JSON.parse(safeStorage.decryptString(raw)) as DeviceFile;
  } catch {
    return null;
  }
}

export function deviceKeyUsesBiometrics(): boolean {
  return existsSync(filePath(BIOMETRIC_FILE)) && readDeviceFile()?.biometric === true;
}

function readAttempts(): number {
  try {
    const raw = readFileSync(filePath(ATTEMPTS_FILE), 'utf8');
    return (JSON.parse(raw) as AttemptsFile).failed ?? 0;
  } catch {
    return 0;
  }
}

function writeAttempts(failed: number): void {
  try {
    mkdirSync(defaultVaultDir(), { recursive: true });
    writeFileSync(filePath(ATTEMPTS_FILE), JSON.stringify({ failed }), { mode: 0o600 });
  } catch {
    /* the count is a convenience, not a guarantee */
  }
}

export function attemptsLeft(): number {
  return Math.max(0, MAX_ATTEMPTS - readAttempts());
}

function pinKdf(salt: string): KdfParams {
  return { name: 'scrypt', N: 32768, r: 8, p: 1, keylen: 32, salt };
}

export function saveDeviceKey(dek: Buffer, pin: string, useBiometrics: boolean): void {
  if (!encryptionAvailable()) throw new Error('This device cannot store keys securely');
  if (pin.trim().length < 4) throw new Error('The device PIN needs at least 4 characters');

  const kdf = pinKdf(randomBytes(16).toString('base64'));
  const key = deriveKey(pin, kdf);
  const payload: DeviceFile = {
    v: 1,
    kdf,
    wrapped: seal(key, dek),
    check: seal(key, Buffer.from(CHECK_PLAINTEXT, 'utf8')),
    biometric: useBiometrics && biometricsAvailable(),
  };

  mkdirSync(defaultVaultDir(), { recursive: true });
  writeFileSync(filePath(DEVICE_FILE), safeStorage.encryptString(JSON.stringify(payload)), {
    mode: 0o600,
  });

  if (payload.biometric) {
    writeFileSync(filePath(BIOMETRIC_FILE), safeStorage.encryptString(pin), { mode: 0o600 });
  } else {
    removeBiometricCopy();
  }
  writeAttempts(0);
}

function removeBiometricCopy(): void {
  try {
    if (existsSync(filePath(BIOMETRIC_FILE))) unlinkSync(filePath(BIOMETRIC_FILE));
  } catch {
    /* nothing to remove */
  }
}

export function readBiometricPin(): string | null {
  if (!existsSync(filePath(BIOMETRIC_FILE)) || !encryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(readFileSync(filePath(BIOMETRIC_FILE)));
  } catch {
    return null;
  }
}

export function unlockDeviceKey(pin: string): Buffer {
  const payload = readDeviceFile();
  if (!payload) throw new VaultError('no-device-key', 'This device has not been remembered');

  const key = deriveKey(pin, payload.kdf);
  let valid = false;
  try {
    const decoded = open(key, payload.check);
    const expected = Buffer.from(CHECK_PLAINTEXT, 'utf8');
    valid = decoded.length === expected.length && timingSafeEqual(decoded, expected);
  } catch {
    valid = false;
  }

  if (!valid) {
    const failed = readAttempts() + 1;
    writeAttempts(failed);
    if (failed >= MAX_ATTEMPTS) {
      clearDeviceKey();
      throw new VaultError(
        'device-locked-out',
        'Too many wrong PINs. This device has been forgotten, so the master password is needed.',
      );
    }
    throw new VaultError(
      'bad-pin',
      `That PIN is not correct. ${MAX_ATTEMPTS - failed} attempt${MAX_ATTEMPTS - failed === 1 ? '' : 's'} left before this device is forgotten.`,
    );
  }

  writeAttempts(0);
  return open(key, payload.wrapped);
}

export function clearDeviceKey(): void {
  for (const name of [DEVICE_FILE, BIOMETRIC_FILE, ATTEMPTS_FILE]) {
    try {
      if (existsSync(filePath(name))) unlinkSync(filePath(name));
    } catch {
      /* nothing to remove */
    }
  }
}
