import { useCallback, useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Lock, Search } from 'lucide-react';
import { Kbd, useToast } from '@/components/ui';
import { CommandPalette } from '@/components/CommandPalette';
import { Sider } from '@/components/Sider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WindowControls } from '@/components/WindowControls';
import { WorkspaceDialog } from '@/components/dialogs/WorkspaceDialog';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';
import { useT } from '@/i18n';

export function AppLayout(): JSX.Element {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, setData, refreshStatus, activeWorkspace } = useVault();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [workspaceDialog, setWorkspaceDialog] = useState(false);
  const collapsed = data.settings.sidebarCollapsed;

  const lock = useCallback(async (): Promise<void> => {
    await getBridge().vault.lock();
    await refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (meta && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        void lock();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lock]);

  const toggleCollapsed = async (): Promise<void> => {
    try {
      const next = await getBridge().settings.save({
        ...data.settings,
        sidebarCollapsed: !collapsed,
      });
      setData(next);
    } catch (err) {
      toast.error('Could not save the sidebar state', errorMessage(err));
    }
  };

  const selectWorkspace = async (id: string): Promise<void> => {
    try {
      const next = await getBridge().settings.save({ ...data.settings, activeWorkspaceId: id });
      setData(next);
      navigate('/vault');
    } catch (err) {
      toast.error('Could not switch workspace', errorMessage(err));
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface dark:bg-slate-950">
      <div className="app-drag flex h-12 shrink-0 select-none items-stretch border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <WindowControls />

        <div className="flex flex-1 items-center justify-center px-4">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="app-no-drag flex h-8 w-full max-w-md items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-start text-[12px] text-slate-400 transition-colors hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-500 dark:hover:border-slate-700"
          >
            <Search size={13} className="shrink-0" />
            <span className="flex-1 truncate">
              {activeWorkspace ? `Search ${activeWorkspace.name}…` : 'Search…'}
            </span>
            <Kbd keys={['⌘', 'K']} className="shrink-0" />
          </button>
        </div>

        <div className="flex items-stretch">
          <div className="app-no-drag hidden items-center gap-3 border-s border-slate-200 px-3 text-[11px] text-slate-500 lg:flex dark:border-slate-800 dark:text-slate-400">
            <span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {data.projects.length}
              </span>{' '}
              projects
            </span>
            <span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {data.files.length}
              </span>{' '}
              files
            </span>
            <span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {data.vars.length}
              </span>{' '}
              variables
            </span>
          </div>
          <div className="app-no-drag flex h-full items-stretch border-s border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => void lock()}
              title={`${t('nav.lock')} (⌘⇧L)`}
              aria-label={t('nav.lock')}
              className="inline-flex h-full w-11 items-center justify-center text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <Lock size={13} />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <Sider
          collapsed={collapsed}
          onToggleCollapsed={() => void toggleCollapsed()}
          onLock={() => void lock()}
          onNewWorkspace={() => setWorkspaceDialog(true)}
          onSelectWorkspace={(id) => void selectWorkspace(id)}
        />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onLock={() => void lock()}
      />

      <WorkspaceDialog
        open={workspaceDialog}
        workspace={null}
        onClose={() => setWorkspaceDialog(false)}
      />
    </div>
  );
}
