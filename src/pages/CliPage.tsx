import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Download,
  Radio,
  Search,
  Terminal,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { CliInstallResult } from '@shared/types';
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  Input,
  PageHeader,
  Switch,
  useToast,
} from '@/components/ui';
import { COMMANDS, COMMAND_GROUPS, ENVIRONMENT_VARIABLES } from '@/lib/cli-docs';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';

export function CliPage(): JSX.Element {
  const toast = useToast();
  const { data, setData, status, refreshStatus } = useVault();
  const [cliStatus, setCliStatus] = useState<{
    installed: boolean;
    path: string | null;
    bundled: string | null;
  }>({ installed: false, path: null, bundled: null });
  const [bridge, setBridge] = useState<{
    running: boolean;
    port: number | null;
    tokenPath: string;
  }>({ running: false, port: null, tokenPath: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CliInstallResult | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>('pull');

  const refresh = async (): Promise<void> => {
    try {
      setCliStatus(await getBridge().cli.status());
      setBridge(await getBridge().cli.bridgeInfo());
      await refreshStatus();
    } catch (err) {
      toast.error('Could not read the CLI state', errorMessage(err));
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = async (): Promise<void> => {
    setBusy(true);
    try {
      const next = await getBridge().cli.install();
      setResult(next);
      await refresh();
      if (next.installed) toast.success('CLI installed', next.message);
      else toast.error('Could not install the CLI', next.message);
    } catch (err) {
      toast.error('Could not install the CLI', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const uninstall = async (): Promise<void> => {
    setBusy(true);
    try {
      const next = await getBridge().cli.uninstall();
      setResult(next);
      await refresh();
      toast.info(next.message);
    } catch (err) {
      toast.error('That did not work', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleBridge = async (enabled: boolean): Promise<void> => {
    try {
      await getBridge().cli.setBridgeEnabled(enabled);
      setData(await getBridge().vault.load());
      await refresh();
    } catch (err) {
      toast.error('That did not work', errorMessage(err));
    }
  };

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return COMMANDS;
    return COMMANDS.filter(
      (command) =>
        command.name.toLowerCase().includes(term) ||
        command.usage.toLowerCase().includes(term) ||
        command.summary.toLowerCase().includes(term) ||
        command.detail.toLowerCase().includes(term) ||
        command.examples.some((example) => example.code.toLowerCase().includes(term)),
    );
  }, [query]);

  return (
    <div className="h-full w-full overflow-y-auto p-6 lg:p-8">
      <PageHeader
        eyebrow="Command line"
        title="The fuse command"
        description="Pull and push env files straight from any project folder, on macOS and Windows."
        actions={
          cliStatus.installed ? (
            <Button
              variant="outline"
              iconLeft={<Trash2 size={15} />}
              loading={busy}
              onClick={() => void uninstall()}
            >
              Remove from PATH
            </Button>
          ) : (
            <Button iconLeft={<Download size={15} />} loading={busy} onClick={() => void install()}>
              Install the CLI
            </Button>
          )
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Install" description="Where the fuse command lives on this machine.">
          <div className="space-y-3 text-[13px]">
            <div className="flex items-start gap-2">
              {cliStatus.installed ? (
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
              ) : (
                <Circle size={15} className="mt-0.5 shrink-0 text-slate-300" />
              )}
              <div className="min-w-0">
                <div className="font-medium text-slate-800 dark:text-slate-100">
                  {cliStatus.installed ? 'Installed' : 'Not installed yet'}
                </div>
                {cliStatus.path && (
                  <div className="mono-value mt-0.5 break-all text-[11px] text-slate-500">
                    {cliStatus.path}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              {cliStatus.bundled ? (
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
              ) : (
                <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0">
                <div className="font-medium text-slate-800 dark:text-slate-100">
                  {cliStatus.bundled ? 'Bundled build found' : 'Bundled build missing'}
                </div>
                <div className="mono-value mt-0.5 break-all text-[11px] text-slate-500">
                  {cliStatus.bundled ?? 'Run yarn build:cli in the app repository'}
                </div>
              </div>
            </div>
            {result?.needsPathEntry && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                Add this folder to your PATH:
                <span className="mono-value mt-1 block break-all">{result.needsPathEntry}</span>
              </div>
            )}
          </div>
        </Card>

        <Card title="Live bridge" description="Lets the CLI use the app's unlocked session.">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Radio size={15} className={bridge.running ? 'text-emerald-500' : 'text-slate-300'} />
              <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
                {bridge.running ? 'Running' : 'Stopped'}
              </span>
              {bridge.port && <Badge variant="success">127.0.0.1:{bridge.port}</Badge>}
            </div>
            <Switch
              checked={data.settings.bridgeEnabled}
              onChange={(next) => void toggleBridge(next)}
              size="sm"
              label="Allow the CLI to use this session"
              description="Loopback only, protected by a token file that only your account can read. With it off, the CLI asks for the master password itself."
            />
            {bridge.tokenPath && (
              <div className="mono-value break-all text-[11px] text-slate-400">
                {bridge.tokenPath}
              </div>
            )}
          </div>
        </Card>

        <Card title="Vault" description="Where the CLI reads from when the app is closed.">
          <div className="space-y-2 text-[13px]">
            <div className="text-slate-600 dark:text-slate-300">Vault folder</div>
            <div className="mono-value break-all text-[11px] text-slate-500">{status.vaultDir}</div>
            <div className="pt-2 text-slate-600 dark:text-slate-300">Override with</div>
            <div className="mono-value text-[11px] text-slate-500">
              FUSE_HOME=/some/other/folder
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5" title="Getting started" padding="md">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CodeBlock
            title="Pull an env file into the folder you are in"
            code={['cd ~/code/my-new-service', 'fuse pull'].join('\n')}
          />
          <CodeBlock
            title="Send a local .env into the vault"
            code={['cd ~/code/my-service', 'fuse push .env'].join('\n')}
          />
          <CodeBlock
            title="Link this folder once, then pull with no questions"
            code={['fuse link', 'fuse pull --yes'].join('\n')}
          />
          <CodeBlock
            title="Run a command with the variables injected"
            code={'fuse run --file "Acme Studio/Storefront API/production/.env" -- node server.js'}
          />
        </div>
      </Card>

      <Card
        className="mt-5"
        padding="none"
        title="Every command"
        description="Click one to see what it does and how it is used."
        actions={
          <div className="w-56">
            <Input
              size="sm"
              value={query}
              placeholder="Filter commands…"
              leading={<Search size={13} />}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        }
      >
        {matches.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">
            No command matched “{query}”
          </div>
        ) : (
          COMMAND_GROUPS.map((group) => {
            const inGroup = matches.filter((command) => command.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group}>
                <div className="border-b border-slate-100 bg-slate-50 px-6 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  {group}
                </div>
                {inGroup.map((command) => {
                  const expanded = open === command.name;
                  return (
                    <div
                      key={command.name}
                      className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                    >
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : command.name)}
                        aria-expanded={expanded}
                        className={clsx(
                          'flex w-full items-center gap-3 px-6 py-3 text-start transition-colors',
                          expanded
                            ? 'bg-brand-50/50 dark:bg-brand-950/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
                        )}
                      >
                        <ChevronRight
                          size={13}
                          className={clsx(
                            'shrink-0 text-slate-400 transition-transform',
                            expanded && 'rotate-90',
                          )}
                        />
                        <span className="mono-value flex w-64 shrink-0 items-center gap-1.5 text-[12.5px] text-slate-800 dark:text-slate-100">
                          <Terminal size={11} className="shrink-0 text-slate-400" />
                          {command.usage}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-600 dark:text-slate-300">
                          {command.summary}
                        </span>
                        <Badge variant="neutral" className="shrink-0">
                          {command.examples.length} example
                          {command.examples.length === 1 ? '' : 's'}
                        </Badge>
                      </button>

                      {expanded && (
                        <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 px-6 py-5 dark:border-slate-800 dark:bg-slate-800/20">
                          <p className="max-w-3xl text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                            {command.detail}
                          </p>

                          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                            {command.examples.map((example) => (
                              <div key={example.title}>
                                <CodeBlock title={example.title} code={example.code} />
                                {example.note && (
                                  <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    {example.note}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>

                          {command.flags && command.flags.length > 0 && (
                            <div>
                              <div className="label-eyebrow mb-2">Options</div>
                              <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2">
                                {command.flags.map(([flag, meaning]) => (
                                  <div key={flag} className="flex gap-3 text-[12px]">
                                    <span className="mono-value w-32 shrink-0 text-brand-700 dark:text-brand-300">
                                      {flag}
                                    </span>
                                    <span className="text-slate-600 dark:text-slate-400">
                                      {meaning}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </Card>

      <Card className="mt-5" title="Environment" description="Recognised by every command.">
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
          {ENVIRONMENT_VARIABLES.map(([name, meaning]) => (
            <div key={name} className="flex gap-3 text-[12.5px]">
              <span className="mono-value w-52 shrink-0 text-accent-700 dark:text-accent-300">
                {name}
              </span>
              <span className="text-slate-600 dark:text-slate-400">{meaning}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
