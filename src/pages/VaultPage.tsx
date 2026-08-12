import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowRightLeft,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FolderPlus,
  Import,
  KeyRound,
  Plus,
  Trash2,
  Vault as VaultIcon,
} from 'lucide-react';
import { FORMATS, FORMAT_LABELS } from '@shared/env-types';
import { folderPath } from '@shared/tree';
import type { EnvFile, EnvFolder, EnvFormat, EnvVar, Project, TreeNode } from '@shared/types';
import {
  Badge,
  Button,
  CodeBlock,
  EmptyState,
  IconButton,
  Input,
  Menu,
  Modal,
  SegmentedControl,
  Select,
  useConfirm,
  useToast,
} from '@/components/ui';
import { EnvTree, type TreeAction } from '@/components/EnvTree';
import { VarTable } from '@/components/VarTable';
import { FileDialog } from '@/components/dialogs/FileDialog';
import { FolderDialog } from '@/components/dialogs/FolderDialog';
import { ImportDialog } from '@/components/dialogs/ImportDialog';
import { MoveVarsDialog } from '@/components/dialogs/MoveVarsDialog';
import { ProjectDialog } from '@/components/dialogs/ProjectDialog';
import { VariableDialog } from '@/components/dialogs/VariableDialog';
import { WorkspaceDialog } from '@/components/dialogs/WorkspaceDialog';
import { errorMessage, getBridge } from '@/lib/bridge';
import { pluralise } from '@/lib/format';
import { useVault } from '@/lib/vault';

type DialogState =
  | { kind: 'none' }
  | { kind: 'workspace'; id: string | null }
  | { kind: 'project'; id: string | null; workspaceId: string | null }
  | { kind: 'folder'; id: string | null; projectId: string | null; parentId: string | null }
  | { kind: 'file'; id: string | null; projectId: string | null; folderId: string | null }
  | { kind: 'variable'; id: string | null }
  | { kind: 'import' }
  | { kind: 'render' }
  | { kind: 'transfer'; action: 'copy' | 'move' };

