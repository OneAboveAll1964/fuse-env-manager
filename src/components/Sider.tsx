import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeftRight,
  ChevronsLeft,
  ChevronsRight,
  Check,
  History,
  KeyRound,
  Lock,
  Package,
  Plus,
  Search,
  Settings,
  Terminal,
  Vault,
  type LucideIcon,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { AppMark } from '@/components/AppMark';
import { PopoverPanel } from '@/components/ui';
import { TONE_CLASSES, pluralise } from '@/lib/format';
import { iconByName } from '@/lib/icons';
import { useVault } from '@/lib/vault';
import { useT } from '@/i18n';

type NavItem = { to: string; icon: LucideIcon; labelKey: string; badge?: number };

export function Sider({
  collapsed,
  onToggleCollapsed,
  onLock,
  onNewWorkspace,
  onSelectWorkspace,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onLock: () => void;
  onNewWorkspace: () => void;
  onSelectWorkspace: (id: string) => void;
}): JSX.Element {
  const t = useT();
  const { data, activeWorkspace } = useVault();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLButtonElement | null>(null);

  const items: NavItem[] = [
    { to: '/vault', icon: Vault, labelKey: 'nav.vault' },
    { to: '/projects', icon: Package, labelKey: 'nav.projects', badge: data.projects.length },
    { to: '/search', icon: Search, labelKey: 'nav.search' },
    { to: '/history', icon: History, labelKey: 'nav.history', badge: data.revisions.length },
    { to: '/transfer', icon: ArrowLeftRight, labelKey: 'nav.transfer' },
    { to: '/cli', icon: Terminal, labelKey: 'nav.cli' },
    { to: '/settings', icon: Settings, labelKey: 'nav.settings' },
  ];

  const workspaceProjects = data.projects.filter(
    (p) => p.workspaceId === activeWorkspace?.id,
  ).length;
  const workspaceTone = activeWorkspace ? TONE_CLASSES[activeWorkspace.tone] : TONE_CLASSES.slate;
  const WorkspaceIcon = iconByName(activeWorkspace?.icon ?? 'Building2');

  return (
    <aside
      className={clsx(
        'flex h-full shrink-0 flex-col border-e border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900',
        collapsed ? 'w-[68px]' : 'w-[248px]',
      )}
    >
      <div
        className={clsx(
          'flex shrink-0 items-center gap-2.5 border-b border-slate-100 px-3 py-3 dark:border-slate-800',
          collapsed && 'justify-center px-0',
        )}
      >
        <AppMark size={26} />
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-display text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              {t('app.name')}
            </div>
            <div className="truncate text-[9px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              {t('app.tagline')}
            </div>
          </div>
        )}
      </div>

      <div className={clsx('shrink-0 px-2.5 py-3', collapsed && 'px-2')}>
        <button
          ref={pickerRef}
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          title={activeWorkspace?.name ?? 'Workspaces'}
          className={clsx(
            'flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-start transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/60 dark:hover:border-slate-700',
            collapsed && 'justify-center px-0 py-2',
          )}
        >
          <span
            className={clsx(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white',
              workspaceTone.bar,
            )}
          >
            <WorkspaceIcon size={14} />
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                {activeWorkspace?.name ?? 'No workspace'}
              </span>
              <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
                {pluralise(workspaceProjects, 'project')}
              </span>
            </span>
          )}
        </button>

        <PopoverPanel
          open={pickerOpen}
          triggerRef={pickerRef}
          onRequestClose={() => setPickerOpen(false)}
          matchWidth={!collapsed}
          minWidth={232}
          maxWidth={300}
          maxHeight={400}
        >
          <ul className="max-h-[320px] overflow-y-auto p-1.5">
            {data.workspaces.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-slate-400">No workspaces yet</li>
            )}
            {data.workspaces.map((workspace) => {
              const Icon = iconByName(workspace.icon, Package);
              const tone = TONE_CLASSES[workspace.tone];
              const active = workspace.id === activeWorkspace?.id;
              return (
                <li key={workspace.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectWorkspace(workspace.id);
                      setPickerOpen(false);
                    }}
                    className={clsx(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] transition-colors',
                      active
                        ? 'bg-brand-50 text-brand-800 dark:bg-brand-950/50 dark:text-brand-200'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800',
                    )}
                  >
                    <span
                      className={clsx(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white',
                        tone.bar,
                      )}
                    >
                      <Icon size={12} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                    {active && <Check size={13} className="shrink-0 text-brand-600" />}
                  </button>
                </li>
              );
            })}
            <li>
              <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  onNewWorkspace();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-400 dark:border-slate-600">
                  <Plus size={12} />
                </span>
                New workspace
              </button>
            </li>
          </ul>
        </PopoverPanel>
      </div>

      <nav
        className={clsx(
          'min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-3',
          collapsed && 'px-2',
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? t(item.labelKey) : undefined}
              className={({ isActive }) =>
                clsx(
                  'flex select-none items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-brand-100 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-1 dark:ring-inset dark:ring-brand-500/30'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                )
              }
            >
              <Icon size={15} className="shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{t(item.labelKey)}</span>}
              {!collapsed && item.badge !== undefined && item.badge > 0 && (
                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {item.badge > 999 ? '999+' : item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div
        className={clsx(
          'shrink-0 space-y-1 border-t border-slate-100 px-2.5 py-2.5 dark:border-slate-800',
          collapsed && 'px-2',
        )}
      >
        <button
          type="button"
          onClick={onLock}
          title={t('nav.lock')}
          className={clsx(
            'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
            collapsed && 'justify-center px-0',
          )}
        >
          <Lock size={15} className="shrink-0" />
          {!collapsed && <span className="flex-1 text-start">{t('nav.lock')}</span>}
          {!collapsed && <KeyRound size={12} className="shrink-0 opacity-40" />}
        </button>
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          className={clsx(
            'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-100',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? (
            <ChevronsRight size={15} className="shrink-0" />
          ) : (
            <ChevronsLeft size={15} className="shrink-0" />
          )}
          {!collapsed && <span className="flex-1 text-start">{t('nav.collapse')}</span>}
        </button>
      </div>
    </aside>
  );
}
