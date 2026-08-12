import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  Info,
  EyeOff,
  FolderOpen,
  Fingerprint,
  KeyRound,
  Lock,
  Palette,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { passwordStrength } from '@shared/password';
import { FORMATS, FORMAT_LABELS } from '@shared/env-types';
import { LANGUAGES } from '@/i18n';
import type { AppSettings, EnvFormat, QuoteMode, ThemeMode } from '@shared/types';
import {
  Button,
  Card,
  Input,
  Meter,
  Modal,
  PageHeader,
  SegmentedControl,
  Select,
  Switch,
  Tabs,
  useConfirm,
  useToast,
} from '@/components/ui';
import {
  ClipboardPreview,
  FormatPreview,
  LockPreview,
  PreviewFrame,
  RowsPreview,
  ThemePreview,
} from '@/components/settings/Previews';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useTheme } from '@/lib/theme';
import { useVault } from '@/lib/vault';

type Section = 'security' | 'appearance' | 'editor' | 'history' | 'storage';

export function SettingsPage(): JSX.Element {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, setData, status, refreshStatus } = useVault();
  const { theme, effective, setTheme } = useTheme();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('security');
  const [draft, setDraft] = useState<AppSettings>(data.settings);
  const [saving, setSaving] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmNext, setConfirmNext] = useState('');
  const [hint, setHint] = useState(status.hint);
  const [reveal, setReveal] = useState(false);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    setDraft(data.settings);
  }, [data.settings]);

  useEffect(() => {
    setHint(status.hint);
  }, [status.hint]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);

  const patch = (values: Partial<AppSettings>): void =>
    setDraft((prev) => ({ ...prev, ...values }));

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      setData(await getBridge().settings.save(draft));
      await refreshStatus();
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Could not save', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (): Promise<void> => {
    if (next.length < 8) {
      toast.warning('Use at least 8 characters');
      return;
    }
    if (next !== confirmNext) {
      toast.warning('The two new passwords do not match');
      return;
    }
    setChanging(true);
    try {
      const result = await getBridge().vault.changePassword({
        currentPassword: current,
        nextPassword: next,
        hint: hint.trim(),
      });
      if (!result.ok) {
        toast.error('Could not change the password', result.error ?? 'Check the current password');
        return;
      }
      await refreshStatus();
      setPasswordOpen(false);
      setCurrent('');
      setNext('');
      setConfirmNext('');
      toast.success('Master password changed');
    } catch (err) {
      toast.error('Could not change the password', errorMessage(err));
    } finally {
      setChanging(false);
    }
  };

  const forgetDevice = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Forget this device?',
      description: 'You will have to type your master password every time Fuse and the CLI unlock.',
      confirmText: 'Forget',
    });
    if (!ok) return;
    try {
      await getBridge().vault.forgetDevice();
      await refreshStatus();
      toast.success('This device no longer holds the key');
    } catch (err) {
      toast.error('That did not work', errorMessage(err));
    }
  };

  const rememberDevice = async (): Promise<void> => {
    try {
      await getBridge().vault.rememberOnDevice();
      await refreshStatus();
      toast.success('This device can now unlock without the password');
    } catch (err) {
      toast.error('That did not work', errorMessage(err));
    }
  };

  const strength = passwordStrength(next);

  return (
    <div className="h-full w-full overflow-y-auto p-6 lg:p-8">
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Security, appearance and how Fuse behaves."
        actions={
          <Button
            iconLeft={<Save size={15} />}
            loading={saving}
            disabled={!dirty}
            onClick={() => void save()}
          >
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
        }
      />

      <Tabs
        className="mt-6"
        active={section}
        onChange={setSection}
        items={[
          { key: 'security', label: 'Security' },
          { key: 'appearance', label: 'Appearance' },
          { key: 'editor', label: 'Editor' },
          { key: 'history', label: 'History' },
          { key: 'storage', label: 'Storage' },
        ]}
      />

      {section === 'security' && (
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card
            title="Master password"
            description="The root of trust for everything in the vault."
          >
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-3.5 py-3 dark:border-slate-800">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                <div className="text-[12.5px] text-slate-600 dark:text-slate-300">
                  AES-256-GCM with a key derived through scrypt. The password is never written to
                  disk.
                </div>
              </div>
              {status.hint && (
                <div className="text-[12px] text-slate-500 dark:text-slate-400">
                  Current hint: <span className="font-medium">{status.hint}</span>
                </div>
              )}
              <Button
                variant="outline"
                iconLeft={<KeyRound size={15} />}
                onClick={() => setPasswordOpen(true)}
              >
                Change master password
              </Button>
            </div>
          </Card>

          <Card title="This device" description="Unlock without typing the password every time.">
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-3.5 py-3 dark:border-slate-800">
                <Fingerprint size={16} className="mt-0.5 shrink-0 text-brand-500" />
                <div className="text-[12.5px] text-slate-600 dark:text-slate-300">
                  {status.deviceKey
                    ? 'The key is stored in this system keychain, so Fuse and the CLI can unlock silently.'
                    : status.encryptionAvailable
                      ? 'Store the key in the system keychain to skip the password on this device.'
                      : 'This device has no secure key store, so the password is always required.'}
                </div>
              </div>
              {status.encryptionAvailable &&
                (status.deviceKey ? (
                  <Button
                    variant="outline"
                    iconLeft={<Trash2 size={15} />}
                    onClick={() => void forgetDevice()}
                  >
                    Forget this device
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    iconLeft={<Fingerprint size={15} />}
                    onClick={() => void rememberDevice()}
                  >
                    Remember this device
                  </Button>
                ))}
            </div>
          </Card>

          <Card title="Automatic locking" description="When Fuse should close the vault by itself.">
            <div className="space-y-4">
              <Select
                label="Lock after inactivity"
                value={String(draft.autoLockMinutes)}
                onChange={(value) => patch({ autoLockMinutes: Number(value) })}
                options={[
                  { value: '0', label: 'Never' },
                  { value: '1', label: '1 minute' },
                  { value: '5', label: '5 minutes' },
                  { value: '15', label: '15 minutes' },
                  { value: '30', label: '30 minutes' },
                  { value: '60', label: '1 hour' },
                  { value: '240', label: '4 hours' },
                ]}
              />
              <PreviewFrame label="What that means">
                <LockPreview minutes={draft.autoLockMinutes} />
              </PreviewFrame>
              <Switch
                checked={draft.lockOnSleep}
                onChange={(v) => patch({ lockOnSleep: v })}
                size="sm"
                label="Lock when the computer sleeps or the screen locks"
              />
              <Switch
                checked={draft.lockOnMinimize}
                onChange={(v) => patch({ lockOnMinimize: v })}
                size="sm"
                label="Lock when the window is minimised"
              />
              <Switch
                checked={draft.lockOnBlur}
                onChange={(v) => patch({ lockOnBlur: v })}
                size="sm"
                label="Lock whenever Fuse loses focus"
                description="Strictest option. Fuse locks as soon as you click another app."
              />
            </div>
          </Card>

          <Card title="Secrets" description="How secret values behave in the app.">
            <div className="space-y-4">
              <Switch
                checked={draft.maskSecrets}
                onChange={(v) => patch({ maskSecrets: v })}
                size="sm"
                label="Mask secret values in lists"
                description="Reveal them one at a time with the eye button."
              />
              <PreviewFrame label="How a secret looks">
                <RowsPreview dense={draft.denseTable} maskSecrets={draft.maskSecrets} />
              </PreviewFrame>
              <Select
                label="Clear the clipboard after"
                value={String(draft.clipboardClearSeconds)}
                onChange={(value) => patch({ clipboardClearSeconds: Number(value) })}
                options={[
                  { value: '0', label: 'Never' },
                  { value: '10', label: '10 seconds' },
                  { value: '30', label: '30 seconds' },
                  { value: '60', label: '1 minute' },
                  { value: '120', label: '2 minutes' },
                ]}
              />
              <PreviewFrame label="What that means">
                <ClipboardPreview seconds={draft.clipboardClearSeconds} />
              </PreviewFrame>
              <Switch
                checked={draft.exportIncludeSecrets}
                onChange={(v) => patch({ exportIncludeSecrets: v })}
                size="sm"
                label="Include secrets in quick exports by default"
              />
              <Switch
                checked={draft.confirmDestructive}
                onChange={(v) => patch({ confirmDestructive: v })}
                size="sm"
                label="Ask before deleting anything"
              />
            </div>
          </Card>
        </div>
      )}

      {section === 'appearance' && (
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card title="Theme" description="Fuse follows your system by default.">
            <div className="space-y-4">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Appearance
                </span>
                <ThemePreview
                  value={theme}
                  systemIsDark={effective === 'dark'}
                  onSelect={(value: ThemeMode) => {
                    setTheme(value);
                    patch({ theme: value });
                  }}
                />
              </div>
              <Switch
                checked={draft.denseTable}
                onChange={(v) => patch({ denseTable: v })}
                size="sm"
                label="Compact rows"
                description="Fit more variables on screen."
              />
              <PreviewFrame label="Rows">
                <RowsPreview dense={draft.denseTable} maskSecrets={draft.maskSecrets} />
              </PreviewFrame>
              <Switch
                checked={draft.sidebarCollapsed}
                onChange={(v) => patch({ sidebarCollapsed: v })}
                size="sm"
                label="Start with the sidebar collapsed"
              />
            </div>
          </Card>

          <Card title="Language" description="More languages can be added later.">
            <div className="space-y-4">
              <Select
                label="Interface language"
                value={draft.language}
                onChange={(value) => patch({ language: value })}
                options={LANGUAGES.map((l) => ({
                  value: l.code,
                  label: l.label,
                  sublabel: l.nativeLabel,
                }))}
              />
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-3.5 py-3 text-[12.5px] text-slate-600 dark:border-slate-800 dark:text-slate-300">
                <Palette size={16} className="mt-0.5 shrink-0 text-slate-400" />
                English is the only language shipped today. The wiring for right to left layouts and
                extra dictionaries is already in place.
              </div>
            </div>
          </Card>
        </div>
      )}

      {section === 'editor' && (
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card title="New files" description="Defaults applied when you create an env file.">
            <div className="space-y-4">
              <Select
                label="Default format"
                value={draft.defaultFormat}
                onChange={(value: EnvFormat) => patch({ defaultFormat: value })}
                searchable
                options={FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
              />
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Quoting when writing .env files
                </span>
                <SegmentedControl
                  fullWidth
                  value={draft.quoteMode}
                  onChange={(value: QuoteMode) => patch({ quoteMode: value })}
                  items={[
                    { value: 'auto', label: 'Only when needed' },
                    { value: 'always', label: 'Always quote' },
                    { value: 'never', label: 'Never quote' },
                  ]}
                />
              </div>
              <Switch
                checked={draft.sortVarsAlphabetically}
                onChange={(v) => patch({ sortVarsAlphabetically: v })}
                size="sm"
                label="Sort variables alphabetically"
                description="Otherwise they keep the order you added them in."
              />
              <PreviewFrame label="A file rendered with these settings">
                <FormatPreview
                  format={draft.defaultFormat}
                  quoteMode={draft.quoteMode}
                  sorted={draft.sortVarsAlphabetically}
                />
              </PreviewFrame>
            </div>
          </Card>

          <Card title="Command line" description="How the CLI is allowed to reach the vault.">
            <div className="space-y-4">
              <Switch
                checked={draft.bridgeEnabled}
                onChange={(v) => patch({ bridgeEnabled: v })}
                size="sm"
                label="Run the local bridge while the app is open"
                description="The CLI can then use the unlocked session instead of asking for the password."
              />
              <Switch
                checked={draft.cliRequireConfirm}
                onChange={(v) => patch({ cliRequireConfirm: v })}
                size="sm"
                label="Always confirm writes made from the CLI"
                description="The CLI asks before it overwrites anything, even with --yes."
              />
            </div>
          </Card>
        </div>
      )}

      {section === 'history' && (
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card
            title="Change history"
            description="Fuse keeps the previous value of everything you edit."
          >
            <div className="space-y-4">
              <Switch
                checked={draft.historyEnabled}
                onChange={(v) => patch({ historyEnabled: v })}
                size="sm"
                label="Record changes"
                description="Turning this off means nothing can be restored."
              />
              <Select
                label="Keep entries for"
                value={String(draft.historyRetentionDays)}
                onChange={(value) => patch({ historyRetentionDays: Number(value) })}
                options={[
                  { value: '0', label: 'Forever' },
                  { value: '30', label: '30 days' },
                  { value: '90', label: '90 days' },
                  { value: '180', label: '180 days' },
                  { value: '365', label: '1 year' },
                ]}
              />
              <Select
                label="Maximum entries"
                value={String(draft.historyMaxEntries)}
                onChange={(value) => patch({ historyMaxEntries: Number(value) })}
                options={[
                  { value: '0', label: 'No limit' },
                  { value: '1000', label: '1,000' },
                  { value: '5000', label: '5,000' },
                  { value: '20000', label: '20,000' },
                ]}
              />
              <div className="text-[12px] text-slate-500 dark:text-slate-400">
                {data.revisions.length.toLocaleString()} entries recorded so far.
              </div>
            </div>
          </Card>

          <Card title="Welcome" description="Small touches.">
            <Switch
              checked={draft.showWelcome}
              onChange={(v) => patch({ showWelcome: v })}
              size="sm"
              label="Show tips on empty pages"
              description="Short hints about what to do next."
            />
          </Card>
        </div>
      )}

      {section === 'storage' && (
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card title="Where things live" description="One encrypted file holds the whole vault.">
            <div className="space-y-3 text-[12.5px]">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Vault folder</div>
                <div className="mono-value mt-0.5 break-all text-slate-700 dark:text-slate-200">
                  {status.vaultDir}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Vault file</div>
                <div className="mono-value mt-0.5 break-all text-slate-700 dark:text-slate-200">
                  {status.vaultPath}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                iconLeft={<FolderOpen size={14} />}
                onClick={() => void getBridge().system.revealPath(status.vaultPath)}
              >
                Show in file manager
              </Button>
            </div>
          </Card>

          <Card title="What is inside" description="Counts across every workspace.">
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              {[
                ['Workspaces', data.workspaces.length],
                ['Projects', data.projects.length],
                ['Folders', data.folders.length],
                ['Env files', data.files.length],
                ['Variables', data.vars.length],
                ['Secrets', data.vars.filter((v) => v.secret).length],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-slate-200 px-3.5 py-2.5 dark:border-slate-800"
                >
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
                  <div className="display-num mt-0.5 text-xl font-semibold text-slate-800 dark:text-slate-100">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="About" description="Version, links and licence.">
            <div className="flex items-center gap-3">
              <Sparkles size={16} className="text-brand-500" />
              <div className="text-[13px] text-slate-600 dark:text-slate-300">
                Fuse {status.appVersion} on {status.platform}
              </div>
            </div>
            <Button
              className="mt-4"
              variant="outline"
              size="sm"
              iconLeft={<Info size={14} />}
              onClick={() => navigate('/about')}
            >
              Open the about page
            </Button>
          </Card>
        </div>
      )}

      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        size="md"
        eyebrow="Security"
        title="Change master password"
        description="Everything is re-wrapped with the new password. The vault contents stay exactly as they are."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasswordOpen(false)}>
              Cancel
            </Button>
            <Button loading={changing} onClick={() => void changePassword()}>
              Change password
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            type={reveal ? 'text' : 'password'}
            label="Current password"
            value={current}
            leading={<Lock size={15} />}
            onChange={(e) => setCurrent(e.target.value)}
            trailing={
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? 'Hide' : 'Reveal'}
                className="rounded p-1 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
              >
                {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            }
          />
          <div>
            <Input
              type={reveal ? 'text' : 'password'}
              label="New password"
              value={next}
              leading={<Lock size={15} />}
              onChange={(e) => setNext(e.target.value)}
            />
            {next.length > 0 && (
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
            label="Confirm new password"
            value={confirmNext}
            leading={<Lock size={15} />}
            error={
              confirmNext && confirmNext !== next ? 'The two passwords do not match' : undefined
            }
            onChange={(e) => setConfirmNext(e.target.value)}
          />
          <Input
            label="Password hint"
            value={hint}
            hint="Shown on the lock screen. Never put the password itself here."
            onChange={(e) => setHint(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
