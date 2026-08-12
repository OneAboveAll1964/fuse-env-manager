import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success' | 'accent';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500/40 disabled:bg-brand-300 dark:disabled:bg-brand-900/40 dark:disabled:text-brand-300/60',
  secondary:
    'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-500/40 disabled:bg-slate-300 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-500',
  ghost:
    'bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-300 disabled:text-slate-400 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:text-slate-500',
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500/40 disabled:bg-rose-300 dark:disabled:bg-rose-900/40 dark:disabled:text-rose-300/60',
  outline:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-300 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500/40 disabled:bg-emerald-300 dark:disabled:bg-emerald-900/40',
  accent:
    'bg-accent-500 text-white hover:bg-accent-600 focus-visible:ring-accent-500/40 disabled:bg-accent-300 dark:disabled:bg-accent-900/40',
};

const SIZES: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs gap-1',
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-[15px] gap-2',
  xl: 'h-14 px-7 text-base gap-2.5',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    iconLeft,
    iconRight,
    fullWidth,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center rounded-xl font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-0',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'xl' ? 18 : 14} className="animate-spin" /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
});
