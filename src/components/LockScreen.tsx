import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Fingerprint, Lock, ShieldCheck } from 'lucide-react';
import { Button, Input, Switch } from '@/components/ui';
import { AppMark } from '@/components/AppMark';
import { WindowControls } from '@/components/WindowControls';
import { ThemeToggle } from '@/components/ThemeToggle';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';
import { useT } from '@/i18n';

export function LockScreen(): JSX.Element {
  const t = useT();
  const { status, refreshStatus, reload, autoLocked, clearAutoLocked } = useVault();
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(status.deviceKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, []);

  const finish = async (): Promise<void> => {
    clearAutoLocked();
    await refreshStatus();
    await reload();
  };

  const unlock = async (): Promise<void> => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getBridge().vault.unlock({ password, rememberOnDevice: remember });
      if (!result.ok) {
        setError(result.error ?? t('lock.wrongPassword'));
        setPassword('');
        return;
      }
      await finish();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const unlockWithDevice = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await getBridge().vault.unlockWithDevice();
      if (!result.ok) {
        setError(result.error ?? 'This device could not unlock the vault');
        return;
      }
      await finish();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface dark:bg-slate-950">
      <div className="app-drag flex h-12 shrink-0 items-stretch border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <WindowControls />
        <div className="flex flex-1 items-center px-3">
          <span className="pointer-events-none text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {t('app.name')}
          </span>
        </div>
        <div className="app-no-drag flex items-stretch border-s border-slate-200 dark:border-slate-800">
          <ThemeToggle />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center text-center">
            <AppMark size={56} />
            <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {t('lock.title')}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {t('lock.subtitle')}
            </p>
          </div>

          {autoLocked && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <Lock size={14} className="mt-0.5 shrink-0" />
              <span>{t('lock.lockedAutomatically')}</span>
            </div>
          )}

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <Input
              ref={inputRef}
              type={reveal ? 'text' : 'password'}
              label={t('lock.password')}
              value={password}
              autoComplete="current-password"
              size="lg"
              onChange={(e) => setPassword(e.target.value)}
              error={error}
              leading={<Lock size={15} />}
              trailing={
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  aria-label={reveal ? t('common.hide') : t('common.reveal')}
                  className="rounded p-1 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />

            {status.hint && (
              <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[12px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  {t('lock.hint')}:{' '}
                </span>
                {status.hint}
              </div>
            )}

            {status.encryptionAvailable && !status.deviceKey && (
              <Switch
                checked={remember}
                onChange={setRemember}
                size="sm"
                label={t('setup.remember')}
                description={t('setup.rememberHelp')}
              />
            )}

            <Button type="submit" size="lg" fullWidth loading={busy} disabled={!password}>
              {t('lock.unlock')}
            </Button>

            {status.deviceKey && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                fullWidth
                disabled={busy}
                iconLeft={<Fingerprint size={16} />}
                onClick={() => void unlockWithDevice()}
              >
                {t('lock.useDevice')}
              </Button>
            )}
          </form>

          <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <ShieldCheck size={12} />
            <span>AES-256-GCM, key derived with scrypt</span>
          </div>
        </div>
      </div>
    </div>
  );
}
