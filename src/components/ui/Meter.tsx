import clsx from 'clsx';

const BARS = [0, 1, 2, 3];

const COLORS = [
  'bg-rose-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-emerald-600',
] as const;

export function Meter({
  score,
  label,
  hint,
  className,
}: {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  hint?: string;
  className?: string;
}): JSX.Element {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        {BARS.map((index) => (
          <span
            key={index}
            className={clsx(
              'h-1 flex-1 rounded-full transition-colors',
              index < score ? COLORS[score] : 'bg-slate-200 dark:bg-slate-800',
            )}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={clsx(
            'text-xs font-medium',
            score >= 3
              ? 'text-emerald-600 dark:text-emerald-400'
              : score === 2
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-rose-600 dark:text-rose-400',
          )}
        >
          {label}
        </span>
        {hint && <span className="truncate text-[11px] text-slate-500">{hint}</span>}
      </div>
    </div>
  );
}
