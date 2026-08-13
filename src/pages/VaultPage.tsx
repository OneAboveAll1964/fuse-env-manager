import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FilePlus2,
  FolderPlus,
  Import,
  KeyRound,
  Plus,
  Trash2,
  Vault as VaultIcon,
} from 'lucide-react';
import { FORMATS, FORMAT_LABELS } from '@shared/env-types';
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
import { EnvTree } from '@/components/EnvTree';
import { DirectoryView } from '@/components/DirectoryView';
import { Resizer } from '@/components/Resizer';
import { VarTable } from '@/components/VarTable';
import { nodeMenuItems, type TreeAction } from '@/components/nodeActions';
import { FileDialog } from '@/components/dialogs/FileDialog';
import { FolderDialog } from '@/components/dialogs/FolderDialog';
import { ImportDialog } from '@/components/dialogs/ImportDialog';
import { MoveFileDialog } from '@/components/dialogs/MoveFileDialog';
import { MoveVarsDialog } from '@/components/dialogs/MoveVarsDialog';
import { ProjectDialog } from '@/components/dialogs/ProjectDialog';
import { VariableDialog } from '@/components/dialogs/VariableDialog';
import { WorkspaceDialog } from '@/components/dialogs/WorkspaceDialog';
import { errorMessage, getBridge } from '@/lib/bridge';
import { pluralise } from '@/lib/format';
import {
  ROOT,
  breadcrumbsFor,
  chainTo,
  childrenAt,
  findNode,
  locationExists,
  locationOf,
  parentLocation,
  sameLocation,
  type Location,
} from '@/lib/navigation';
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
  | { kind: 'transfer'; action: 'copy' | 'move' }
  | { kind: 'move-file'; fileId: string; action: 'move' | 'copy' };

function parseLocation(raw: string | null): Location {
  if (!raw || raw === 'root') return ROOT;
  const separator = raw.indexOf(':');
  if (separator < 1) return ROOT;
  const kind = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  if (!id) return ROOT;
  if (kind === 'workspace' || kind === 'project' || kind === 'folder') return { kind, id };
  return ROOT;
}

