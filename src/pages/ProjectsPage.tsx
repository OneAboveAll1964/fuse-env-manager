import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  FileCode2,
  FolderTree,
  KeyRound,
  Link2,
  Package,
  Plus,
  Search,
  Unlink,
} from 'lucide-react';
import { fileIdsUnderProject } from '@shared/tree';
import type { Project } from '@shared/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Menu,
  PageHeader,
  StatTile,
  useConfirm,
  useToast,
} from '@/components/ui';
import { ProjectDialog } from '@/components/dialogs/ProjectDialog';
import { WorkspaceDialog } from '@/components/dialogs/WorkspaceDialog';
import { errorMessage, getBridge } from '@/lib/bridge';
import { TONE_CLASSES, pluralise, truncateMiddle } from '@/lib/format';
import { iconByName } from '@/lib/icons';
import { useVault } from '@/lib/vault';

export function ProjectsPage(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, setData, activeWorkspace } = useVault();
  const [query, setQuery] = useState('');
  const [projectDialog, setProjectDialog] = useState<{ open: boolean; project: Project | null }>({
    open: false,
    project: null,
  });
  const [workspaceDialog, setWorkspaceDialog] = useState(false);

  const projects = useMemo(() => {
    const list = data.projects.filter((p) => p.workspaceId === activeWorkspace?.id);
    const term = query.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term) ||
        p.tags.some((tag) => tag.toLowerCase().includes(term)),
    );
  }, [data.projects, activeWorkspace, query]);

  const stats = useMemo(() => {
    const ids = new Set(
      data.projects.filter((p) => p.workspaceId === activeWorkspace?.id).map((p) => p.id),
    );
    const files = data.files.filter((f) => ids.has(f.projectId));
    const fileIds = new Set(files.map((f) => f.id));
    const vars = data.vars.filter((v) => fileIds.has(v.fileId));
    return {
      projects: ids.size,
      folders: data.folders.filter((f) => ids.has(f.projectId)).length,
      files: files.length,
      vars: vars.length,
      secrets: vars.filter((v) => v.secret).length,
    };
  }, [data, activeWorkspace]);

  const countsFor = (
    projectId: string,
  ): { folders: number; files: number; vars: number; secrets: number } => {
    const fileIds = new Set(fileIdsUnderProject(data, projectId));
    const vars = data.vars.filter((v) => fileIds.has(v.fileId));
    return {
      folders: data.folders.filter((f) => f.projectId === projectId).length,
      files: fileIds.size,
      vars: vars.length,
      secrets: vars.filter((v) => v.secret).length,
    };
  };

  const linkFolder = async (project: Project): Promise<void> => {
    try {
      const target = await getBridge().system.pickDirectory(`Link a folder to ${project.name}`);
      if (!target) return;
      setData(await getBridge().projects.linkPath(project.id, target));
      toast.success('Folder linked', `${target} now maps to ${project.name} in the CLI.`);
    } catch (err) {
      toast.error('Could not link that folder', errorMessage(err));
    }
  };

  const unlinkFolder = async (project: Project, target: string): Promise<void> => {
    try {
      setData(await getBridge().projects.unlinkPath(project.id, target));
      toast.success('Folder unlinked');
    } catch (err) {
      toast.error('That did not work', errorMessage(err));
    }
  };

  const remove = async (project: Project): Promise<void> => {
    const ok = await confirm({
      title: `Delete ${project.name}?`,
      description:
        'Every folder, file and variable inside it goes too. You can restore it from history.',
      confirmText: 'Delete project',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      setData(await getBridge().projects.remove(project.id));
      toast.success('Project deleted', 'Restore it from the history page.');
    } catch (err) {
      toast.error('That did not work', errorMessage(err));
    }
  };

  const duplicate = async (project: Project): Promise<void> => {
    try {
      const result = await getBridge().projects.duplicate(
        project.id,
        `${project.name} copy`,
        project.workspaceId,
      );
      setData(result.data);
      toast.success('Project duplicated');
    } catch (err) {
      toast.error('Could not duplicate', errorMessage(err));
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          icon={<Package size={20} />}
          title="No workspace yet"
          description="Workspaces keep different companies and clients apart. Create the first one to begin."
          action={
            <Button iconLeft={<Plus size={15} />} onClick={() => setWorkspaceDialog(true)}>
              New workspace
            </Button>
          }
        />
        <WorkspaceDialog
          open={workspaceDialog}
          workspace={null}
          onClose={() => setWorkspaceDialog(false)}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto p-6 lg:p-8">
      <PageHeader
        eyebrow={activeWorkspace.name}
        title="Projects"
        description="Each project holds folders for its environments and the env files inside them."
        actions={
          <Button
            iconLeft={<Plus size={15} />}
            onClick={() => setProjectDialog({ open: true, project: null })}
          >
            New project
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Projects" value={String(stats.projects)} icon={Package} tone="brand" />
        <StatTile label="Folders" value={String(stats.folders)} icon={FolderTree} tone="ink" />
        <StatTile label="Env files" value={String(stats.files)} icon={FileCode2} tone="accent" />
        <StatTile
          label="Variables"
          value={String(stats.vars)}
          sub={`${stats.secrets} marked as secret`}
          icon={KeyRound}
          tone="success"
        />
      </div>

      <div className="mt-6 max-w-sm">
        <Input
          size="sm"
          value={query}
          placeholder="Search projects, tags and descriptions…"
          leading={<Search size={14} />}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {projects.length === 0 ? (
        <Card className="mt-5" padding="none">
          <EmptyState
            icon={<Package size={20} />}
            title={query ? 'Nothing matched' : 'No projects yet'}
            description={
              query
                ? 'Try a different search.'
                : 'Create a project and Fuse sets up development, staging and production for you.'
            }
            action={
              query ? undefined : (
                <Button
                  iconLeft={<Plus size={15} />}
                  onClick={() => setProjectDialog({ open: true, project: null })}
                >
                  New project
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const Icon = iconByName(project.icon);
            const tone = TONE_CLASSES[project.tone];
            const counts = countsFor(project.id);
            return (
              <Card
                key={project.id}
                padding="none"
                className="flex h-full flex-col overflow-hidden"
              >
                <div className="flex items-start gap-3 px-5 py-4">
                  <span
                    className={clsx(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white',
                      tone.bar,
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                      {project.name}
                    </div>
                    <div className="truncate text-[12px] text-slate-500 dark:text-slate-400">
                      {project.description || 'No description'}
                    </div>
                  </div>
                  <Menu
                    label={`${project.name} actions`}
                    items={[
                      {
                        key: 'open',
                        label: 'Open in vault',
                        onSelect: () => navigate('/vault'),
                      },
                      {
                        key: 'edit',
                        label: 'Edit project',
                        onSelect: () => setProjectDialog({ open: true, project }),
                      },
                      {
                        key: 'duplicate',
                        label: 'Duplicate',
                        onSelect: () => void duplicate(project),
                      },
                      {
                        key: 'link',
                        label: 'Link a local folder',
                        icon: <Link2 size={14} />,
                        separatorBefore: true,
                        onSelect: () => void linkFolder(project),
                      },
                      {
                        key: 'delete',
                        label: 'Delete project',
                        danger: true,
                        separatorBefore: true,
                        onSelect: () => void remove(project),
                      },
                    ]}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3">
                  <Badge variant="neutral" icon={<FolderTree size={11} />}>
                    {pluralise(counts.folders, 'folder')}
                  </Badge>
                  <Badge variant="brand" icon={<FileCode2 size={11} />}>
                    {pluralise(counts.files, 'file')}
                  </Badge>
                  <Badge variant={counts.vars ? 'success' : 'warning'}>
                    {pluralise(counts.vars, 'variable')}
                  </Badge>
                  {counts.secrets > 0 && (
                    <Badge variant="accent" icon={<KeyRound size={11} />}>
                      {counts.secrets}
                    </Badge>
                  )}
                </div>

                {project.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-5 pb-3">
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                  {project.links.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => void linkFolder(project)}
                      className="flex items-center gap-1.5 text-[11px] text-slate-400 transition-colors hover:text-brand-600 dark:hover:text-brand-400"
                    >
                      <Link2 size={11} />
                      Link a local folder for the CLI
                    </button>
                  ) : (
                    <div className="space-y-1">
                      {project.links.map((link) => (
                        <div key={link} className="flex items-center gap-1.5">
                          <Link2 size={11} className="shrink-0 text-emerald-500" />
                          <span
                            title={link}
                            className="mono-value min-w-0 flex-1 truncate text-[11px] text-slate-500 dark:text-slate-400"
                          >
                            {truncateMiddle(link, 42)}
                          </span>
                          <button
                            type="button"
                            onClick={() => void unlinkFolder(project, link)}
                            aria-label="Unlink"
                            title="Unlink"
                            className="rounded p-0.5 text-slate-400 transition-colors hover:text-rose-600"
                          >
                            <Unlink size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ProjectDialog
        open={projectDialog.open}
        project={projectDialog.project}
        workspaceId={activeWorkspace.id}
        onClose={() => setProjectDialog({ open: false, project: null })}
      />
    </div>
  );
}
