import { useMemo, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, Eye, KeyRound } from 'lucide-react';
import { serialize } from '@shared/codecs';
import type { EnvFormat, QuoteMode, ThemeMode } from '@shared/types';
import { maskValue } from '@/lib/format';

export function PreviewFrame({
  label = 'Preview',
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={clsx(
        'overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/30',
        className,
      )}
    >
      <div className="border-b border-slate-200/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:border-slate-800">
        {label}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

const THEME_LABELS: Record<ThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

function MiniWindow({ dark }: { dark: boolean }): JSX.Element {
  return (
    <div
      className={clsx(
        'flex h-[72px] overflow-hidden rounded-lg border',
        dark ? 'border-slate-700 bg-[#061423]' : 'border-slate-200 bg-[#f6f9fc]',
      )}
    >
      <div
        className={clsx(
          'flex w-[26px] shrink-0 flex-col gap-1 border-e p-1.5',
          dark ? 'border-slate-700 bg-[#0e1f33]' : 'border-slate-200 bg-white',
        )}
      >
        <span className="block h-1.5 w-1.5 rounded-full bg-brand-600" />
        <span
          className={clsx('block h-1 w-full rounded', dark ? 'bg-slate-700' : 'bg-slate-200')}
        />
        <span
          className={clsx('block h-1 w-full rounded', dark ? 'bg-slate-700' : 'bg-slate-200')}
        />
        <span className={clsx('block h-1 w-3/4 rounded', dark ? 'bg-slate-700' : 'bg-slate-200')} />
      </div>
      <div className="flex-1 space-y-1 p-1.5">
        <span className={clsx('block h-1 w-10 rounded', dark ? 'bg-slate-700' : 'bg-slate-300')} />
        <span className="flex items-center gap-1">
          <span className="block h-1 w-6 rounded bg-accent-500" />
          <span className={clsx('block h-1 w-8 rounded', dark ? 'bg-slate-800' : 'bg-slate-200')} />
        </span>
        <span className="flex items-center gap-1">
          <span className={clsx('block h-1 w-5 rounded', dark ? 'bg-slate-700' : 'bg-slate-300')} />
          <span
            className={clsx('block h-1 w-12 rounded', dark ? 'bg-slate-800' : 'bg-slate-200')}
          />
        </span>
        <span className="flex items-center gap-1">
          <span className={clsx('block h-1 w-7 rounded', dark ? 'bg-slate-700' : 'bg-slate-300')} />
          <span className={clsx('block h-1 w-6 rounded', dark ? 'bg-slate-800' : 'bg-slate-200')} />
        </span>
      </div>
    </div>
  );
}

export function ThemePreview({
  value,
  systemIsDark,
  onSelect,
}: {
  value: ThemeMode;
  systemIsDark: boolean;
  onSelect: (mode: ThemeMode) => void;
}): JSX.Element {
  const modes: ThemeMode[] = ['light', 'dark', 'system'];
  return (
    <div className="grid grid-cols-3 gap-2">
      {modes.map((mode) => {
        const active = value === mode;
        const dark = mode === 'dark' || (mode === 'system' && systemIsDark);
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onSelect(mode)}
            className={clsx(
              'rounded-xl border p-1.5 text-start transition-colors',
              active
                ? 'border-brand-500 ring-2 ring-brand-500/25'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600',
            )}
          >
            <MiniWindow dark={dark} />
            <span className="mt-1.5 flex items-center gap-1 px-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              {active && <Check size={11} className="text-brand-600" />}
              {THEME_LABELS[mode]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const SAMPLE_ROWS: Array<{ key: string; value: string; secret: boolean }> = [
  { key: 'NODE_ENV', value: 'production', secret: false },
  { key: 'DATABASE_URL', value: 'postgres://acme@db.internal:5432/app', secret: false },
  { key: 'JWT_SECRET', value: 'sk_live_9f2b7c41d8e35a6079bc', secret: true },
];

export function RowsPreview({
  dense,
  maskSecrets,
}: {
  dense: boolean;
  maskSecrets: boolean;
}): JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {SAMPLE_ROWS.map((row, index) => (
        <div
          key={row.key}
          className={clsx(
            'flex items-center gap-2 px-3',
            dense ? 'py-1' : 'py-2.5',
            index > 0 && 'border-t border-slate-100 dark:border-slate-800',
          )}
        >
          {row.secret && (
            <KeyRound size={10} className="shrink-0 text-accent-600 dark:text-accent-400" />
          )}
          <span className="mono-value w-28 shrink-0 truncate text-[11px] font-medium text-slate-800 dark:text-slate-100">
            {row.key}
          </span>
          <span className="mono-value min-w-0 flex-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {row.secret && maskSecrets ? maskValue(row.value) : row.value}
          </span>
          {row.secret && maskSecrets && <Eye size={11} className="shrink-0 text-slate-400" />}
        </div>
      ))}
    </div>
  );
}

export function FormatPreview({
  format,
  quoteMode,
  sorted,
}: {
  format: EnvFormat;
  quoteMode: QuoteMode;
  sorted: boolean;
}): JSX.Element {
  const text = useMemo(() => {
    const entries = [
      {
        key: 'PORT',
        value: '8080',
        note: 'The port the server binds to',
        enabled: true,
        secret: false,
      },
      { key: 'APP_NAME', value: 'Acme Storefront', note: '', enabled: true, secret: false },
      {
        key: 'DATABASE_URL',
        value: 'postgres://acme@db.internal:5432/app',
        note: '',
        enabled: true,
        secret: false,
      },
      { key: 'DEBUG', value: 'false', note: '', enabled: false, secret: false },
    ];
    const ordered = sorted ? [...entries].sort((a, b) => a.key.localeCompare(b.key)) : entries;
    try {
      return serialize(ordered, format, { quoteMode, resourceName: 'acme-storefront' }).trimEnd();
    } catch {
      return '';
    }
  }, [format, quoteMode, sorted]);

  return (
    <pre className="max-h-52 overflow-auto rounded-lg bg-slate-950 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-200">
      {text}
    </pre>
  );
}

export function LockPreview({ minutes }: { minutes: number }): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
        <KeyRound size={13} />
      </span>
      <span className="min-w-0 text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300">
        {minutes === 0
          ? 'Fuse stays open until you lock it yourself or quit.'
          : `Leave Fuse alone for ${minutes === 60 ? 'an hour' : minutes >= 60 ? `${minutes / 60} hours` : `${minutes} minute${minutes === 1 ? '' : 's'}`} and it locks, asking for the master password again.`}
      </span>
    </div>
  );
}

export function ClipboardPreview({ seconds }: { seconds: number }): JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      {seconds === 0
        ? 'A copied value stays on the clipboard until something else replaces it.'
        : `Copy a value and it is wiped from the clipboard ${seconds} seconds later, if nothing else has replaced it by then.`}
    </div>
  );
}
