import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  FileArchive,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { FORMATS, FORMAT_LABELS } from '@shared/env-types';
import { filePath } from '@shared/tree';
import type { ArchiveManifest, EnvFormat, ImportMode } from '@shared/types';
import {
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Switch,
  useToast,
} from '@/components/ui';
import { errorMessage, getBridge } from '@/lib/bridge';
import { formatBytes, formatDateTime, pluralise } from '@/lib/format';
import { useVault } from '@/lib/vault';

type Scope = 'everything' | 'workspace' | 'project' | 'file';

const MODES: Array<{ value: ImportMode; label: string; title: string }> = [
  { value: 'merge', label: 'Merge', title: 'Update matching entries and add what is missing' },
  { value: 'skip', label: 'Keep existing', title: 'Only add what does not exist yet' },
  { value: 'replace', label: 'Replace', title: 'Replace matching projects and files' },
];

export function TransferPage(): JSX.Element {
  const toast = useToast();
  const { data, reload, activeWorkspace } = useVault();

  const [scope, setScope] = useState<Scope>('everything');
  const [workspaceId, setWorkspaceId] = useState(activeWorkspace?.id ?? '');
  const [projectId, setProjectId] = useState('');
  const [fileId, setFileId] = useState('');
  const [includeSecrets, setIncludeSecrets] = useState(data.settings.exportIncludeSecrets);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [encrypt, setEncrypt] = useState(true);
  const [password, setPassword] = useState('');
  const [format, setFormat] = useState<EnvFormat | 'native'>('native');
  const [exporting, setExporting] = useState(false);

  const [importPath, setImportPath] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ArchiveManifest | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [importing, setImporting] = useState(false);

  const projects = useMemo(
    () => data.projects.filter((p) => !workspaceId || p.workspaceId === workspaceId),
    [data.projects, workspaceId],
  );

  const counts = useMemo(() => {
    if (scope === 'everything') {
      return {
        projects: data.projects.length,
        files: data.files.length,
        vars: data.vars.length,
      };
    }
    if (scope === 'file') {
      return {
        projects: 1,
        files: fileId ? 1 : 0,
        vars: data.vars.filter((v) => v.fileId === fileId).length,
      };
    }
    const ids = new Set(
      scope === 'workspace'
        ? data.projects.filter((p) => p.workspaceId === workspaceId).map((p) => p.id)
        : [projectId],
    );
    const files = data.files.filter((f) => ids.has(f.projectId));
    const fileIds = new Set(files.map((f) => f.id));
    return {
      projects: ids.size,
      files: files.length,
      vars: data.vars.filter((v) => fileIds.has(v.fileId)).length,
    };
  }, [scope, data, workspaceId, projectId, fileId]);

  const runExport = async (): Promise<void> => {
    if (encrypt && password.length < 8) {
      toast.warning('Set a password of at least 8 characters for the archive');
      return;
    }
    setExporting(true);
    try {
      const result = await getBridge().transfer.exportArchive({
        scope: {
          workspaceIds: scope === 'workspace' && workspaceId ? [workspaceId] : [],
          projectIds: scope === 'project' && projectId ? [projectId] : [],
          folderIds: [],
          fileIds: scope === 'file' && fileId ? [fileId] : [],
        },
        includeSecrets,
        includeHistory,
        format,
        encrypt,
        password,
      });
      if (!result) return;
      toast.success('Exported', `${result.path} (${formatBytes(result.bytes)})`);
    } catch (err) {
      toast.error('The export failed', errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const chooseArchive = async (): Promise<void> => {
    try {
      const result = await getBridge().transfer.previewArchive();
      if (!result) return;
      setImportPath(result.path);
      setManifest(result.preview.manifest);
      setImportPassword('');
    } catch (err) {
      toast.error('That is not a Fuse export', errorMessage(err));
    }
  };

  const runImport = async (): Promise<void> => {
    if (!importPath) return;
    if (manifest?.encrypted && !importPassword) {
      toast.warning('This archive needs its password');
      return;
    }
    setImporting(true);
    try {
      const result = await getBridge().transfer.importArchive({
        path: importPath,
        password: importPassword,
        mode: importMode,
      });
      await reload();
      setImportPath(null);
      setManifest(null);
      toast.success(
        'Import finished',
        `${result.projects} projects, ${result.files} files, ${result.vars} variables added. ${result.overwritten} updated, ${result.skipped} skipped.`,
      );
    } catch (err) {
      toast.error('The import failed', errorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto p-6 lg:p-8">
      <PageHeader
        eyebrow="Transfer"
        title="Import and export"
        description="Move part or all of your vault as a single zip, encrypted or plain."
      />

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card
          title="Export"
          description="Choose what to include, then save a zip."
          actions={<ArrowUpFromLine size={16} className="text-slate-400" />}
        >
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                What to export
              </span>
              <SegmentedControl
                fullWidth
                size="sm"
                value={scope}
                onChange={setScope}
                items={[
                  { value: 'everything', label: 'Everything' },
                  { value: 'workspace', label: 'A workspace' },
                  { value: 'project', label: 'A project' },
                  { value: 'file', label: 'One file' },
                ]}
              />
            </div>

            {scope === 'workspace' && (
              <Select
                label="Workspace"
                value={workspaceId}
                onChange={setWorkspaceId}
                options={data.workspaces.map((w) => ({ value: w.id, label: w.name }))}
              />
            )}
            {scope === 'project' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Select
                  label="Workspace"
                  value={workspaceId}
                  onChange={(id) => {
                    setWorkspaceId(id);
                    setProjectId('');
                  }}
                  options={data.workspaces.map((w) => ({ value: w.id, label: w.name }))}
                />
                <Select
                  label="Project"
                  value={projectId}
                  onChange={setProjectId}
                  searchable
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
            )}
            {scope === 'file' && (
              <Select
                label="Env file"
                value={fileId}
                onChange={setFileId}
                searchable
                options={data.files.map((f) => ({
                  value: f.id,
                  label: f.name,
                  sublabel: filePath(data, f.id),
                }))}
              />
            )}

            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-[12px] dark:border-slate-800 dark:bg-slate-800/30">
              <Badge variant="neutral">{pluralise(counts.projects, 'project')}</Badge>
              <Badge variant="neutral">{pluralise(counts.files, 'file')}</Badge>
              <Badge variant="brand">{pluralise(counts.vars, 'variable')}</Badge>
            </div>

            <Select
              label="Also write plain copies as"
              value={format}
              onChange={setFormat}
              searchable
              hint="A machine readable copy is always included so Fuse can import it back."
              options={[
                { value: 'native', label: 'Fuse structure only' },
                ...FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] })),
              ]}
            />

            <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <Switch
                checked={includeSecrets}
                onChange={setIncludeSecrets}
                size="sm"
                label="Include secret values"
                description="Turn this off to export the structure with secrets left blank."
              />
              <Switch
                checked={includeHistory}
                onChange={setIncludeHistory}
                size="sm"
                label="Include change history"
                description="Adds the recorded revisions for the exported items."
              />
              <Switch
                checked={encrypt}
                onChange={setEncrypt}
                size="sm"
                label="Encrypt the archive"
                description="Protects the zip with its own password, separate from your master password."
              />
              {encrypt && (
                <Input
                  type="password"
                  label="Archive password"
                  value={password}
                  size="sm"
                  leading={<Lock size={14} />}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </div>

            {!encrypt && includeSecrets && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                <span>
                  This archive will hold your secrets in plain text. Keep it somewhere safe and
                  delete it when you are done.
                </span>
              </div>
            )}

            <Button
              fullWidth
              loading={exporting}
              iconLeft={<ArrowUpFromLine size={15} />}
              onClick={() => void runExport()}
            >
              Export as zip
            </Button>
          </div>
        </Card>

        <Card
          title="Import"
          description="Bring a Fuse export back in, whole or in part."
          actions={<ArrowDownToLine size={16} className="text-slate-400" />}
        >
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => void chooseArchive()}
              className={clsx(
                'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 transition-colors',
                importPath
                  ? 'border-brand-300 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-950/20'
                  : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40',
              )}
            >
              <FileArchive size={24} className="text-slate-400" />
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                {importPath ? importPath.split(/[\\/]/).pop() : 'Choose a Fuse export'}
              </span>
              <span className="text-[11px] text-slate-400">
                {importPath ? 'Click to choose a different one' : 'A .zip created by Fuse'}
              </span>
            </button>

            {manifest && (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={manifest.encrypted ? 'success' : 'warning'}>
                      {manifest.encrypted ? 'encrypted' : 'plain'}
                    </Badge>
                    <Badge variant={manifest.includesSecrets ? 'brand' : 'neutral'}>
                      {manifest.includesSecrets ? 'with secrets' : 'no secrets'}
                    </Badge>
                    <span className="text-[11px] text-slate-400">
                      Fuse {manifest.appVersion} · {formatDateTime(manifest.createdAt)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-slate-600 dark:text-slate-300">
                    <span>{pluralise(manifest.counts.workspaces, 'workspace')}</span>
                    <span>·</span>
                    <span>{pluralise(manifest.counts.projects, 'project')}</span>
                    <span>·</span>
                    <span>{pluralise(manifest.counts.files, 'file')}</span>
                    <span>·</span>
                    <span>{pluralise(manifest.counts.vars, 'variable')}</span>
                  </div>
                </div>

                {manifest.encrypted && (
                  <Input
                    type="password"
                    label="Archive password"
                    value={importPassword}
                    leading={<Lock size={14} />}
                    onChange={(e) => setImportPassword(e.target.value)}
                  />
                )}

                <div>
                  <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    When something already exists
                  </span>
                  <SegmentedControl
                    fullWidth
                    size="sm"
                    items={MODES}
                    value={importMode}
                    onChange={setImportMode}
                  />
                </div>

                <Button
                  fullWidth
                  loading={importing}
                  iconLeft={<Check size={15} />}
                  onClick={() => void runImport()}
                >
                  Import into this vault
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
