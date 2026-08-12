import {
  ArrowUpRight,
  BookOpen,
  Bug,
  Github,
  Heart,
  Package,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { AppMark } from '@/components/AppMark';
import { getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';

const GITHUB_USER = 'https://github.com/OneAboveAll1964';
const APP_REPO = `${GITHUB_USER}/fuse-env-manager`;
const CLI_REPO = `${GITHUB_USER}/fuse-env-manager-cli`;

type Link = {
  key: string;
  icon: JSX.Element;
  title: string;
  detail: string;
  href: string;
};

const LINKS: Link[] = [
  {
    key: 'app',
    icon: <Github size={16} />,
    title: 'fuse-env-manager',
    detail: 'The desktop app, its source and its releases',
    href: APP_REPO,
  },
  {
    key: 'cli',
    icon: <Terminal size={16} />,
    title: 'fuse-env-manager-cli',
    detail: 'The fuse command on its own, publishable to npm',
    href: CLI_REPO,
  },
  {
    key: 'readme',
    icon: <BookOpen size={16} />,
    title: 'Documentation',
    detail: 'How everything fits together, and how the vault is encrypted',
    href: `${APP_REPO}#readme`,
  },
  {
    key: 'issues',
    icon: <Bug size={16} />,
    title: 'Report a problem',
    detail: 'Something not behaving? Open an issue',
    href: `${APP_REPO}/issues`,
  },
  {
    key: 'author',
    icon: <Heart size={16} />,
    title: 'OneAboveAll1964',
    detail: 'Everything else I have built',
    href: GITHUB_USER,
  },
];

export function AboutPage(): JSX.Element {
  const { status, data } = useVault();

  const open = (href: string): void => {
    void getBridge().system.openExternal(href);
  };

  return (
    <div className="h-full w-full overflow-y-auto p-6 lg:p-8">
      <PageHeader
        eyebrow="About"
        title="Fuse"
        description="Encrypted environment variables, everywhere you work."
      />

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-1" padding="lg">
          <div className="flex flex-col items-center text-center">
            <AppMark size={64} />
            <h2 className="mt-4 font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Fuse
            </h2>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge variant="brand">{status.appVersion || '1.0.0'}</Badge>
              <Badge variant="neutral">{status.platform}</Badge>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              Workspaces keep your clients apart, folders keep your environments apart, and one
              encrypted file on this machine holds the lot.
            </p>
            <Button
              className="mt-5"
              variant="outline"
              size="sm"
              iconLeft={<Github size={14} />}
              iconRight={<ArrowUpRight size={13} />}
              onClick={() => open(APP_REPO)}
            >
              View on GitHub
            </Button>
          </div>
        </Card>

        <div className="space-y-5 xl:col-span-2">
          <Card title="Links" description="Everything lives on GitHub." padding="none">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {LINKS.map((link) => (
                <button
                  key={link.key}
                  type="button"
                  onClick={() => open(link.href)}
                  className="flex w-full items-center gap-3 px-6 py-3.5 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {link.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                      {link.title}
                    </span>
                    <span className="block truncate text-[12px] text-slate-500 dark:text-slate-400">
                      {link.detail}
                    </span>
                  </span>
                  <ArrowUpRight size={14} className="shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card title="Security" description="How your data is kept.">
              <div className="space-y-3 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                  <span>
                    AES-256-GCM with a key derived from your master password through scrypt. The
                    password is never written to disk.
                  </span>
                </div>
                <div className="mono-value break-all text-[11px] text-slate-400">
                  {status.vaultPath}
                </div>
              </div>
            </Card>

            <Card title="In this vault" description="What you have stored.">
              <div className="grid grid-cols-2 gap-2 text-[12.5px]">
                {[
                  ['Workspaces', data.workspaces.length],
                  ['Projects', data.projects.length],
                  ['Env files', data.files.length],
                  ['Variables', data.vars.length],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-baseline gap-2">
                    <span className="display-num text-lg font-semibold text-slate-800 dark:text-slate-100">
                      {value}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">{label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card title="Licence" description="MIT with an attribution clause.">
            <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">
              You are free to use, change and redistribute Fuse, including in your own products, as
              long as you credit the original author somewhere a user or reader can find it.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
              <Package size={13} />
              Made by
              <button
                type="button"
                onClick={() => open(GITHUB_USER)}
                className="font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
              >
                OneAboveAll1964
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
