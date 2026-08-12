import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeftRight,
  CornerDownLeft,
  FileCode2,
  History,
  Lock,
  Package,
  Search,
  Settings,
  Terminal,
  Vault,
  KeyRound,
} from 'lucide-react';
import { searchVault } from '@shared/tree';
import { Kbd } from '@/components/ui';
import { truncateMiddle } from '@/lib/format';
import { useVault } from '@/lib/vault';

type Entry = {
  id: string;
  icon: JSX.Element;
  title: string;
  subtitle: string;
  group: string;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
  onLock,
}: {
  open: boolean;
  onClose: () => void;
  onLock: () => void;
}): JSX.Element | null {
  const navigate = useNavigate();
  const { data } = useVault();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      onClose();
    };

    const commands: Entry[] = [
      {
        id: 'nav-vault',
        icon: <Vault size={15} />,
        title: 'Open vault',
        subtitle: 'Browse workspaces, folders and files',
        group: 'Go to',
        run: go('/vault'),
      },
      {
        id: 'nav-projects',
        icon: <Package size={15} />,
        title: 'Projects',
        subtitle: 'Every project in this workspace',
        group: 'Go to',
        run: go('/projects'),
      },
      {
        id: 'nav-search',
        icon: <Search size={15} />,
        title: 'Search variables',
        subtitle: 'Search keys, values and notes',
        group: 'Go to',
        run: go('/search'),
      },
      {
        id: 'nav-history',
        icon: <History size={15} />,
        title: 'History',
        subtitle: 'Every change with diff and restore',
        group: 'Go to',
        run: go('/history'),
      },
      {
        id: 'nav-transfer',
        icon: <ArrowLeftRight size={15} />,
        title: 'Import and export',
        subtitle: 'Zip archives and single files',
        group: 'Go to',
        run: go('/transfer'),
      },
      {
        id: 'nav-cli',
        icon: <Terminal size={15} />,
        title: 'Command line',
        subtitle: 'Install and use the fuse CLI',
        group: 'Go to',
        run: go('/cli'),
      },
      {
        id: 'nav-settings',
        icon: <Settings size={15} />,
        title: 'Settings',
        subtitle: 'Security, appearance and storage',
        group: 'Go to',
        run: go('/settings'),
      },
      {
        id: 'cmd-lock',
        icon: <Lock size={15} />,
        title: 'Lock Fuse',
        subtitle: 'Close the vault right away',
        group: 'Actions',
        run: () => {
          onClose();
          onLock();
        },
      },
    ];

    const term = query.trim().toLowerCase();
    if (!term) {
      const recentFiles = data.files.slice(0, 6).map<Entry>((file) => ({
        id: `file-${file.id}`,
        icon: <FileCode2 size={15} />,
        title: file.name,
        subtitle: data.projects.find((p) => p.id === file.projectId)?.name ?? '',
        group: 'Files',
        run: () => {
          navigate(`/vault?file=${file.id}`);
          onClose();
        },
      }));
      return [...commands, ...recentFiles];
    }

    const matchedCommands = commands.filter(
      (c) => c.title.toLowerCase().includes(term) || c.subtitle.toLowerCase().includes(term),
    );

    const matchedFiles = data.files
      .filter((f) => f.name.toLowerCase().includes(term))
      .slice(0, 8)
      .map<Entry>((file) => ({
        id: `file-${file.id}`,
        icon: <FileCode2 size={15} />,
        title: file.name,
        subtitle: data.projects.find((p) => p.id === file.projectId)?.name ?? '',
        group: 'Files',
        run: () => {
          navigate(`/vault?file=${file.id}`);
          onClose();
        },
      }));

    const matchedVars = searchVault(data, term, 12).map<Entry>((hit) => ({
      id: `var-${hit.varId}`,
      icon: <KeyRound size={15} />,
      title: hit.key,
      subtitle: truncateMiddle(hit.path, 56),
      group: 'Variables',
      run: () => {
        navigate(`/vault?file=${hit.fileId}&var=${hit.varId}`);
        onClose();
      },
    }));

    return [...matchedCommands, ...matchedFiles, ...matchedVars];
  }, [query, data, navigate, onClose, onLock]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const groups = entries.reduce<Record<string, Entry[]>>((acc, entry) => {
    (acc[entry.group] ??= []).push(entry);
    return acc;
  }, {});

  let flatIndex = -1;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-950/40 p-4 pt-[12vh] animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-slate-900/5 animate-zoom-in-95 dark:bg-slate-900 dark:ring-slate-100/10"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, entries.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                entries[active]?.run();
              }
            }}
            placeholder="Search commands, files and variables…"
            className="h-14 w-full bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
          <Kbd keys={['Esc']} className="shrink-0" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {entries.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-400">Nothing matched</div>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group} className="mb-1">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {group}
                </div>
                {items.map((entry) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={entry.run}
                      className={clsx(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors',
                        index === active
                          ? 'bg-brand-50 text-brand-900 dark:bg-brand-950/50 dark:text-brand-100'
                          : 'text-slate-700 dark:text-slate-200',
                      )}
                    >
                      <span className="shrink-0 text-slate-400">{entry.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {entry.title}
                        </span>
                        {entry.subtitle && (
                          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {entry.subtitle}
                          </span>
                        )}
                      </span>
                      {index === active && (
                        <CornerDownLeft size={13} className="shrink-0 text-slate-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
