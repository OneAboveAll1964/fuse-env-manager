import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { emptyVault } from '@shared/defaults';
import { buildTree, filePath, varsOf } from '@shared/tree';
import type {
  EnvFile,
  EnvFolder,
  EnvVar,
  Id,
  Project,
  TreeNode,
  VaultData,
  VaultStatus,
  Workspace,
} from '@shared/types';
import { getBridge, hasBridge } from '@/lib/bridge';

const EMPTY_STATUS: VaultStatus = {
  initialized: false,
  locked: true,
  vaultDir: '',
  vaultPath: '',
  hint: '',
  deviceKey: false,
  encryptionAvailable: false,
  bridgeRunning: false,
  bridgePort: null,
  cliInstalled: false,
  cliPath: null,
  appVersion: '',
  platform: 'darwin',
  autoLockMinutes: 0,
  lastActivityAt: null,
};

type VaultContextValue = {
  status: VaultStatus;
  data: VaultData;
  ready: boolean;
  error: string | null;
  autoLocked: boolean;
  clearAutoLocked: () => void;
  setData: (next: VaultData) => void;
  refreshStatus: () => Promise<VaultStatus>;
  reload: () => Promise<void>;
  workspaceById: (id: Id | null | undefined) => Workspace | undefined;
  projectById: (id: Id | null | undefined) => Project | undefined;
  folderById: (id: Id | null | undefined) => EnvFolder | undefined;
  fileById: (id: Id | null | undefined) => EnvFile | undefined;
  varById: (id: Id | null | undefined) => EnvVar | undefined;
  varsFor: (fileId: Id) => EnvVar[];
  pathFor: (fileId: Id) => string;
  activeWorkspace: Workspace | null;
  tree: TreeNode[];
  allTree: TreeNode[];
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<VaultStatus>(EMPTY_STATUS);
  const [data, setData] = useState<VaultData>(() => emptyVault());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLocked, setAutoLocked] = useState(false);
  const touchRef = useRef(0);

  const refreshStatus = useCallback(async (): Promise<VaultStatus> => {
    const next = await getBridge().vault.status();
    setStatus(next);
    return next;
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    const next = await getBridge().vault.load();
    setData(next);
  }, []);

  useEffect(() => {
    if (!hasBridge()) {
      setError('The desktop bridge is unavailable. Restart the app.');
      setReady(true);
      return;
    }
    void (async () => {
      try {
        const next = await refreshStatus();
        if (!next.locked) await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setReady(true);
      }
    })();
  }, [refreshStatus, reload]);

  useEffect(() => {
    if (!hasBridge()) return undefined;
    const bridge = getBridge();
    const offLocked = bridge.vault.onLocked(() => {
      setAutoLocked(true);
      setData(emptyVault());
      void refreshStatus();
    });
    const offChanged = bridge.vault.onChanged((next) => setData(next));
    return () => {
      offLocked();
      offChanged();
    };
  }, [refreshStatus]);

  useEffect(() => {
    if (!hasBridge() || status.locked) return undefined;
    const ping = (): void => {
      const now = Date.now();
      if (now - touchRef.current < 20_000) return;
      touchRef.current = now;
      void getBridge().vault.touch();
    };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'wheel', 'focus'];
    events.forEach((event) => window.addEventListener(event, ping, { passive: true }));
    return () => events.forEach((event) => window.removeEventListener(event, ping));
  }, [status.locked]);

  const tree = useMemo(() => buildTree(data, data.settings.activeWorkspaceId), [data]);
  const allTree = useMemo(() => buildTree(data, null), [data]);

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      data,
      ready,
      error,
      autoLocked,
      clearAutoLocked: () => setAutoLocked(false),
      setData,
      refreshStatus,
      reload,
      workspaceById: (id) => data.workspaces.find((w) => w.id === id),
      projectById: (id) => data.projects.find((p) => p.id === id),
      folderById: (id) => data.folders.find((f) => f.id === id),
      fileById: (id) => data.files.find((f) => f.id === id),
      varById: (id) => data.vars.find((v) => v.id === id),
      varsFor: (fileId) => varsOf(data, fileId),
      pathFor: (fileId) => filePath(data, fileId),
      activeWorkspace:
        data.workspaces.find((w) => w.id === data.settings.activeWorkspaceId) ??
        data.workspaces[0] ??
        null,
      tree,
      allTree,
    }),
    [status, data, ready, error, autoLocked, refreshStatus, reload, tree, allTree],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used inside VaultProvider');
  return ctx;
}
