import type { ReactNode } from 'react';
import clsx from 'clsx';

export type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
};

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  size = 'md',
  className,
}: SwitchProps): JSX.Element {
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knob = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5';
  const travel = size === 'sm' ? 'translate-x-4' : 'translate-x-5';

  return (
    <label
      className={clsx(
        'flex items-start gap-3',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-default',
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={clsx(
          'relative mt-0.5 inline-flex shrink-0 items-center rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25',
          track,
          checked ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700',
        )}
      >
        <span
          className={clsx(
            'ms-0.5 inline-block rounded-full bg-white transition-transform',
            knob,
            size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5',
            checked ? travel : 'translate-x-0',
          )}
        />
      </button>
      {(label || description) && (
        <span className="min-w-0 flex-1">
          {label && (
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
              {label}
            </span>
          )}
          {description && (
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}
