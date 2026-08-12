import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'accent' | 'ink';

const TONES: Record<Tone, { gradient: string; sub: string }> = {
  brand: {
    gradient: 'from-brand-600 via-brand-700 to-brand-800',
    sub: 'text-brand-100',
  },
  success: {
    gradient: 'from-emerald-600 via-emerald-700 to-emerald-800',
    sub: 'text-emerald-100',
  },
  warning: {
    gradient: 'from-amber-500 via-amber-600 to-amber-700',
    sub: 'text-amber-50',
  },
  danger: {
    gradient: 'from-rose-600 via-rose-700 to-rose-800',
    sub: 'text-rose-100',
  },
  accent: {
    gradient: 'from-accent-500 via-accent-600 to-accent-700',
    sub: 'text-accent-50',
  },
  ink: {
    gradient: 'from-slate-800 via-slate-900 to-slate-950',
    sub: 'text-slate-300',
  },
};

export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'ink',
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
}): JSX.Element {
  const tones = TONES[tone];
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-2xl bg-gradient-to-br p-5',
        tones.gradient,
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/70">
          {label}
        </div>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white">
            <Icon size={16} />
          </div>
        )}
      </div>
      <div className="display-num mt-3 text-3xl font-semibold leading-none text-white">{value}</div>
      {sub && <div className={clsx('mt-2 text-xs', tones.sub)}>{sub}</div>}
    </div>
  );
}
