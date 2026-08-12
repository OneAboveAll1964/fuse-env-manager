import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowLeftRight,
  Copy,
  FileCode2,
  FolderTree,
  History as HistoryIcon,
  KeyRound,
  Package,
  Plus,
  RotateCcw,
  Trash2,
  Building2,
} from 'lucide-react';
import type { ChangeKind, EntityKind, Revision } from '@shared/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SegmentedControl,
  useConfirm,
  useToast,
} from '@/components/ui';
import { errorMessage, getBridge } from '@/lib/bridge';
import { formatDateTime, formatRelative, truncateMiddle } from '@/lib/format';
import { useVault } from '@/lib/vault';

type Snapshot = {
  workspaces?: Array<{ id: string; name: string }>;
  projects?: Array<{ id: string; name: string }>;
  folders?: Array<{ id: string; name: string }>;
  files?: Array<{ id: string; name: string }>;
  vars?: Array<{ id: string; key: string; value: string; secret: boolean; enabled: boolean }>;
};

const KIND_TONE: Record<
  ChangeKind,
  'success' | 'warning' | 'danger' | 'brand' | 'neutral' | 'info'
> = {
  create: 'success',
  update: 'brand',
  delete: 'danger',
  rename: 'info',
  move: 'info',
  duplicate: 'neutral',
  import: 'warning',
  restore: 'success',
  reorder: 'neutral',
};

const ENTITY_ICON: Record<EntityKind, JSX.Element> = {
  workspace: <Building2 size={13} />,
  project: <Package size={13} />,
  folder: <FolderTree size={13} />,
  file: <FileCode2 size={13} />,
  variable: <KeyRound size={13} />,
};

