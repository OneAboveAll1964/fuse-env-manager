import type {
  AppSettings,
  ArchiveManifest,
  CliInstallResult,
  EnvFile,
  EnvFolder,
  EnvFormat,
  EnvVar,
  ExportOptions,
  GeneratedSecretKind,
  Id,
  ImportArchiveResult,
  ImportMode,
  ImportPreview,
  LinkedPathInfo,
  Project,
  Revision,
  Tone,
  VarType,
  VaultData,
  VaultStatus,
  Workspace,
} from './types';

export type UnlockResult = {
  ok: boolean;
  error: string | null;
  status: VaultStatus;
};

export type PickedFile = {
  name: string;
  path: string;
  text: string;
} | null;

export type WorkspaceInput = {
  name: string;
  description?: string;
  tone?: Tone;
  icon?: string;
};

export type ProjectInput = {
  workspaceId: Id;
  name: string;
  description?: string;
  tone?: Tone;
  icon?: string;
  tags?: string[];
  starterFolders?: string[];
};

export type FolderInput = {
  projectId: Id;
  parentId: Id | null;
  name: string;
  description?: string;
  tone?: Tone;
};

export type FileInput = {
  projectId: Id;
  folderId: Id | null;
  name: string;
  format?: EnvFormat;
  description?: string;
};

export type VarInput = {
  fileId: Id;
  key: string;
  value: string;
  type?: VarType;
  secret?: boolean;
  enabled?: boolean;
  note?: string;
  options?: string[];
};

export type BulkVarInput = {
  fileId: Id;
  entries: Array<{
    key: string;
    value: string;
    type?: VarType;
    secret?: boolean;
    enabled?: boolean;
    note?: string;
  }>;
  mode: ImportMode;
};

export type RenderOptions = {
  format?: EnvFormat;
  includeNotes?: boolean;
  includeDisabled?: boolean;
  maskSecrets?: boolean;
  header?: string;
};

export type ArchivePreview = {
  manifest: ArchiveManifest;
  needsPassword: boolean;
};

export type FuseBridge = {
  isElectron: true;

  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    platform(): Promise<NodeJS.Platform>;
    onMaximizedChange(handler: (maximized: boolean) => void): () => void;
  };

  vault: {
    status(): Promise<VaultStatus>;
    create(input: {
      password: string;
      hint: string;
      rememberOnDevice: boolean;
      sample: boolean;
    }): Promise<UnlockResult>;
    unlock(input: { password: string; rememberOnDevice: boolean }): Promise<UnlockResult>;
    unlockWithDevice(): Promise<UnlockResult>;
    lock(): Promise<VaultStatus>;
    load(): Promise<VaultData>;
    changePassword(input: {
      currentPassword: string;
      nextPassword: string;
      hint: string;
    }): Promise<UnlockResult>;
    forgetDevice(): Promise<VaultStatus>;
    rememberOnDevice(): Promise<VaultStatus>;
    touch(): Promise<void>;
    onLocked(handler: () => void): () => void;
    onChanged(handler: (data: VaultData) => void): () => void;
  };

  settings: {
    save(settings: AppSettings): Promise<VaultData>;
  };

  workspaces: {
    create(input: WorkspaceInput): Promise<{ data: VaultData; workspace: Workspace }>;
    update(id: Id, patch: Partial<Workspace>): Promise<VaultData>;
    remove(id: Id): Promise<VaultData>;
    duplicate(id: Id, name: string): Promise<{ data: VaultData; workspace: Workspace }>;
    reorder(ids: Id[]): Promise<VaultData>;
  };

  projects: {
    create(input: ProjectInput): Promise<{ data: VaultData; project: Project }>;
    update(id: Id, patch: Partial<Project>): Promise<VaultData>;
    remove(id: Id): Promise<VaultData>;
    duplicate(id: Id, name: string, workspaceId: Id): Promise<{ data: VaultData; project: Project }>;
    move(id: Id, workspaceId: Id): Promise<VaultData>;
    linkPath(id: Id, path: string): Promise<VaultData>;
    unlinkPath(id: Id, path: string): Promise<VaultData>;
  };

  folders: {
    create(input: FolderInput): Promise<{ data: VaultData; folder: EnvFolder }>;
    update(id: Id, patch: Partial<EnvFolder>): Promise<VaultData>;
    remove(id: Id): Promise<VaultData>;
    duplicate(id: Id, name: string): Promise<{ data: VaultData; folder: EnvFolder }>;
    move(id: Id, projectId: Id, parentId: Id | null): Promise<VaultData>;
  };

  files: {
    create(input: FileInput): Promise<{ data: VaultData; file: EnvFile }>;
    update(id: Id, patch: Partial<EnvFile>): Promise<VaultData>;
    remove(id: Id): Promise<VaultData>;
    duplicate(id: Id, name: string): Promise<{ data: VaultData; file: EnvFile }>;
    move(id: Id, projectId: Id, folderId: Id | null): Promise<VaultData>;
    render(id: Id, options: RenderOptions): Promise<string>;
    preview(id: Id, text: string, format: EnvFormat | 'auto'): Promise<ImportPreview>;
    writeToDisk(id: Id, targetPath: string, options: RenderOptions): Promise<string>;
  };

  vars: {
    create(input: VarInput): Promise<{ data: VaultData; variable: EnvVar }>;
    update(id: Id, patch: Partial<EnvVar>): Promise<VaultData>;
    remove(ids: Id[]): Promise<VaultData>;
    bulk(input: BulkVarInput): Promise<VaultData>;
    reorder(fileId: Id, ids: Id[]): Promise<VaultData>;
    copyTo(ids: Id[], fileId: Id, mode: ImportMode): Promise<VaultData>;
    moveTo(ids: Id[], fileId: Id, mode: ImportMode): Promise<VaultData>;
    reveal(id: Id): Promise<string>;
  };

  history: {
    list(filter: { entityId?: Id; limit?: number }): Promise<Revision[]>;
    restore(revisionId: Id): Promise<VaultData>;
    clear(): Promise<VaultData>;
  };

  transfer: {
    exportArchive(options: ExportOptions): Promise<{ path: string; bytes: number } | null>;
    previewArchive(path?: string): Promise<{ path: string; preview: ArchivePreview } | null>;
    importArchive(input: {
      path: string;
      password: string;
      mode: ImportMode;
    }): Promise<ImportArchiveResult>;
    exportFileToDisk(fileId: Id, format: EnvFormat): Promise<string | null>;
    importFromDisk(): Promise<PickedFile>;
  };

  cli: {
    install(): Promise<CliInstallResult>;
    uninstall(): Promise<CliInstallResult>;
    status(): Promise<{ installed: boolean; path: string | null; bundled: string | null }>;
    bridgeInfo(): Promise<{ running: boolean; port: number | null; tokenPath: string }>;
    setBridgeEnabled(enabled: boolean): Promise<VaultStatus>;
  };

  system: {
    openPath(path: string): Promise<void>;
    revealPath(path: string): Promise<void>;
    openExternal(url: string): Promise<void>;
    pickDirectory(title: string, defaultPath?: string): Promise<string | null>;
    pickFile(title: string): Promise<PickedFile>;
    saveText(input: { title: string; defaultName: string; text: string }): Promise<string | null>;
    copySecret(value: string, clearAfterSeconds: number): Promise<void>;
    generateSecret(kind: GeneratedSecretKind, length: number): Promise<string>;
    inspectPath(path: string): Promise<LinkedPathInfo>;
    dataDir(): Promise<string>;
    appVersion(): Promise<string>;
  };
};
