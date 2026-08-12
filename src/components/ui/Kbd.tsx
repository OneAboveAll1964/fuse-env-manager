import clsx from 'clsx';

export function Kbd({ keys, className }: { keys: string[]; className?: string }): JSX.Element {
  return (
    <span className={clsx('inline-flex items-center gap-1', className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-slate-200 bg-slate-50 px-1.5 font-mono text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
