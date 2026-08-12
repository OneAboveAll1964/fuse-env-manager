import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

export type CardProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  bodyClassName?: string;
};

const PAD: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-7',
};

export function Card({
  title,
  description,
  actions,
  padding = 'md',
  className,
  bodyClassName,
  children,
  ...rest
}: CardProps): JSX.Element {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
      {...rest}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="min-w-0">
            {title && (
              <h3 className="font-display text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={clsx(PAD[padding], bodyClassName)}>{children}</div>
    </div>
  );
}
