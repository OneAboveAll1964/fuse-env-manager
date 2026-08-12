import type { AppSettings, Tone, VaultData } from './types';

export const VAULT_VERSION = 1;

export const TONES: Tone[] = [
  'brand',
  'accent',
  'emerald',
  'amber',
  'rose',
  'violet',
  'sky',
  'teal',
  'fuchsia',
  'slate',
];

export const TONE_HEX: Record<Tone, string> = {
  brand: '#1c5288',
  accent: '#06a79e',
  emerald: '#059669',
  amber: '#d97706',
  rose: '#e11d48',
  violet: '#7c3aed',
  sky: '#0284c7',
  teal: '#0d9488',
  fuchsia: '#c026d3',
  slate: '#4a6076',
};

export const WORKSPACE_ICONS = [
  'Building2',
  'Briefcase',
  'Rocket',
  'Globe',
  'Layers',
  'Boxes',
  'Landmark',
  'Flame',
  'Home',
  'Users',
];

export const PROJECT_ICONS = [
  'Package',
  'Server',
  'Smartphone',
  'Monitor',
  'Database',
  'Cloud',
  'Cpu',
  'Code2',
  'Terminal',
  'Bot',
  'ShoppingCart',
  'Wallet',
];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'en',
  activeWorkspaceId: null,
  autoLockMinutes: 15,
  lockOnBlur: false,
  lockOnSleep: true,
  lockOnMinimize: false,
  maskSecrets: true,
  clipboardClearSeconds: 30,
  historyEnabled: true,
  historyRetentionDays: 180,
  historyMaxEntries: 5000,
  bridgeEnabled: true,
  cliRequireConfirm: false,
  defaultFormat: 'dotenv',
  quoteMode: 'auto',
  confirmDestructive: true,
  sidebarCollapsed: false,
  treeWidth: 300,
  denseTable: false,
  sortVarsAlphabetically: false,
  exportIncludeSecrets: true,
  showWelcome: true,
};

export function emptyVault(): VaultData {
  return {
    version: VAULT_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    workspaces: [],
    projects: [],
    folders: [],
    files: [],
    vars: [],
    revisions: [],
  };
}

export const STARTER_FOLDERS = ['development', 'staging', 'production'];
