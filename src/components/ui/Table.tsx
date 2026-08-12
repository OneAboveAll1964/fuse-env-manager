import type {
  HTMLAttributes,
  TableHTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
} from 'react';
import clsx from 'clsx';

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>): JSX.Element {
  return <table className={clsx('w-full text-sm', className)} {...props} />;
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return (
    <thead
      {...props}
      className={clsx(
        'bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-800/50 dark:text-slate-400',
        props.className,
      )}
    />
  );
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return (
    <tbody
      {...props}
      className={clsx('divide-y divide-slate-100 dark:divide-slate-800', props.className)}
    />
  );
}

export function TR({
  clickable,
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { clickable?: boolean }): JSX.Element {
  return (
    <tr
      {...props}
      className={clsx(
        'transition-colors',
        clickable && 'cursor-pointer hover:bg-brand-50/40 dark:hover:bg-slate-800/60',
        className,
      )}
    />
  );
}

export function TH({
  className,
  align,
  ...props
}: Omit<ThHTMLAttributes<HTMLTableCellElement>, 'align'> & {
  align?: 'start' | 'end' | 'center';
}): JSX.Element {
  return (
    <th
      {...props}
      className={clsx(
        'px-5 py-3 first:ps-6 last:pe-6',
        align === 'end' && 'text-end',
        align === 'center' && 'text-center',
        className,
      )}
    />
  );
}

export function TD({
  className,
  align,
  ...props
}: Omit<TdHTMLAttributes<HTMLTableCellElement>, 'align'> & {
  align?: 'start' | 'end' | 'center';
}): JSX.Element {
  return (
    <td
      {...props}
      className={clsx(
        'px-5 py-3.5 first:ps-6 last:pe-6',
        align === 'end' && 'text-end',
        align === 'center' && 'text-center',
        className,
      )}
    />
  );
}