export function VaultPage(): JSX.Element {
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const {
    data,
    setData,
    tree,
    fileById,
    folderById,
    projectById,
    workspaceById,
    varById,
    varsFor,
    activeWorkspace,
  } = useVault();

  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [selected, setSelected] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [renderFormat, setRenderFormat] = useState<EnvFormat>('dotenv');
  const [rendered, setRendered] = useState('');
  const [renderMasked, setRenderMasked] = useState(false);

  const fileId = params.get('file');
  const file = fileById(fileId);
  const vars = useMemo(() => (file ? varsFor(file.id) : []), [file, varsFor]);

  const visibleVars = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const list = term
      ? vars.filter(
          (v) =>
            v.key.toLowerCase().includes(term) ||
            v.note.toLowerCase().includes(term) ||
            (!v.secret && v.value.toLowerCase().includes(term)),
        )
      : vars;
    return data.settings.sortVarsAlphabetically
      ? [...list].sort((a, b) => a.key.localeCompare(b.key))
      : list;
  }, [vars, filter, data.settings.sortVarsAlphabetically]);

  useEffect(() => {
    setSelected([]);
    setRevealed([]);
    setFilter('');
  }, [fileId]);

  useEffect(() => {
    if (file) setRenderFormat(file.format);
  }, [file]);

  const selectFile = useCallback(
    (id: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('file', id);
        next.delete('var');
        return next;
      });
    },
    [setParams],
  );

  useEffect(() => {
    const varId = params.get('var');
    if (!varId) return;
    const variable = varById(varId);
    if (variable && variable.secret) setRevealed((prev) => [...new Set([...prev, varId])]);
  }, [params, varById]);

  const refreshRender = useCallback(
    async (format: EnvFormat, masked: boolean): Promise<void> => {
      if (!file) return;
      try {
        setRendered(
          await getBridge().files.render(file.id, { format, maskSecrets: masked }),
        );
      } catch (err) {
        toast.error('Could not render this file', errorMessage(err));
      }
    },
    [file, toast],
  );

  useEffect(() => {
    if (dialog.kind === 'render') void refreshRender(renderFormat, renderMasked);
  }, [dialog.kind, renderFormat, renderMasked, refreshRender]);

  const copyValue = async (variable: EnvVar): Promise<void> => {
    try {
      await getBridge().system.copySecret(variable.value, data.settings.clipboardClearSeconds);
      toast.success(
        `${variable.key} copied`,
        variable.secret && data.settings.clipboardClearSeconds > 0
          ? `The clipboard clears in ${data.settings.clipboardClearSeconds}s.`
          : undefined,
      );
    } catch (err) {
      toast.error('Could not copy', errorMessage(err));
    }
  };

  const copyWholeFile = async (): Promise<void> => {
    if (!file) return;
    try {
      const text = await getBridge().files.render(file.id, { format: file.format });
      await getBridge().system.copySecret(text, data.settings.clipboardClearSeconds);
      toast.success(`${file.name} copied`, `${pluralise(vars.length, 'variable')} in the clipboard.`);
    } catch (err) {
      toast.error('Could not copy the file', errorMessage(err));
    }
  };

  const exportFile = async (): Promise<void> => {
    if (!file) return;
    try {
      const target = await getBridge().transfer.exportFileToDisk(file.id, file.format);
      if (target) toast.success('Saved', target);
    } catch (err) {
      toast.error('Could not save the file', errorMessage(err));
    }
  };

  const toggleEnabled = async (variable: EnvVar): Promise<void> => {
    try {
      setData(await getBridge().vars.update(variable.id, { enabled: !variable.enabled }));
    } catch (err) {
      toast.error('That did not work', errorMessage(err));
    }
  };

  const saveInline = async (variable: EnvVar, value: string): Promise<void> => {
    try {
      setData(await getBridge().vars.update(variable.id, { value }));
    } catch (err) {
      toast.error('That did not work', errorMessage(err));
    }
  };

  const deleteVars = async (ids: string[], label: string): Promise<void> => {
    const ok =
      !data.settings.confirmDestructive ||
      (await confirm({
        title: `Delete ${label}?`,
        description: 'You can restore it later from the history page.',
        confirmText: 'Delete',
        variant: 'danger',
      }));
    if (!ok) return;
    try {
      setData(await getBridge().vars.remove(ids));
      setSelected((prev) => prev.filter((id) => !ids.includes(id)));
      toast.success(`${label} deleted`);
    } catch (err) {
      toast.error('That did not work', errorMessage(err));
    }
  };

  const handleTreeAction = async (action: TreeAction): Promise<void> => {
    const bridge = getBridge();
    switch (action.kind) {
      case 'new-project':
        setDialog({ kind: 'project', id: null, workspaceId: action.workspaceId });
        return;
      case 'new-folder':
        setDialog({
          kind: 'folder',
          id: null,
          projectId: action.projectId,
          parentId: action.parentId,
        });
        return;
      case 'new-file':
        setDialog({
          kind: 'file',
          id: null,
          projectId: action.projectId,
          folderId: action.folderId,
        });
        return;
      case 'edit':
        if (action.node.kind === 'workspace') setDialog({ kind: 'workspace', id: action.node.id });
        if (action.node.kind === 'project')
          setDialog({ kind: 'project', id: action.node.id, workspaceId: action.node.workspaceId });
        if (action.node.kind === 'folder')
          setDialog({
            kind: 'folder',
            id: action.node.id,
            projectId: action.node.projectId,
            parentId: action.node.parentId,
          });
        if (action.node.kind === 'file')
          setDialog({
            kind: 'file',
            id: action.node.id,
            projectId: action.node.projectId,
            folderId: action.node.parentId,
          });
        return;
      case 'duplicate':
        try {
          const name = `${action.node.name} copy`;
          if (action.node.kind === 'workspace') {
            setData((await bridge.workspaces.duplicate(action.node.id, name)).data);
          } else if (action.node.kind === 'project') {
            setData(
              (
                await bridge.projects.duplicate(
                  action.node.id,
                  name,
                  action.node.workspaceId ?? '',
                )
              ).data,
            );
          } else if (action.node.kind === 'folder') {
            setData((await bridge.folders.duplicate(action.node.id, name)).data);
          } else {
            setData((await bridge.files.duplicate(action.node.id, name)).data);
          }
          toast.success(`${action.node.name} duplicated`);
        } catch (err) {
          toast.error('Could not duplicate', errorMessage(err));
        }
        return;
      case 'export':
        try {
          if (action.node.kind === 'file') {
            const target = await bridge.transfer.exportFileToDisk(
              action.node.id,
              action.node.format ?? 'dotenv',
            );
            if (target) toast.success('Saved', target);
            return;
          }
          const result = await bridge.transfer.exportArchive({
            scope: {
              workspaceIds: action.node.kind === 'workspace' ? [action.node.id] : [],
              projectIds: action.node.kind === 'project' ? [action.node.id] : [],
              folderIds: action.node.kind === 'folder' ? [action.node.id] : [],
              fileIds: [],
            },
            includeSecrets: data.settings.exportIncludeSecrets,
            includeHistory: false,
            format: 'native',
            encrypt: false,
            password: '',
          });
          if (result) toast.success('Exported', result.path);
        } catch (err) {
          toast.error('The export failed', errorMessage(err));
        }
        return;
      case 'delete': {
        const ok =
          !data.settings.confirmDestructive ||
          (await confirm({
            title: `Delete ${action.node.name}?`,
            description:
              action.node.kind === 'file'
                ? `${pluralise(action.node.varCount, 'variable')} will go with it. You can restore it from history.`
                : 'Everything inside it goes too. You can restore it from history.',
            confirmText: 'Delete',
            variant: 'danger',
          }));
        if (!ok) return;
        try {
          if (action.node.kind === 'workspace') setData(await bridge.workspaces.remove(action.node.id));
          else if (action.node.kind === 'project') setData(await bridge.projects.remove(action.node.id));
          else if (action.node.kind === 'folder') setData(await bridge.folders.remove(action.node.id));
          else {
            setData(await bridge.files.remove(action.node.id));
            if (action.node.id === fileId) {
              setParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete('file');
                return next;
              });
            }
          }
          toast.success(`${action.node.name} deleted`, 'Restore it from the history page.');
        } catch (err) {
          toast.error('That did not work', errorMessage(err));
        }
      }
    }
  };

  const editingWorkspace = dialog.kind === 'workspace' ? workspaceById(dialog.id) ?? null : null;
  const editingProject: Project | null =
    dialog.kind === 'project' ? (projectById(dialog.id) ?? null) : null;
  const editingFolder: EnvFolder | null =
    dialog.kind === 'folder' ? (folderById(dialog.id) ?? null) : null;
  const editingFile: EnvFile | null = dialog.kind === 'file' ? (fileById(dialog.id) ?? null) : null;
  const editingVar = dialog.kind === 'variable' ? (varById(dialog.id) ?? null) : null;

  const breadcrumb = useMemo(() => {
    if (!file) return [];
    const project = projectById(file.projectId);
    const workspace = project ? workspaceById(project.workspaceId) : undefined;
    return [workspace?.name, project?.name, ...folderPath(data, file.folderId)].filter(
      (s): s is string => Boolean(s),
    );
  }, [file, data, projectById, workspaceById]);

  const secretsCount = vars.filter((v) => v.secret).length;
  const treeNodes: TreeNode[] = tree;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[300px] shrink-0 flex-col border-e border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
          <VaultIcon size={14} className="shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
            {activeWorkspace?.name ?? 'Vault'}
          </span>
          <Menu
            label="Add"
            className="h-7 w-7 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            trigger={<Plus size={15} />}
            items={[
              {
                key: 'project',
                label: 'New project',
                onSelect: () =>
                  setDialog({
                    kind: 'project',
                    id: null,
                    workspaceId: activeWorkspace?.id ?? null,
                  }),
              },
              {
                key: 'workspace',
                label: 'New workspace',
                separatorBefore: true,
                onSelect: () => setDialog({ kind: 'workspace', id: null }),
              },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1">
          <EnvTree
            nodes={treeNodes}
            selectedFileId={fileId}
            onSelectFile={selectFile}
            onAction={(action) => void handleTreeAction(action)}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {!file ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<FileCode2 size={20} />}
              title={treeNodes.length === 0 ? 'This workspace is empty' : 'Select a file'}
              description={
                treeNodes.length === 0
                  ? 'Create a project, then folders for each environment, then env files inside them.'
                  : 'Pick an env file on the left to see and edit its variables.'
              }
              action={
                treeNodes.length === 0 ? (
                  <Button
                    iconLeft={<Plus size={15} />}
                    onClick={() =>
                      setDialog({
                        kind: 'project',
                        id: null,
                        workspaceId: activeWorkspace?.id ?? null,
                      })
                    }
                  >
                    New project
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="label-eyebrow mb-1 truncate">{breadcrumb.join(' / ')}</div>
                  <div className="flex items-center gap-2">
                    <h1 className="mono-value truncate text-[19px] font-semibold text-slate-900 dark:text-slate-100">
                      {file.name}
                    </h1>
                    <Badge variant="neutral">{FORMAT_LABELS[file.format]}</Badge>
                    {secretsCount > 0 && (
                      <Badge variant="warning" icon={<KeyRound size={10} />}>
                        {secretsCount}
                      </Badge>
                    )}
                  </div>
                  {file.description && (
                    <p className="mt-1 truncate text-[12px] text-slate-500 dark:text-slate-400">
                      {file.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    iconLeft={<Import size={14} />}
                    onClick={() => setDialog({ kind: 'import' })}
                  >
                    Import
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    iconLeft={<Code2 size={14} />}
                    onClick={() => setDialog({ kind: 'render' })}
                  >
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    iconLeft={<Plus size={14} />}
                    onClick={() => setDialog({ kind: 'variable', id: null })}
                  >
                    Variable
                  </Button>
                  <Menu
                    label="File actions"
                    items={[
                      {
                        key: 'copy',
                        label: 'Copy whole file',
                        icon: <Copy size={14} />,
                        onSelect: () => void copyWholeFile(),
                      },
                      {
                        key: 'export',
                        label: 'Save to disk',
                        icon: <Download size={14} />,
                        onSelect: () => void exportFile(),
                      },
                      {
                        key: 'edit',
                        label: 'File settings',
                        separatorBefore: true,
                        onSelect: () =>
                          setDialog({
                            kind: 'file',
                            id: file.id,
                            projectId: file.projectId,
                            folderId: file.folderId,
                          }),
                      },
                      {
                        key: 'folder',
                        label: 'New folder here',
                        icon: <FolderPlus size={14} />,
                        onSelect: () =>
                          setDialog({
                            kind: 'folder',
                            id: null,
                            projectId: file.projectId,
                            parentId: file.folderId,
                          }),
                      },
                    ]}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="w-56">
                  <Input
                    size="sm"
                    value={filter}
                    placeholder="Filter variables…"
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </div>
                <span className="text-[11px] text-slate-400">
                  {visibleVars.length === vars.length
                    ? pluralise(vars.length, 'variable')
                    : `${visibleVars.length} of ${vars.length}`}
                </span>
                <div className="flex-1" />
                {selected.length > 0 && (
                  <>
                    <span className="text-[11px] font-medium text-brand-700 dark:text-brand-300">
                      {selected.length} selected
                    </span>
                    <Button
                      size="xs"
                      variant="outline"
                      iconLeft={<Copy size={12} />}
                      onClick={() => setDialog({ kind: 'transfer', action: 'copy' })}
                    >
                      Copy to
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      iconLeft={<ArrowRightLeft size={12} />}
                      onClick={() => setDialog({ kind: 'transfer', action: 'move' })}
                    >
                      Move to
                    </Button>
                    <Button
                      size="xs"
                      variant="danger"
                      iconLeft={<Trash2 size={12} />}
                      onClick={() =>
                        void deleteVars(selected, pluralise(selected.length, 'variable'))
                      }
                    >
                      Delete
                    </Button>
                  </>
                )}
                <IconButton
                  size="sm"
                  variant="outline"
                  label={revealed.length > 0 ? 'Hide all secrets' : 'Reveal all secrets'}
                  icon={revealed.length > 0 ? <EyeOff size={13} /> : <Eye size={13} />}
                  onClick={() =>
                    setRevealed((prev) =>
                      prev.length > 0 ? [] : vars.filter((v) => v.secret).map((v) => v.id),
                    )
                  }
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {visibleVars.length === 0 ? (
                <EmptyState
                  icon={<KeyRound size={20} />}
                  title={vars.length === 0 ? 'No variables yet' : 'Nothing matched'}
                  description={
                    vars.length === 0
                      ? 'Add them one at a time, or paste a whole env file with Import.'
                      : 'Try a different filter.'
                  }
                  action={
                    vars.length === 0 ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          iconLeft={<Plus size={14} />}
                          onClick={() => setDialog({ kind: 'variable', id: null })}
                        >
                          Add variable
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          iconLeft={<Import size={14} />}
                          onClick={() => setDialog({ kind: 'import' })}
                        >
                          Import
                        </Button>
                      </div>
                    ) : undefined
                  }
                />
              ) : (
                <VarTable
                  vars={visibleVars}
                  dense={data.settings.denseTable}
                  maskSecrets={data.settings.maskSecrets}
                  selected={selected}
                  revealed={revealed}
                  onToggleSelected={(id) =>
                    setSelected((prev) =>
                      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
                    )
                  }
                  onToggleAll={() =>
                    setSelected((prev) =>
                      prev.length === visibleVars.length ? [] : visibleVars.map((v) => v.id),
                    )
                  }
                  onToggleReveal={(id) =>
                    setRevealed((prev) =>
                      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
                    )
                  }
                  onCopy={(variable) => void copyValue(variable)}
                  onEdit={(variable) => setDialog({ kind: 'variable', id: variable.id })}
                  onDelete={(variable) => void deleteVars([variable.id], variable.key)}
                  onToggleEnabled={(variable) => void toggleEnabled(variable)}
                  onInlineSave={(variable, value) => void saveInline(variable, value)}
                />
              )}
            </div>
          </>
        )}
      </div>

      <WorkspaceDialog
        open={dialog.kind === 'workspace'}
        workspace={editingWorkspace}
        onClose={() => setDialog({ kind: 'none' })}
      />
      <ProjectDialog
        open={dialog.kind === 'project'}
        project={editingProject}
        workspaceId={dialog.kind === 'project' ? dialog.workspaceId : null}
        onClose={() => setDialog({ kind: 'none' })}
      />
      <FolderDialog
        open={dialog.kind === 'folder'}
        folder={editingFolder}
        projectId={dialog.kind === 'folder' ? dialog.projectId : null}
        parentId={dialog.kind === 'folder' ? dialog.parentId : null}
        onClose={() => setDialog({ kind: 'none' })}
      />
      <FileDialog
        open={dialog.kind === 'file'}
        file={editingFile}
        projectId={dialog.kind === 'file' ? dialog.projectId : null}
        folderId={dialog.kind === 'file' ? dialog.folderId : null}
        onClose={() => setDialog({ kind: 'none' })}
        onCreated={selectFile}
      />
      <VariableDialog
        open={dialog.kind === 'variable'}
        variable={editingVar}
        fileId={fileId}
        onClose={() => setDialog({ kind: 'none' })}
      />
      <ImportDialog
        open={dialog.kind === 'import'}
        fileId={fileId}
        onClose={() => setDialog({ kind: 'none' })}
      />
      <MoveVarsDialog
        open={dialog.kind === 'transfer'}
        varIds={selected}
        sourceFileId={fileId}
        action={dialog.kind === 'transfer' ? dialog.action : 'copy'}
        onClose={() => setDialog({ kind: 'none' })}
        onDone={() => setSelected([])}
      />

      <Modal
        open={dialog.kind === 'render'}
        onClose={() => setDialog({ kind: 'none' })}
        size="2xl"
        eyebrow="Preview"
        title={file ? `${file.name} rendered` : 'Preview'}
        description="See exactly what gets written when you copy, export or pull this file."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog({ kind: 'none' })}>
              Close
            </Button>
            <Button
              iconLeft={<Download size={15} />}
              onClick={() => {
                void (async () => {
                  if (!file) return;
                  try {
                    const target = await getBridge().system.saveText({
                      title: 'Save rendered file',
                      defaultName: file.name,
                      text: rendered,
                    });
                    if (target) toast.success('Saved', target);
                  } catch (err) {
                    toast.error('Could not save', errorMessage(err));
                  }
                })();
              }}
            >
              Save as
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <Select
                label="Render as"
                size="sm"
                value={renderFormat}
                onChange={setRenderFormat}
                searchable
                options={FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
              />
            </div>
            <SegmentedControl
              size="sm"
              value={renderMasked ? 'masked' : 'full'}
              onChange={(v) => setRenderMasked(v === 'masked')}
              items={[
                { value: 'full', label: 'Real values' },
                { value: 'masked', label: 'Mask secrets' },
              ]}
            />
          </div>
          <CodeBlock
            code={rendered || '# nothing to render yet'}
            title={file?.name}
            maxHeight={420}
            className={clsx(renderMasked && 'opacity-95')}
          />
        </div>
      </Modal>
    </div>
  );
}
