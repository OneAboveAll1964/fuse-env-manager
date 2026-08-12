import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        {icon ?? <Inbox size={20} />}
      </div>
      <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {description && (
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