function serializeLocation(location: Location): string {
  return location.kind === 'root' ? 'root' : `${location.kind}:${location.id}`;
}

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
  const [treeWidth, setTreeWidth] = useState(data.settings.treeWidth);

  const fileId = params.get('file');
  const file = fileById(fileId);
  const location = useMemo(() => parseLocation(params.get('at')), [params]);

  const history = useRef<Location[]>([location]);
  const cursor = useRef(0);
  const [, bumpHistory] = useState(0);

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
    setTreeWidth(data.settings.treeWidth);
  }, [data.settings.treeWidth]);

  useEffect(() => {
    setSelected([]);
    setRevealed([]);
    setFilter('');
  }, [fileId]);

  useEffect(() => {
    if (file) setRenderFormat(file.format);
  }, [file]);

  useEffect(() => {
    const stack = history.current;
    if (sameLocation(stack[cursor.current], location)) return;
    const next = stack.slice(0, cursor.current + 1);
    next.push(location);
    history.current = next;
    cursor.current = next.length - 1;
    bumpHistory((n) => n + 1);
  }, [location]);

  const setLocationParam = useCallback(
    (next: Location, keepFile: boolean) => {
      setParams((prev) => {
        const search = new URLSearchParams(prev);
        if (next.kind === 'root') search.delete('at');
        else search.set('at', serializeLocation(next));
        if (!keepFile) {
          search.delete('file');
          search.delete('var');
        }
        return search;
      });
    },
    [setParams],
  );

  useEffect(() => {
    if (locationExists(tree, location)) return;
    history.current = [ROOT];
    cursor.current = 0;
    setLocationParam(ROOT, false);
  }, [tree, location, setLocationParam]);

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

  const enter = useCallback(
    (node: TreeNode) => {
      if (node.kind === 'file') {
        selectFile(node.id);
        return;
      }
      setLocationParam(locationOf(node), false);
    },
    [selectFile, setLocationParam],
  );

  const goBack = useCallback(() => {
    if (cursor.current <= 0) return;
    cursor.current -= 1;
    bumpHistory((n) => n + 1);
    setLocationParam(history.current[cursor.current], false);
  }, [setLocationParam]);

  const goForward = useCallback(() => {
    if (cursor.current >= history.current.length - 1) return;
    cursor.current += 1;
    bumpHistory((n) => n + 1);
    setLocationParam(history.current[cursor.current], false);
  }, [setLocationParam]);

  const goUp = useCallback(() => {
    const parent = parentLocation(tree, location);
    if (parent) setLocationParam(parent, false);
  }, [tree, location, setLocationParam]);

  const canBack = cursor.current > 0;
  const canForward = cursor.current < history.current.length - 1;
  const canUp = location.kind !== 'root';

  useEffect(() => {
    const varId = params.get('var');
    if (!varId) return;
    const variable = varById(varId);
    if (variable && variable.secret) setRevealed((prev) => [...new Set([...prev, varId])]);
  }, [params, varById]);

  const saveTreeWidth = useCallback(
    (width: number) => {
      if (width === data.settings.treeWidth) return;
      void getBridge()
        .settings.save({ ...data.settings, treeWidth: width })
        .then(setData)
        .catch((err: unknown) => toast.error('Could not save the layout', errorMessage(err)));
    },
    [data.settings, setData, toast],
  );

  const refreshRender = useCallback(
    async (format: EnvFormat, masked: boolean): Promise<void> => {
      if (!file) return;
      try {
        setRendered(await getBridge().files.render(file.id, { format, maskSecrets: masked }));
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
      toast.success(
        `${file.name} copied`,
        `${pluralise(vars.length, 'variable')} in the clipboard.`,
      );
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
      case 'open':
        enter(action.node);
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
              (await bridge.projects.duplicate(action.node.id, name, action.node.workspaceId ?? ''))
                .data,
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
      case 'move-to':
        if (action.node.kind === 'file')
          setDialog({ kind: 'move-file', fileId: action.node.id, action: 'move' });
        return;
      case 'copy-to':
        if (action.node.kind === 'file')
          setDialog({ kind: 'move-file', fileId: action.node.id, action: 'copy' });
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
          if (sameLocation(location, locationOf(action.node))) {
            setLocationParam(parentLocation(tree, location) ?? ROOT, false);
          }
          if (action.node.kind === 'workspace')
            setData(await bridge.workspaces.remove(action.node.id));
          else if (action.node.kind === 'project')
            setData(await bridge.projects.remove(action.node.id));
          else if (action.node.kind === 'folder')
            setData(await bridge.folders.remove(action.node.id));
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

  const editingWorkspace = dialog.kind === 'workspace' ? (workspaceById(dialog.id) ?? null) : null;
  const editingProject: Project | null =
    dialog.kind === 'project' ? (projectById(dialog.id) ?? null) : null;
  const editingFolder: EnvFolder | null =
    dialog.kind === 'folder' ? (folderById(dialog.id) ?? null) : null;
  const editingFile: EnvFile | null = dialog.kind === 'file' ? (fileById(dialog.id) ?? null) : null;
  const editingVar = dialog.kind === 'variable' ? (varById(dialog.id) ?? null) : null;

  const listing = useMemo(() => childrenAt(tree, location), [tree, location]);
  const currentNode = location.kind === 'root' ? null : findNode(tree, location.id);
  const crumbs = useMemo(() => {
    const chain = file ? chainTo(tree, file.id).slice(0, -1) : breadcrumbsFor(tree, location);
    return chain[0]?.kind === 'workspace' ? chain.slice(1) : chain;
  }, [tree, location, file]);

  const targetProjectId = currentNode?.projectId ?? null;
  const targetFolderId = currentNode?.kind === 'folder' ? currentNode.id : null;

  const secretsCount = vars.filter((v) => v.secret).length;

  const addMenu: TreeAction[] = [];
  if (targetProjectId) {
    addMenu.push({ kind: 'new-folder', projectId: targetProjectId, parentId: targetFolderId });
    addMenu.push({ kind: 'new-file', projectId: targetProjectId, folderId: targetFolderId });
  }

  const breadcrumbBar = (
    <div className="flex min-w-0 flex-wrap items-center gap-1 text-[11px]">
      <button
        type="button"
        onClick={() => setLocationParam(ROOT, false)}
        className={clsx(
          'rounded px-1 py-0.5 font-semibold uppercase tracking-[0.12em] transition-colors',
          crumbs.length === 0 && !file
            ? 'text-slate-700 dark:text-slate-200'
            : 'text-slate-400 hover:text-brand-600 dark:hover:text-brand-300',
        )}
      >
        {activeWorkspace?.name ?? 'Vault'}
      </button>
      {crumbs.map((node) => (
        <span key={node.id} className="flex min-w-0 items-center gap-1">
          <ChevronRight size={11} className="shrink-0 text-slate-300 dark:text-slate-600" />
          <button
            type="button"
            onClick={() => setLocationParam(locationOf(node), false)}
            className="max-w-[180px] truncate rounded px-1 py-0.5 font-semibold uppercase tracking-[0.12em] text-slate-400 transition-colors hover:text-brand-600 dark:hover:text-brand-300"
          >
            {node.name}
          </button>
        </span>
      ))}
      {file && (
        <span className="flex min-w-0 items-center gap-1">
          <ChevronRight size={11} className="shrink-0 text-slate-300 dark:text-slate-600" />
          <span className="mono-value truncate px-1 text-slate-700 dark:text-slate-200">
            {file.name}
          </span>
        </span>
      )}
    </div>
  );

  const navButtons = (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton
        size="sm"
        label="Back"
        icon={<ArrowLeft size={14} />}
        disabled={!canBack}
        onClick={goBack}
      />
      <IconButton
        size="sm"
        label="Forward"
        icon={<ArrowRight size={14} />}
        disabled={!canForward}
        onClick={goForward}
      />
      <IconButton
        size="sm"
        label="Up one level"
        icon={<ArrowUp size={14} />}
        disabled={!canUp}
        onClick={goUp}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      <div
        style={{ width: treeWidth }}
        className="flex shrink-0 flex-col bg-white dark:bg-slate-900"
      >
        <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-100 px-2 py-2 dark:border-slate-800">
          {navButtons}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 ps-1">
            <VaultIcon size={13} className="shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
              {currentNode?.name ?? activeWorkspace?.name ?? 'Vault'}
            </span>
          </div>
          <Menu
            label="Add"
            className="h-7 w-7 shrink-0 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            trigger={<Plus size={15} />}
            items={[
              ...(targetProjectId
                ? [
                    {
                      key: 'folder',
                      label: 'New folder here',
                      icon: <FolderPlus size={14} />,
                      onSelect: () =>
                        setDialog({
                          kind: 'folder',
                          id: null,
                          projectId: targetProjectId,
                          parentId: targetFolderId,
                        }),
                    },
                    {
                      key: 'file',
                      label: 'New env file here',
                      icon: <FilePlus2 size={14} />,
                      onSelect: () =>
                        setDialog({
                          kind: 'file',
                          id: null,
                          projectId: targetProjectId,
                          folderId: targetFolderId,
                        }),
                    },
                  ]
                : []),
              {
                key: 'project',
                label: 'New project',
                separatorBefore: Boolean(targetProjectId),
                onSelect: () =>
                  setDialog({
                    kind: 'project',
                    id: null,
                    workspaceId: currentNode?.workspaceId ?? activeWorkspace?.id ?? null,
                  }),
              },
              {
                key: 'workspace',
                label: 'New workspace',
                onSelect: () => setDialog({ kind: 'workspace', id: null }),
              },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1">
          <EnvTree
            nodes={listing}
            selectedFileId={fileId}
            emptyLabel={
              location.kind === 'root' ? 'This workspace is empty' : 'There is nothing in here yet'
            }
            onSelectFile={selectFile}
            onEnter={enter}
            onAction={(action) => void handleTreeAction(action)}
          />
        </div>
      </div>

      <Resizer
        width={treeWidth}
        onPreview={setTreeWidth}
        onCommit={saveTreeWidth}
        onReset={() => {
          setTreeWidth(300);
          saveTreeWidth(300);
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            {breadcrumbBar}
            <div className="flex-1" />
          </div>

          {file ? (
            <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="mono-value truncate text-[19px] font-semibold text-slate-900 dark:text-slate-100">
                    {file.name}
                  </h1>
                  <Badge variant="neutral">{FORMAT_LABELS[file.format]}</Badge>
                  {secretsCount > 0 && (
                    <Badge variant="accent" icon={<KeyRound size={10} />}>
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
                      key: 'close',
                      label: 'Back to the folder',
                      onSelect: () =>
                        setLocationParam(
                          crumbs.length > 0 ? locationOf(crumbs[crumbs.length - 1]) : ROOT,
                          false,
                        ),
                    },
                  ]}
                />
              </div>
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
              <h1 className="truncate font-display text-[19px] font-semibold text-slate-900 dark:text-slate-100">
                {currentNode?.name ?? activeWorkspace?.name ?? 'Vault'}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {targetProjectId && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      iconLeft={<FolderPlus size={14} />}
                      onClick={() =>
                        setDialog({
                          kind: 'folder',
                          id: null,
                          projectId: targetProjectId,
                          parentId: targetFolderId,
                        })
                      }
                    >
                      Folder
                    </Button>
                    <Button
                      size="sm"
                      iconLeft={<FilePlus2 size={14} />}
                      onClick={() =>
                        setDialog({
                          kind: 'file',
                          id: null,
                          projectId: targetProjectId,
                          folderId: targetFolderId,
                        })
                      }
                    >
                      Env file
                    </Button>
                  </>
                )}
                {currentNode && (
                  <Menu
                    label={`${currentNode.name} actions`}
                    items={nodeMenuItems(currentNode, (action) => void handleTreeAction(action))}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {file ? (
          <>
            <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-2.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center gap-2">
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
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            {listing.length === 0 ? (
              <EmptyState
                icon={<FileCode2 size={20} />}
                title={
                  location.kind === 'root' ? 'This workspace is empty' : 'There is nothing in here'
                }
                description={
                  location.kind === 'root'
                    ? 'Create a project, then folders for each environment, then env files inside them.'
                    : 'Add a folder or an env file to fill it.'
                }
                action={
                  targetProjectId ? (
                    <Button
                      iconLeft={<FilePlus2 size={15} />}
                      onClick={() =>
                        setDialog({
                          kind: 'file',
                          id: null,
                          projectId: targetProjectId,
                          folderId: targetFolderId,
                        })
                      }
                    >
                      New env file
                    </Button>
                  ) : (
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
                  )
                }
              />
            ) : (
              <>
                <DirectoryView
                  nodes={listing}
                  selectedFileId={fileId}
                  onOpen={enter}
                  onAction={(action) => void handleTreeAction(action)}
                />
                <div className="px-6 py-3 text-[11px] text-slate-400">
                  Double click a folder to open it, or a file to edit its variables.
                </div>
              </>
            )}
          </div>
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
      <MoveFileDialog
        open={dialog.kind === 'move-file'}
        file={dialog.kind === 'move-file' ? (fileById(dialog.fileId) ?? null) : null}
        action={dialog.kind === 'move-file' ? dialog.action : 'move'}
        onClose={() => setDialog({ kind: 'none' })}
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
          />
        </div>
      </Modal>
    </div>
  );
}
