import {
  BrowserWindow,
  app,
  clipboard,
  dialog,
  ipcMain,
  powerMonitor,
  shell,
} from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateSecret } from '../shared/vault-crypto';
import { emptyVault } from '../shared/defaults';
import { LINK_FILE } from '../shared/paths';
import type {
  AppSettings,
  EnvFormat,
  ExportOptions,
  GeneratedSecretKind,
  Id,
  ImportMode,
  LinkedPathInfo,
  VaultStatus,
} from '../shared/types';
import type { PickedFile, RenderOptions, UnlockResult } from '../shared/bridge';
import * as ops from './operations';
import * as archive from './archive';
import { bridgeInfo, startBridge, stopBridge } from './bridge-server';
import { bundledCliPath, installCli, installedCliPath, uninstallCli } from './cli-install';
import { encryptionAvailable } from './keychain';
import {
  changePassword,
  createNewVault,
  forgetDevice,
  hasDeviceKey,
  isInitialized,
  isLocked,
  lock,
  reload,
  rememberDevice,
  requireUnlocked,
  unlockWithDeviceKey,
  unlockWithPassword,
  vaultDir,
  vaultHint,
  vaultPath,
  watchVaultFile,
} from './vault';
import { seedSampleVault } from './sample';

let lastActivityAt = Date.now();
let lockTimer: NodeJS.Timeout | null = null;
let clipboardTimer: NodeJS.Timeout | null = null;
let getWindow: () => BrowserWindow | null = () => null;

function send(channel: string, ...args: unknown[]): void {
  getWindow()?.webContents.send(channel, ...args);
}

function autoLockMinutes(): number {
  try {
    return requireUnlocked().settings.autoLockMinutes;
  } catch {
    return 0;
  }
}

export function lockNow(): void {
  if (isLocked()) return;
  lock();
  send('vault:locked');
}

function touch(): void {
  lastActivityAt = Date.now();
}

function startLockTimer(): void {
  if (lockTimer) return;
  lockTimer = setInterval(() => {
    if (isLocked()) return;
    const minutes = autoLockMinutes();
    if (minutes <= 0) return;
    if (Date.now() - lastActivityAt >= minutes * 60_000) lockNow();
  }, 15_000);
}

function status(): VaultStatus {
  const info = bridgeInfo();
  const cliPath = installedCliPath();
  let minutes = 0;
  try {
    minutes = requireUnlocked().settings.autoLockMinutes;
  } catch {
    minutes = 0;
  }
  return {
    initialized: isInitialized(),
    locked: isLocked(),
    vaultDir,
    vaultPath,
    hint: vaultHint(),
    deviceKey: hasDeviceKey(),
    encryptionAvailable: encryptionAvailable(),
    bridgeRunning: info.running,
    bridgePort: info.port,
    cliInstalled: Boolean(cliPath),
    cliPath,
    appVersion: app.getVersion(),
    platform: process.platform,
    autoLockMinutes: minutes,
    lastActivityAt: new Date(lastActivityAt).toISOString(),
  };
}

function unlockResult(error: string | null): UnlockResult {
  return { ok: error === null, error, status: status() };
}