function parse(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

function summarise(snapshot: Snapshot | null): string {
  if (!snapshot) return '—';
  const parts: string[] = [];
  if (snapshot.workspaces?.length) parts.push(`${snapshot.workspaces.length} workspaces`);
  if (snapshot.projects?.length) parts.push(`${snapshot.projects.length} projects`);
  if (snapshot.folders?.length) parts.push(`${snapshot.folders.length} folders`);
  if (snapshot.files?.length) parts.push(`${snapshot.files.length} files`);
  if (snapshot.vars?.length) parts.push(`${snapshot.vars.length} variables`);
  return parts.join(', ') || '—';
}

export function HistoryPage(): JSX.Element {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, setData } = useVault();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'app' | 'cli'>('all');
  const [detail, setDetail] = useState<Revision | null>(null);
  const [busy, setBusy] = useState(false);

  const revisions = useMemo(() => {
    const term = query.trim().toLowerCase();
    return data.revisions.filter((revision) => {
      if (scope !== 'all' && revision.source !== scope) return false;
      if (!term) return true;
      return (
        revision.label.toLowerCase().includes(term) ||
        revision.path.toLowerCase().includes(term) ||
        revision.kind.includes(term)
      );
    });
  }, [data.revisions, query, scope]);

  const restore = async (revision: Revision): Promise<void> => {
    const ok = await confirm({
      title: `Restore ${revision.label}?`,
      description: `This puts back the state from ${formatDateTime(revision.at)}. The current state is recorded so you can undo the restore.`,
      confirmText: 'Restore',
    });
    if (!ok) return;
    setBusy(true);
    try {
      setData(await getBridge().history.restore(revision.id));
      setDetail(null);
      toast.success('Restored', `${revision.label} is back to how it was.`);
    } catch (err) {
      toast.error('Could not restore', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Clear the whole history?',
      description:
        'Every recorded change and every stored previous value is removed. This cannot be undone.',
      confirmText: 'Clear history',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      setData(await getBridge().history.clear());
      toast.success('History cleared');
    } catch (err) {
      toast.error('That did not work', errorMessage(err));
    }
  };

  const before = parse(detail?.before ?? null);
  const after = parse(detail?.after ?? null);

  const diffRows = useMemo(() => {
    const keys = new Set<string>([
      ...(before?.vars ?? []).map((v) => v.key),
      ...(after?.vars ?? []).map((v) => v.key),
    ]);
    return [...keys].sort().map((key) => ({
      key,
      before: before?.vars?.find((v) => v.key === key) ?? null,
      after: after?.vars?.find((v) => v.key === key) ?? null,
    }));
  }, [before, after]);

  return (
    <div className="h-full w-full overflow-y-auto p-6 lg:p-8">
      <PageHeader
        eyebrow="History"
        title="Change history"
        description="Every create, edit and delete, with the previous value kept so you can put it back."
        actions={
          <Button
            variant="outline"
            iconLeft={<Trash2 size={15} />}
            disabled={data.revisions.length === 0}
            onClick={() => void clear()}
          >
            Clear history
          </Button>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <Input
            size="sm"
            value={query}
            placeholder="Filter by name, path or kind…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <SegmentedControl
          size="sm"
          value={scope}
          onChange={setScope}
          items={[
            { value: 'all', label: 'Everything' },
            { value: 'app', label: 'From the app' },
            { value: 'cli', label: 'From the CLI' },
          ]}
        />
        <span className="text-[11px] text-slate-400">
          Keeping{' '}
          {data.settings.historyRetentionDays > 0
            ? `${data.settings.historyRetentionDays} days`
            : 'everything'}
          {data.settings.historyMaxEntries > 0
            ? `, up to ${data.settings.historyMaxEntries} entries`
            : ''}
        </span>
      </div>

      {revisions.length === 0 ? (
        <Card className="mt-5" padding="none">
          <EmptyState
            icon={<HistoryIcon size={20} />}
            title={data.revisions.length === 0 ? 'No history yet' : 'Nothing matched'}
            description={
              data.revisions.length === 0
                ? 'Changes you make appear here with their previous values.'
                : 'Try a different filter.'
            }
          />
        </Card>
      ) : (
        <div className="mt-5 space-y-1.5">
          {revisions.map((revision) => (
            <button
              key={revision.id}
              type="button"
              onClick={() => setDetail(revision)}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-start transition-colors hover:border-brand-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-800"
            >
              <span
                className={clsx(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                )}
              >
                {ENTITY_ICON[revision.entity]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                    {revision.label || revision.entity}
                  </span>
                  <Badge variant={KIND_TONE[revision.kind]}>{revision.kind}</Badge>
                  {revision.source !== 'app' && <Badge variant="neutral">{revision.source}</Badge>}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {truncateMiddle(revision.path, 78)}
                </span>
              </span>
              <span className="shrink-0 text-[11px] text-slate-400">
                {formatRelative(revision.at)}
              </span>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        size="xl"
        eyebrow={detail ? `${detail.kind} · ${detail.source}` : ''}
        title={detail?.label || 'Change'}
        description={detail ? `${detail.path} — ${formatDateTime(detail.at)}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDetail(null)}>
              Close
            </Button>
            <Button
              loading={busy}
              iconLeft={<RotateCcw size={15} />}
              disabled={!detail?.before && !detail?.after}
              onClick={() => detail && void restore(detail)}
            >
              Restore this state
            </Button>
          </>
        }
      >
        {detail && (
          <div className="space-y-4">
            {detail.note && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12px] text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
                {detail.note}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="label-eyebrow mb-1">Before</div>
                <div className="text-[12px] text-slate-600 dark:text-slate-300">
                  {summarise(before)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="label-eyebrow mb-1">After</div>
                <div className="text-[12px] text-slate-600 dark:text-slate-300">
                  {summarise(after)}
                </div>
              </div>
            </div>

            {diffRows.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                  <ArrowLeftRight size={12} className="text-slate-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Value diff
                  </span>
                </div>
                <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                  {diffRows.map((row) => {
                    const changed = row.before?.value !== row.after?.value;
                    const secret = row.before?.secret || row.after?.secret;
                    return (
                      <div key={row.key} className="px-4 py-2.5">
                        <div className="mono-value mb-1 flex items-center gap-1.5 text-[12px] font-medium text-slate-800 dark:text-slate-100">
                          {secret && <KeyRound size={10} className="text-amber-500" />}
                          {row.key}
                          {!changed && <Badge variant="neutral">unchanged</Badge>}
                        </div>
                        {changed && (
                          <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                            <div className="mono-value break-all rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                              {row.before ? row.before.value || '(empty)' : '(did not exist)'}
                            </div>
                            <div className="mono-value break-all rounded-lg bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                              {row.after ? row.after.value || '(empty)' : '(removed)'}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {diffRows.length === 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-3 text-[12px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {detail.kind === 'create' ? (
                  <Plus size={13} />
                ) : detail.kind === 'delete' ? (
                  <Trash2 size={13} />
                ) : (
                  <Copy size={13} />
                )}
                This entry records a structural change rather than a value change.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
