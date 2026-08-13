import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { FuseBridge } from '../shared/bridge';
import type { VaultData } from '../shared/types';

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

const subscribe = <T>(channel: string, handler: (value: T) => void): (() => void) => {
  const listener = (_event: IpcRendererEvent, value: T): void => handler(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const bridge: FuseBridge = {
  isElectron: true,

  window: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: () => invoke('window:toggle-maximize'),
    close: () => invoke('window:close'),
    isMaximized: () => invoke('window:is-maximized'),
    platform: () => invoke('window:platform'),
    onMaximizedChange: (handler) => subscribe<boolean>('window:maximized-changed', handler),
  },

  vault: {
    status: () => invoke('vault:status'),
    create: (input) => invoke('vault:create', input),
    unlock: (input) => invoke('vault:unlock', input),
    unlockWithDevice: (input) => invoke('vault:unlock-device', input),
    biometricUnlock: () => invoke('vault:biometric-unlock'),
    lock: () => invoke('vault:lock'),
    load: () => invoke('vault:load'),
    changePassword: (input) => invoke('vault:change-password', input),
    forgetDevice: () => invoke('vault:forget-device'),
    rememberOnDevice: (input) => invoke('vault:remember-device', input),
    touch: () => invoke('vault:touch'),
    onLocked: (handler) => subscribe<void>('vault:locked', () => handler()),
    onChanged: (handler) => subscribe<VaultData>('vault:changed', handler),
    onNavigate: (handler) => subscribe<string>('navigate', handler),
  },

  settings: {
    save: (settings) => invoke('settings:save', settings),
  },

  workspaces: {
    create: (input) => invoke('workspaces:create', input),
    update: (id, patch) => invoke('workspaces:update', id, patch),
    remove: (id) => invoke('workspaces:remove', id),
    duplicate: (id, name) => invoke('workspaces:duplicate', id, name),
    reorder: (ids) => invoke('workspaces:reorder', ids),
  },

  projects: {
    create: (input) => invoke('projects:create', input),
    update: (id, patch) => invoke('projects:update', id, patch),
    remove: (id) => invoke('projects:remove', id),
    duplicate: (id, name, workspaceId) => invoke('projects:duplicate', id, name, workspaceId),
    move: (id, workspaceId) => invoke('projects:move', id, workspaceId),
    linkPath: (id, target) => invoke('projects:link', id, target),
    unlinkPath: (id, target) => invoke('projects:unlink', id, target),
  },

  folders: {
    create: (input) => invoke('folders:create', input),
    update: (id, patch) => invoke('folders:update', id, patch),
    remove: (id) => invoke('folders:remove', id),
    duplicate: (id, name) => invoke('folders:duplicate', id, name),
    move: (id, projectId, parentId) => invoke('folders:move', id, projectId, parentId),
  },

  files: {
    create: (input) => invoke('files:create', input),
    update: (id, patch) => invoke('files:update', id, patch),
    remove: (id) => invoke('files:remove', id),
    duplicate: (id, name) => invoke('files:duplicate', id, name),
    copyTo: (id, projectId, folderId, name) =>
      invoke('files:copy-to', id, projectId, folderId, name),
    move: (id, projectId, folderId, name) => invoke('files:move', id, projectId, folderId, name),
    render: (id, options) => invoke('files:render', id, options),
    preview: (id, text, format) => invoke('files:preview', id, text, format),
    writeToDisk: (id, targetPath, options) =>
      invoke('files:write-to-disk', id, targetPath, options),
  },

  vars: {
    create: (input) => invoke('vars:create', input),
    update: (id, patch) => invoke('vars:update', id, patch),
    remove: (ids) => invoke('vars:remove', ids),
    bulk: (input) => invoke('vars:bulk', input),
    reorder: (fileId, ids) => invoke('vars:reorder', fileId, ids),
    copyTo: (ids, fileId, mode) => invoke('vars:copy-to', ids, fileId, mode),
    moveTo: (ids, fileId, mode) => invoke('vars:move-to', ids, fileId, mode),
    reveal: (id) => invoke('vars:reveal', id),
  },

  history: {
    list: (filter) => invoke('history:list', filter),
    restore: (revisionId) => invoke('history:restore', revisionId),
    clear: () => invoke('history:clear'),
  },

  transfer: {
    exportArchive: (options) => invoke('transfer:export', options),
    previewArchive: (target) => invoke('transfer:preview', target),
    importArchive: (input) => invoke('transfer:import', input),
    exportFileToDisk: (fileId, format) => invoke('transfer:export-file', fileId, format),
    importFromDisk: () => invoke('transfer:import-from-disk'),
  },

  cli: {
    install: () => invoke('cli:install'),
    uninstall: () => invoke('cli:uninstall'),
    status: () => invoke('cli:status'),
    bridgeInfo: () => invoke('cli:bridge-info'),
    setBridgeEnabled: (enabled) => invoke('cli:set-bridge-enabled', enabled),
  },

  system: {
    openPath: (target) => invoke('system:open-path', target),
    revealPath: (target) => invoke('system:reveal-path', target),
    openExternal: (url) => invoke('system:open-external', url),
    pickDirectory: (title, defaultPath) => invoke('system:pick-directory', title, defaultPath),
    pickFile: (title) => invoke('system:pick-file', title),
    saveText: (input) => invoke('system:save-text', input),
    copySecret: (value, clearAfterSeconds) =>
      invoke('system:copy-secret', value, clearAfterSeconds),
    generateSecret: (kind, length) => invoke('system:generate-secret', kind, length),
    inspectPath: (target) => invoke('system:inspect-path', target),
    dataDir: () => invoke('system:data-dir'),
    appVersion: () => invoke('system:app-version'),
  },
};

contextBridge.exposeInMainWorld('fuse', bridge);
