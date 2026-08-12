import os from 'node:os';
import path from 'node:path';

export const APP_DIR_NAME = 'Fuse';
export const VAULT_FILE = 'vault.fuse';
export const BACKUP_FILE = 'vault.fuse.bak';
export const CONFIG_FILE = 'config.json';
export const BRIDGE_FILE = 'bridge.json';
export const SESSION_FILE = 'session.json';
export const LINK_FILE = '.fuse.json';

export function defaultVaultDir(): string {
  const override = process.env.FUSE_HOME;
  if (override && override.trim()) return path.resolve(override.trim());

  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', APP_DIR_NAME);
    case 'win32':
      return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), APP_DIR_NAME);
    default:
      return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), APP_DIR_NAME);
  }
}

export function vaultPath(dir: string = defaultVaultDir()): string {
  return path.join(dir, VAULT_FILE);
}

export function backupPath(dir: string = defaultVaultDir()): string {
  return path.join(dir, BACKUP_FILE);
}

export function configPath(dir: string = defaultVaultDir()): string {
  return path.join(dir, CONFIG_FILE);
}

export function bridgePath(dir: string = defaultVaultDir()): string {
  return path.join(dir, BRIDGE_FILE);
}

export function sessionPath(dir: string = defaultVaultDir()): string {
  return path.join(dir, SESSION_FILE);
}
