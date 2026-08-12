import type { ReactNode } from 'react';
import clsx from 'clsx';

export type SegmentItem<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  title?: string;
};

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  size = 'md',
  className,
  fullWidth,
}: {
  items: SegmentItem<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  fullWidth?: boolean;
}): JSX.Element {
  return (
    <div
      className={clsx(
        'inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-900',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            title={item.title}
            onClick={() => onChange(item.value)}
            className={clsx(
              'inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-9 px-3 text-[13px]',
              fullWidth && 'flex-1',
              active
                ? 'bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
