import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { DEFAULT_SETTINGS } from '@shared/defaults';
import { backupPath, defaultVaultDir, vaultPath } from '@shared/paths';
import { decryptVault, encryptVault, unwrapDek, VaultError } from '@shared/vault-crypto';
import type { VaultData } from '@shared/types';
import { bridgeAvailable, bridgeCall, readBridgeFile, type BridgeHandle } from './bridge-client';
import { clearSession, readSession, writeSession } from './session';
import { password as askPassword } from '../ui/prompt';
import { isInteractive } from '../ui/prompt';

export type ClientMode = 'bridge' | 'direct';

export type Client = {
  mode: ClientMode;
  data: VaultData;
  reload: () => Promise<VaultData>;
  save: (mutate: (draft: VaultData) => void | Promise<void>) => Promise<VaultData>;
  bridge: BridgeHandle | null;
};

const DEFAULT_TTL_SECONDS = 15 * 60;

function normalise(parsed: Partial<VaultData>): VaultData {
  return {
    version: parsed.version ?? 1,
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    workspaces: parsed.workspaces ?? [],
    projects: parsed.projects ?? [],
    folders: parsed.folders ?? [],
    files: parsed.files ?? [],
    vars: parsed.vars ?? [],
    revisions: parsed.revisions ?? [],
  };
}

export function vaultExists(): boolean {
  return existsSync(vaultPath());
}

function readVaultFile(): Buffer {
  return readFileSync(vaultPath());
}

function writeVaultFile(buffer: Buffer): void {
  mkdirSync(defaultVaultDir(), { recursive: true });
  const target = vaultPath();
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, buffer, { mode: 0o600 });
  try {
    if (existsSync(backupPath())) unlinkSync(backupPath());
  } catch {
    /* keep going */
  }
  try {
    if (existsSync(target)) renameSync(target, backupPath());
  } catch {
    /* keep going */
  }
  renameSync(tmp, target);
}

async function resolveDek(options: { ttlSeconds: number; quiet: boolean }): Promise<Buffer> {
  const cached = readSession();
  if (cached) return cached;

  const fromEnv = process.env.FUSE_MASTER_PASSWORD;
  if (fromEnv) {
    const dek = unwrapDek(readVaultFile(), fromEnv);
    writeSession(dek, options.ttlSeconds);
    return dek;
  }

  if (!isInteractive()) {
    throw new Error(
      'The vault is locked. Open the Fuse app, run "fuse unlock", or set FUSE_MASTER_PASSWORD.',
    );
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const entered = await askPassword('Master password');
    try {
      const dek = unwrapDek(readVaultFile(), entered);
      writeSession(dek, options.ttlSeconds);
      return dek;
    } catch (err) {
      if (attempt === 2) throw err;
      if (!options.quiet) process.stdout.write('That password did not work, try again.\n');
    }
  }
  throw new VaultError('bad-password', 'That master password is not correct');
}

export async function connect(
  options: { preferDirect?: boolean; ttlSeconds?: number; quiet?: boolean } = {},
): Promise<Client> {
  if (!vaultExists()) {
    throw new Error(
      `No vault was found at ${vaultPath()}. Run "fuse init" to create one, open the Fuse app, or set FUSE_HOME.`,
    );
  }

  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  if (!options.preferDirect && process.env.FUSE_NO_BRIDGE !== '1') {
    const handle = readBridgeFile();
    if (handle && (await bridgeAvailable(handle))) {
      const state = await bridgeCall<{ locked: boolean }>(handle, 'vault.status', []);
      if (!state.locked) {
        const data = await bridgeCall<VaultData>(handle, 'vault.data', []);
        let cache = normalise(data);
        return {
          mode: 'bridge',
          bridge: handle,
          get data() {
            return cache;
          },
          reload: async () => {
            cache = normalise(await bridgeCall<VaultData>(handle, 'vault.data', []));
            return cache;
          },
          save: async (mutate) => {
            const draft = normalise(JSON.parse(JSON.stringify(cache)) as VaultData);
            await mutate(draft);
            await bridgeCall(handle, 'vault.replace', [draft]);
            cache = draft;
            return cache;
          },
        };
      }
    }
  }

  const dek = await resolveDek({ ttlSeconds, quiet: options.quiet ?? false });
  let cache = normalise(
    JSON.parse(decryptVault(readVaultFile(), dek).toString('utf8')) as VaultData,
  );

  return {
    mode: 'direct',
    bridge: null,
    get data() {
      return cache;
    },
    reload: () => {
      cache = normalise(
        JSON.parse(decryptVault(readVaultFile(), dek).toString('utf8')) as VaultData,
      );
      return Promise.resolve(cache);
    },
    save: async (mutate) => {
      const fresh = normalise(
        JSON.parse(decryptVault(readVaultFile(), dek).toString('utf8')) as VaultData,
      );
      await mutate(fresh);
      writeVaultFile(
        encryptVault(readVaultFile(), dek, Buffer.from(JSON.stringify(fresh), 'utf8')),
      );
      cache = fresh;
      return cache;
    },
  };
}

export async function unlockAndCache(ttlSeconds: number): Promise<void> {
  if (!vaultExists()) throw new Error(`No vault was found at ${vaultPath()}`);
  clearSession();
  await resolveDek({ ttlSeconds, quiet: false });
}
