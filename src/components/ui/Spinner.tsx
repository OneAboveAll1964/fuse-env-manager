import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

export function Spinner({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}): JSX.Element {
  return (
    <Loader2
      size={size}
      className={clsx('animate-spin text-slate-400 dark:text-slate-500', className)}
    />
  );
}
