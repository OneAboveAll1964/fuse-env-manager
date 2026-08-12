import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, rows = 3, ...rest },
  ref,
) {
  const id = rest.id ?? rest.name ?? undefined;
  return (
    <label htmlFor={id} className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
          {label}
        </span>
      )}
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        className={clsx(
          'block w-full rounded-xl border bg-white px-3.5 py-3 text-[14px] text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:ring-4 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800',
          error
            ? 'border-rose-300 focus:border-rose-400 dark:border-rose-900'
            : 'border-slate-200 focus:border-brand-500 dark:border-slate-800',
          className,
        )}
        {...rest}
      />
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
