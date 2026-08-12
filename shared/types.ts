export type Id = string;

export type Tone =
  | 'brand'
  | 'accent'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'sky'
  | 'teal'
  | 'fuchsia'
  | 'slate';

export type VarType =
  | 'string'
  | 'multiline'
  | 'number'
  | 'boolean'
  | 'json'
  | 'list'
  | 'url'
  | 'email'
  | 'port'
  | 'path'
  | 'secret'
  | 'token'
  | 'connection'
  | 'duration'
  | 'base64'
  | 'uuid'
  | 'date'
  | 'color'
  | 'regex'
  | 'enum';

export type EnvFormat =
  | 'dotenv'
  | 'json'
  | 'yaml'
  | 'toml'
  | 'shell'
  | 'properties'
  | 'xcconfig'
  | 'ini'
  | 'csv'
  | 'docker'
  | 'k8s-configmap'
  | 'k8s-secret'
  | 'github-actions'
  | 'netlify'
  | 'dart-define';

export type Workspace = {
  id: Id;
  name: string;
  description: string;
  tone: Tone;
  icon: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: Id;
  workspaceId: Id;
  name: string;
  description: string;
  tone: Tone;
  icon: string;
  tags: string[];
  links: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type EnvFolder = {
  id: Id;
  projectId: Id;
  parentId: Id | null;
  name: string;
  description: string;
  tone: Tone;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type EnvFile = {
  id: Id;
  projectId: Id;
  folderId: Id | null;
  name: string;
  description: string;
  format: EnvFormat;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type EnvVar = {
  id: Id;
  fileId: Id;
  key: string;
  value: string;
  type: VarType;
  secret: boolean;
  enabled: boolean;
  note: string;
  options: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type EntityKind = 'workspace' | 'project' | 'folder' | 'file' | 'variable';

export type ChangeKind =
  | 'create'
  | 'update'
  | 'delete'
  | 'rename'
  | 'move'
  | 'duplicate'
  | 'import'
  | 'restore'
  | 'reorder';

export type ChangeSource = 'app' | 'cli' | 'import' | 'restore';

export type Revision = {
  id: Id;
  at: string;
  kind: ChangeKind;
  entity: EntityKind;
  entityId: Id;
  label: string;
  path: string;
  before: string | null;
  after: string | null;
  source: ChangeSource;
  note: string;
};

export type ThemeMode = 'light' | 'dark' | 'system';

export type QuoteMode = 'auto' | 'always' | 'never';

export type AppSettings = {
  theme: ThemeMode;
  language: string;
  activeWorkspaceId: Id | null;
  autoLockMinutes: number;
  lockOnBlur: boolean;
  lockOnSleep: boolean;
  lockOnMinimize: boolean;
  maskSecrets: boolean;
  clipboardClearSeconds: number;
  historyEnabled: boolean;
  historyRetentionDays: number;
  historyMaxEntries: number;
  bridgeEnabled: boolean;
  cliRequireConfirm: boolean;
  defaultFormat: EnvFormat;
  quoteMode: QuoteMode;
  confirmDestructive: boolean;
  sidebarCollapsed: boolean;
  treeWidth: number;
  denseTable: boolean;
  sortVarsAlphabetically: boolean;
  exportIncludeSecrets: boolean;
  showWelcome: boolean;
};

export type VaultData = {
  version: number;
  settings: AppSettings;
  workspaces: Workspace[];
  projects: Project[];
  folders: EnvFolder[];
  files: EnvFile[];
  vars: EnvVar[];
  revisions: Revision[];
};

export type VaultMeta = {
  createdAt: string;
  updatedAt: string;
  hint: string;
  deviceKey: boolean;
};

export type VaultStatus = {
  initialized: boolean;
  locked: boolean;
  vaultDir: string;
  vaultPath: string;
  hint: string;
  deviceKey: boolean;
  encryptionAvailable: boolean;
  bridgeRunning: boolean;
  bridgePort: number | null;
  cliInstalled: boolean;
  cliPath: string | null;
  appVersion: string;
  platform: NodeJS.Platform;
  autoLockMinutes: number;
  lastActivityAt: string | null;
};

export type TreeNodeKind = 'workspace' | 'project' | 'folder' | 'file';

export type TreeNode = {
  id: Id;
  kind: TreeNodeKind;
  name: string;
  tone: Tone;
  icon: string;
  path: string;
  parentId: Id | null;
  projectId: Id | null;
  workspaceId: Id | null;
  format: EnvFormat | null;
  varCount: number;
  secretCount: number;
  children: TreeNode[];
};

export type SearchHit = {
  varId: Id;
  fileId: Id;
  key: string;
  value: string;
  secret: boolean;
  type: VarType;
  path: string;
  workspaceId: Id;
  projectId: Id;
  matchedIn: 'key' | 'value' | 'note' | 'path';
};

export type DiffStatus = 'added' | 'removed' | 'changed' | 'same';

export type DiffRow = {
  key: string;
  status: DiffStatus;
  left: string | null;
  right: string | null;
  leftSecret: boolean;
  rightSecret: boolean;
};

export type ImportPreviewEntry = {
  key: string;
  value: string;
  type: VarType;
  secret: boolean;
  enabled: boolean;
  note: string;
  conflict: boolean;
  existingValue: string | null;
};

export type ImportPreview = {
  format: EnvFormat;
  entries: ImportPreviewEntry[];
  errors: string[];
};

export type ExportScope = {
  workspaceIds: Id[];
  projectIds: Id[];
  folderIds: Id[];
  fileIds: Id[];
};

export type ExportOptions = {
  scope: ExportScope;
  includeSecrets: boolean;
  includeHistory: boolean;
  format: EnvFormat | 'native';
  encrypt: boolean;
  password: string;
};

export type ArchiveManifest = {
  kind: 'fuse-archive';
  version: number;
  createdAt: string;
  app: string;
  appVersion: string;
  encrypted: boolean;
  includesSecrets: boolean;
  includesHistory: boolean;
  counts: {
    workspaces: number;
    projects: number;
    folders: number;
    files: number;
    vars: number;
  };
};

export type ImportMode = 'merge' | 'replace' | 'skip';

export type ImportArchiveResult = {
  workspaces: number;
  projects: number;
  folders: number;
  files: number;
  vars: number;
  skipped: number;
  overwritten: number;
};

export type CliInstallResult = {
  installed: boolean;
  path: string | null;
  message: string;
  needsPathEntry: string | null;
};

export type LinkedPathInfo = {
  path: string;
  projectId: Id | null;
  folderId: Id | null;
  fileId: Id | null;
  exists: boolean;
};

export type GeneratedSecretKind =
  'password' | 'hex' | 'base64' | 'uuid' | 'jwt-secret' | 'api-key' | 'pin';
