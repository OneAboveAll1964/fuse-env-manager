import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Download,
  Radio,
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
  PageHeader,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '@/components/ui';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';

const COMMANDS: Array<{ command: string; summary: string }> = [
  { command: 'fuse', summary: 'Interactive menu for everything below' },
  {
    command: 'fuse status',
    summary: 'Vault state, bridge state and what this folder is linked to',
  },
  { command: 'fuse unlock [--ttl 15m]', summary: 'Cache an unlocked session for this terminal' },
  { command: 'fuse lock', summary: 'Drop the cached session right away' },
  { command: 'fuse pull [path]', summary: 'Pick a file in the vault and write it here' },
  { command: 'fuse put', summary: 'Quick pull of a single file into the current folder' },
  { command: 'fuse push [file]', summary: 'Send a local env file into the vault' },
  { command: 'fuse sync', summary: 'Compare the local file with the vault and reconcile' },
  {
    command: 'fuse link / unlink',
    summary: 'Tie this folder to a project so pulls are one keypress',
  },
  { command: 'fuse ls [path]', summary: 'List workspaces, projects, folders and files' },
  { command: 'fuse get KEY', summary: 'Print one value' },
  { command: 'fuse set KEY=VALUE', summary: 'Set one or more variables' },
  { command: 'fuse unset KEY', summary: 'Remove variables' },
  { command: 'fuse cp / mv SRC DST', summary: 'Copy or move a whole env file' },
  { command: 'fuse rm PATH', summary: 'Delete a file, folder or project' },
  { command: 'fuse diff A B', summary: 'Compare two env files key by key' },
  { command: 'fuse run -- CMD', summary: 'Run a command with the variables injected' },
  { command: 'fuse search TERM', summary: 'Search keys, values and notes' },
  { command: 'fuse history [path]', summary: 'Show recent changes' },
  { command: 'fuse restore ID', summary: 'Put back a previous state' },
  { command: 'fuse export / import', summary: 'Zip archives from the terminal' },
  { command: 'fuse gen KIND', summary: 'Generate a password, key, token or UUID' },
  { command: 'fuse workspace|project|folder|file', summary: 'Manage the tree' },
  { command: 'fuse completion zsh', summary: 'Print a shell completion script' },
  { command: 'fuse doctor', summary: 'Check the install, the vault and the bridge' },
];

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

      <Card className="mt-5" padding="none" title="Every command">
        <Table>
          <THead>
            <TR>
              <TH className="w-72">Command</TH>
              <TH>What it does</TH>
            </TR>
          </THead>
          <TBody>
            {COMMANDS.map((row) => (
              <TR key={row.command}>
                <TD>
                  <span className="mono-value inline-flex items-center gap-1.5 text-[12px] text-slate-800 dark:text-slate-100">
                    <Terminal size={11} className="text-slate-400" />
                    {row.command}
                  </span>
                </TD>
                <TD className="text-[12.5px] text-slate-600 dark:text-slate-300">{row.summary}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
