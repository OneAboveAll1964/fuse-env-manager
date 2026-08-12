import { useRouteError } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

export function RouteErrorElement(): JSX.Element {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="max-w-lg text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle size={20} />
        </div>
        <h1 className="mt-4 font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
          This page could not be shown
        </h1>
        <p className="mt-2 break-words text-sm text-slate-500 dark:text-slate-400">{message}</p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}
