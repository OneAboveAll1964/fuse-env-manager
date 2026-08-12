import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

type Variant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent';

const VARIANTS: Record<Variant, string> = {
  neutral:
    'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
  success:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900',
  warning:
    'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900',
  danger:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900',
  info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-900',
  brand:
    'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-800',
  accent:
    'bg-accent-50 text-accent-800 ring-accent-200 dark:bg-accent-950/50 dark:text-accent-300 dark:ring-accent-800',
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: Variant;
  icon?: ReactNode;
};

export function Badge({
  variant = 'neutral',
  icon,
  className,
  children,
  ...rest
}: BadgeProps): JSX.Element {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}