function syncBridge(): void {
  try {
    const data = requireUnlocked();
    if (data.settings.bridgeEnabled) startBridge(app.getVersion());
    else stopBridge();
  } catch {
    stopBridge();
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function registerIpc(resolveWindow: () => BrowserWindow | null): void {
  getWindow = resolveWindow;

  ipcMain.handle('window:minimize', () => {
    getWindow()?.minimize();
  });
  ipcMain.handle('window:toggle-maximize', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle('window:close', () => {
    getWindow()?.close();
  });
  ipcMain.handle('window:is-maximized', () => getWindow()?.isMaximized() ?? false);
  ipcMain.handle('window:platform', () => process.platform);

  ipcMain.handle('vault:status', () => status());
  ipcMain.handle('vault:touch', () => {
    touch();
  });

  ipcMain.handle(
    'vault:create',
    async (
      _e,
      input: { password: string; hint: string; rememberOnDevice: boolean; sample: boolean },
    ): Promise<UnlockResult> => {
      try {
        if (isInitialized()) return unlockResult('A vault already exists on this device');
        const seed = input.sample ? seedSampleVault() : emptyVault();
        await createNewVault(input.password, input.hint, seed);
        if (input.rememberOnDevice && encryptionAvailable()) rememberDevice();
        touch();
        startLockTimer();
        syncBridge();
        watchVaultFile(onExternalChange);
        return unlockResult(null);
      } catch (err) {
        return unlockResult(errorMessage(err));
      }
    },
  );

  ipcMain.handle(
    'vault:unlock',
    async (_e, input: { password: string; rememberOnDevice: boolean }): Promise<UnlockResult> => {
      try {
        await unlockWithPassword(input.password);
        if (input.rememberOnDevice && encryptionAvailable()) rememberDevice();
        touch();
        startLockTimer();
        syncBridge();
        watchVaultFile(onExternalChange);
        return unlockResult(null);
      } catch (err) {
        return unlockResult(errorMessage(err));
      }
    },
  );

  ipcMain.handle('vault:unlock-device', async (): Promise<UnlockResult> => {
    try {
      await unlockWithDeviceKey();
      touch();
      startLockTimer();
      syncBridge();
      watchVaultFile(onExternalChange);
      return unlockResult(null);
    } catch (err) {
      return unlockResult(errorMessage(err));
    }
  });

  ipcMain.handle('vault:lock', () => {
    lockNow();
    return status();
  });

  ipcMain.handle('vault:load', () => requireUnlocked());

  ipcMain.handle(
    'vault:change-password',
    async (
      _e,
      input: { currentPassword: string; nextPassword: string; hint: string },
    ): Promise<UnlockResult> => {
      try {
        await changePassword(input.currentPassword, input.nextPassword, input.hint);
        return unlockResult(null);
      } catch (err) {
        return unlockResult(errorMessage(err));
      }
    },
  );

  ipcMain.handle('vault:forget-device', () => {
    forgetDevice();
    return status();
  });

  ipcMain.handle('vault:remember-device', () => {
    rememberDevice();
    return status();
  });

  ipcMain.handle('settings:save', async (_e, settings: AppSettings) => {
    const data = await ops.saveSettings(settings);
    syncBridge();
    return data;
  });

  ipcMain.handle('workspaces:create', (_e, input) => ops.createWorkspace(input));
  ipcMain.handle('workspaces:update', (_e, id: Id, patch) => ops.updateWorkspace(id, patch));
  ipcMain.handle('workspaces:remove', (_e, id: Id) => ops.removeWorkspace(id));
  ipcMain.handle('workspaces:duplicate', (_e, id: Id, name: string) =>
    ops.duplicateWorkspace(id, name),
  );
  ipcMain.handle('workspaces:reorder', (_e, ids: Id[]) => ops.reorderWorkspaces(ids));

  ipcMain.handle('projects:create', (_e, input) => ops.createProject(input));
  ipcMain.handle('projects:update', (_e, id: Id, patch) => ops.updateProject(id, patch));
  ipcMain.handle('projects:remove', (_e, id: Id) => ops.removeProject(id));
  ipcMain.handle('projects:duplicate', (_e, id: Id, name: string, workspaceId: Id) =>
    ops.duplicateProject(id, name, workspaceId),
  );
  ipcMain.handle('projects:move', (_e, id: Id, workspaceId: Id) => ops.moveProject(id, workspaceId));
  ipcMain.handle('projects:link', (_e, id: Id, target: string) => ops.linkProjectPath(id, target));
  ipcMain.handle('projects:unlink', (_e, id: Id, target: string) =>
    ops.unlinkProjectPath(id, target),
  );

  ipcMain.handle('folders:create', (_e, input) => ops.createFolder(input));
  ipcMain.handle('folders:update', (_e, id: Id, patch) => ops.updateFolder(id, patch));
  ipcMain.handle('folders:remove', (_e, id: Id) => ops.removeFolder(id));
  ipcMain.handle('folders:duplicate', (_e, id: Id, name: string) => ops.duplicateFolder(id, name));
  ipcMain.handle('folders:move', (_e, id: Id, projectId: Id, parentId: Id | null) =>
    ops.moveFolder(id, projectId, parentId),
  );

  ipcMain.handle('files:create', (_e, input) => ops.createFile(input));
  ipcMain.handle('files:update', (_e, id: Id, patch) => ops.updateFile(id, patch));
  ipcMain.handle('files:remove', (_e, id: Id) => ops.removeFile(id));
  ipcMain.handle('files:duplicate', (_e, id: Id, name: string) => ops.duplicateFile(id, name));
  ipcMain.handle('files:move', (_e, id: Id, projectId: Id, folderId: Id | null) =>
    ops.moveFile(id, projectId, folderId),
  );
  ipcMain.handle('files:render', (_e, id: Id, options: RenderOptions) =>
    ops.renderFile(id, options),
  );
  ipcMain.handle('files:preview', (_e, id: Id, text: string, format: EnvFormat | 'auto') =>
    ops.previewImport(id, text, format),
  );
  ipcMain.handle(
    'files:write-to-disk',
    async (_e, id: Id, targetPath: string, options: RenderOptions) => {
      const text = ops.renderFile(id, options);
      await writeFile(targetPath, text, 'utf8');
      return targetPath;
    },
  );

  ipcMain.handle('vars:create', (_e, input) => ops.createVar(input));
  ipcMain.handle('vars:update', (_e, id: Id, patch) => ops.updateVar(id, patch));
  ipcMain.handle('vars:remove', (_e, ids: Id[]) => ops.removeVars(ids));
  ipcMain.handle('vars:bulk', (_e, input) => ops.bulkUpsertVars(input));
  ipcMain.handle('vars:reorder', (_e, fileId: Id, ids: Id[]) => ops.reorderVars(fileId, ids));
  ipcMain.handle('vars:copy-to', (_e, ids: Id[], fileId: Id, mode: ImportMode) =>
    ops.copyVarsTo(ids, fileId, mode),
  );
  ipcMain.handle('vars:move-to', (_e, ids: Id[], fileId: Id, mode: ImportMode) =>
    ops.moveVarsTo(ids, fileId, mode),
  );
  ipcMain.handle('vars:reveal', (_e, id: Id) => {
    touch();
    const data = requireUnlocked();
    return data.vars.find((v) => v.id === id)?.value ?? '';
  });

  ipcMain.handle('history:list', (_e, filter: { entityId?: Id; limit?: number }) =>
    ops.listRevisions(filter ?? {}),
  );
  ipcMain.handle('history:restore', (_e, revisionId: Id) => ops.restoreRevision(revisionId));
  ipcMain.handle('history:clear', () => ops.clearHistory());

  ipcMain.handle('transfer:export', async (_e, options: ExportOptions) => {
    const win = getWindow();
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(win ?? undefined!, {
      title: 'Export from Fuse',
      defaultPath: path.join(
        app.getPath('downloads'),
        `fuse-export-${stamp}${options.encrypt ? '-encrypted' : ''}.zip`,
      ),
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return archive.writeArchive(result.filePath, options, app.getVersion());
  });

  ipcMain.handle('transfer:preview', async (_e, target?: string) => {
    let file = target;
    if (!file) {
      const win = getWindow();
      const result = await dialog.showOpenDialog(win ?? undefined!, {
        title: 'Import into Fuse',
        properties: ['openFile'],
        filters: [{ name: 'Fuse export', extensions: ['zip'] }],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      file = result.filePaths[0];
    }
    return { path: file, preview: await archive.previewArchive(file) };
  });

  ipcMain.handle(
    'transfer:import',
    (_e, input: { path: string; password: string; mode: ImportMode }) =>
      archive.importArchive(input.path, input.password, input.mode),
  );

  ipcMain.handle('transfer:export-file', async (_e, fileId: Id, format: EnvFormat) => {
    const win = getWindow();
    const data = requireUnlocked();
    const name = archive.fileDiskName(data, fileId);
    const result = await dialog.showSaveDialog(win ?? undefined!, {
      title: 'Save env file',
      defaultPath: path.join(app.getPath('downloads'), name),
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, ops.renderFile(fileId, { format }), 'utf8');
    return result.filePath;
  });

  ipcMain.handle('transfer:import-from-disk', async (): Promise<PickedFile> => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Choose an env file',
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const target = result.filePaths[0];
    return {
      name: path.basename(target),
      path: target,
      text: await readFile(target, 'utf8'),
    };
  });

  ipcMain.handle('cli:install', () => installCli());
  ipcMain.handle('cli:uninstall', () => uninstallCli());
  ipcMain.handle('cli:status', () => ({
    installed: Boolean(installedCliPath()),
    path: installedCliPath(),
    bundled: bundledCliPath(),
  }));
  ipcMain.handle('cli:bridge-info', () => bridgeInfo());
  ipcMain.handle('cli:set-bridge-enabled', async (_e, enabled: boolean) => {
    const data = requireUnlocked();
    await ops.saveSettings({ ...data.settings, bridgeEnabled: enabled });
    syncBridge();
    return status();
  });

  ipcMain.handle('system:open-path', (_e, target: string) => shell.openPath(target));
  ipcMain.handle('system:reveal-path', (_e, target: string) => {
    shell.showItemInFolder(target);
  });
  ipcMain.handle('system:open-external', (_e, url: string) => {
    if (/^https?:/.test(url)) return shell.openExternal(url);
    return Promise.resolve();
  });
  ipcMain.handle('system:pick-directory', async (_e, title: string, defaultPath?: string) => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title,
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });
  ipcMain.handle('system:pick-file', async (_e, title: string): Promise<PickedFile> => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title,
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const target = result.filePaths[0];
    return { name: path.basename(target), path: target, text: await readFile(target, 'utf8') };
  });
  ipcMain.handle(
    'system:save-text',
    async (_e, input: { title: string; defaultName: string; text: string }) => {
      const win = getWindow();
      const result = await dialog.showSaveDialog(win ?? undefined!, {
        title: input.title,
        defaultPath: path.join(app.getPath('downloads'), input.defaultName),
      });
      if (result.canceled || !result.filePath) return null;
      await writeFile(result.filePath, input.text, 'utf8');
      return result.filePath;
    },
  );
  ipcMain.handle('system:copy-secret', (_e, value: string, clearAfterSeconds: number) => {
    clipboard.writeText(value);
    touch();
    if (clipboardTimer) clearTimeout(clipboardTimer);
    if (clearAfterSeconds > 0) {
      clipboardTimer = setTimeout(() => {
        if (clipboard.readText() === value) clipboard.clear();
      }, clearAfterSeconds * 1000);
    }
  });
  ipcMain.handle('system:generate-secret', (_e, kind: GeneratedSecretKind, length: number) =>
    generateSecret(kind, length),
  );
  ipcMain.handle('system:inspect-path', async (_e, target: string): Promise<LinkedPathInfo> => {
    const info: LinkedPathInfo = {
      path: target,
      projectId: null,
      folderId: null,
      fileId: null,
      exists: false,
    };
    try {
      await stat(target);
      info.exists = true;
    } catch {
      return info;
    }
    try {
      const marker = JSON.parse(await readFile(path.join(target, LINK_FILE), 'utf8')) as {
        projectId?: string;
        folderId?: string;
        fileId?: string;
      };
      info.projectId = marker.projectId ?? null;
      info.folderId = marker.folderId ?? null;
      info.fileId = marker.fileId ?? null;
    } catch {
      const data = requireUnlocked();
      info.projectId = data.projects.find((p) => p.links.includes(target))?.id ?? null;
    }
    return info;
  });
  ipcMain.handle('system:data-dir', () => vaultDir);
  ipcMain.handle('system:app-version', () => app.getVersion());

  powerMonitor.on('suspend', () => {
    try {
      if (!isLocked() && requireUnlocked().settings.lockOnSleep) lockNow();
    } catch {}
  });
  powerMonitor.on('lock-screen', () => {
    try {
      if (!isLocked() && requireUnlocked().settings.lockOnSleep) lockNow();
    } catch {}
  });

  startLockTimer();
}

function onExternalChange(): void {
  void reload()
    .then((data) => send('vault:changed', data))
    .catch(() => undefined);
}

export function handleWindowBlur(): void {
  try {
    if (!isLocked() && requireUnlocked().settings.lockOnBlur) lockNow();
  } catch {}
}

export function handleWindowMinimize(): void {
  try {
    if (!isLocked() && requireUnlocked().settings.lockOnMinimize) lockNow();
  } catch {}
}

export function shutdown(): void {
  if (lockTimer) clearInterval(lockTimer);
  if (clipboardTimer) clearTimeout(clipboardTimer);
  stopBridge();
}
