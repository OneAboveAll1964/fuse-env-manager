import type { ReactNode } from 'react';
import clsx from 'clsx';

export type TabItem<T extends string> = {
  key: T;
  label: ReactNode;
  count?: number;
};

export function Tabs<T extends string>({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  active: T;
  onChange: (key: T) => void;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-800',
        className,
      )}
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          className={clsx(
            '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
            active === it.key
              ? 'border-brand-600 font-semibold text-slate-900 dark:text-slate-100'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span
              className={clsx(
                'rounded-full px-1.5 py-0.5 text-xs font-medium',
                active === it.key
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
              )}
            >
              {it.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
