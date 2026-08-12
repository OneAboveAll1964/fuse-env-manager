import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leading, trailing, size = 'md', className, ...rest },
  ref,
) {
  const id = rest.id ?? rest.name ?? undefined;
  const heightClass =
    size === 'lg' ? 'h-12 text-[15px]' : size === 'sm' ? 'h-9 text-[13px]' : 'h-11 text-[14px]';
  return (
    <label htmlFor={id} className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
          {label}
        </span>
      )}
      <span
        className={clsx(
          'flex w-full items-center rounded-xl border bg-white transition-all dark:bg-slate-900',
          'focus-within:ring-4 focus-within:ring-brand-500/15',
          error
            ? 'border-rose-300 focus-within:border-rose-400 dark:border-rose-900'
            : 'border-slate-200 focus-within:border-brand-500 dark:border-slate-800',
          heightClass,
        )}
      >
        {leading && <span className="ps-3.5 text-slate-400 dark:text-slate-500">{leading}</span>}
        <input
          ref={ref}
          id={id}
          className={clsx(
            'block h-full w-full bg-transparent px-3.5 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:text-slate-500',
            className,
          )}
          {...rest}
        />
        {trailing && <span className="pe-3.5 text-slate-400 dark:text-slate-500">{trailing}</span>}
      </span>
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-rose-600 dark:text-rose-300">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
});
