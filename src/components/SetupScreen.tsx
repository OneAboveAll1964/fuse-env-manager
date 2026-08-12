import { useMemo, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { passwordStrength } from '@shared/password';
import { Button, Input, Meter, Switch } from '@/components/ui';
import { AppMark } from '@/components/AppMark';
import { WindowControls } from '@/components/WindowControls';
import { ThemeToggle } from '@/components/ThemeToggle';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';
import { useT } from '@/i18n';

export function SetupScreen(): JSX.Element {
  const t = useT();
  const { status, refreshStatus, reload } = useVault();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hint, setHint] = useState('');
  const [remember, setRemember] = useState(true);
  const [sample, setSample] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const mismatch = confirm.length > 0 && confirm !== password;
  const tooShort = password.length > 0 && password.length < 8;
  const canSubmit = password.length >= 8 && password === confirm && !busy;

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await getBridge().vault.create({
        password,
        hint: hint.trim(),
        rememberOnDevice: remember && status.encryptionAvailable,
        sample,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await refreshStatus();
      await reload();
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
        <div className="w-full max-w-md py-6">
          <div className="flex flex-col items-center text-center">
            <AppMark size={56} />
            <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {t('setup.title')}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {t('setup.subtitle')}
            </p>
          </div>

          <form
            className="mt-7 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) void create();
            }}
          >
            <div>
              <Input
                type={reveal ? 'text' : 'password'}
                label={t('setup.password')}
                value={password}
                size="lg"
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                error={tooShort ? t('setup.tooShort') : undefined}
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
              {password.length > 0 && (
                <Meter
                  className="mt-2"
                  score={strength.score}
                  label={strength.label}
                  hint={strength.suggestions[0]}
                />
              )}
            </div>

            <Input
              type={reveal ? 'text' : 'password'}
              label={t('setup.confirm')}
              value={confirm}
              size="lg"
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              error={mismatch ? t('setup.mismatch') : undefined}
              leading={<Lock size={15} />}
            />

            <Input
              label={t('setup.hintLabel')}
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              hint={t('setup.hintHelp')}
              maxLength={120}
            />

            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <Switch
                checked={remember && status.encryptionAvailable}
                onChange={setRemember}
                disabled={!status.encryptionAvailable}
                size="sm"
                label={t('setup.remember')}
                description={
                  status.encryptionAvailable
                    ? t('setup.rememberHelp')
                    : 'This device has no secure key store available.'
                }
              />
              <Switch
                checked={sample}
                onChange={setSample}
                size="sm"
                label={t('setup.sample')}
                description={t('setup.sampleHelp')}
              />
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{t('setup.warning')}</span>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" fullWidth loading={busy} disabled={!canSubmit}>
              {t('setup.create')}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <ShieldCheck size={12} />
            <span>Stored at {status.vaultDir || 'your application data folder'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
