import { RouterProvider } from 'react-router-dom';
import { AlertOctagon } from 'lucide-react';
import { LockScreen } from '@/components/LockScreen';
import { SetupScreen } from '@/components/SetupScreen';
import { Spinner } from '@/components/ui';
import { I18nProvider } from '@/i18n';
import { router } from '@/router';
import { useVault } from '@/lib/vault';

export function App(): JSX.Element {
  const { status, data, ready, error } = useVault();

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertOctagon size={20} />
          </div>
          <h1 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Fuse could not start
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={22} />
      </div>
    );
  }

  return (
    <I18nProvider code={data.settings.language}>
      {!status.initialized ? (
        <SetupScreen />
      ) : status.locked ? (
        <LockScreen />
      ) : (
        <RouterProvider router={router} />
      )}
    </I18nProvider>
  );
}
