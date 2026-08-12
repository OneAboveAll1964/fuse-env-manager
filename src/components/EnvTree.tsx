import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronRight, FileCode2, Folder, FolderOpen, KeyRound, Plus, Search } from 'lucide-react';
import type { TreeNode } from '@shared/types';
import { Input, Menu } from '@/components/ui';
import { TONE_CLASSES } from '@/lib/format';
import { iconByName } from '@/lib/icons';

export type TreeAction =
  | { kind: 'new-project'; workspaceId: string }
  | { kind: 'new-folder'; projectId: string; parentId: string | null }
  | { kind: 'new-file'; projectId: string; folderId: string | null }
  | { kind: 'edit'; node: TreeNode }
  | { kind: 'duplicate'; node: TreeNode }
  | { kind: 'delete'; node: TreeNode }
  | { kind: 'export'; node: TreeNode };

export function EnvTree({
  nodes,
  selectedFileId,
  onSelectFile,
  onAction,
}: {
  nodes: TreeNode[];
  selectedFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onAction: (action: TreeAction) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return nodes;
    const walk = (list: TreeNode[]): TreeNode[] =>
      list
        .map((node) => {
          const children = walk(node.children);
          const matches = node.name.toLowerCase().includes(term);
          if (!matches && children.length === 0) return null;
          return { ...node, children: matches ? node.children : children };
        })
        .filter((n): n is TreeNode => n !== null);
    return walk(nodes);
  }, [nodes, query]);

  const searching = query.trim().length > 0;

  const renderNode = (node: TreeNode, depth: number): JSX.Element => {
    const isCollapsed = !searching && collapsed[node.id];
    const hasChildren = node.children.length > 0;
    const tone = TONE_CLASSES[node.tone];
    const selected = node.kind === 'file' && node.id === selectedFileId;

    const menuItems = (() => {
      switch (node.kind) {
        case 'workspace':
          return [
            {
              key: 'new-project',
              label: 'New project',
              icon: <Plus size={14} />,
              onSelect: () => onAction({ kind: 'new-project', workspaceId: node.id }),
            },
            {
              key: 'edit',
              label: 'Edit workspace',
              onSelect: () => onAction({ kind: 'edit', node }),
            },
            {
              key: 'duplicate',
              label: 'Duplicate',
              onSelect: () => onAction({ kind: 'duplicate', node }),
            },
            {
              key: 'delete',
              label: 'Delete workspace',
              danger: true,
              separatorBefore: true,
              onSelect: () => onAction({ kind: 'delete', node }),
            },
          ];
        case 'project':
          return [
            {
              key: 'new-folder',
              label: 'New folder',
              icon: <Folder size={14} />,
              onSelect: () => onAction({ kind: 'new-folder', projectId: node.id, parentId: null }),
            },
            {
              key: 'new-file',
              label: 'New env file',
              icon: <FileCode2 size={14} />,
              onSelect: () => onAction({ kind: 'new-file', projectId: node.id, folderId: null }),
            },
            {
              key: 'edit',
              label: 'Edit project',
              onSelect: () => onAction({ kind: 'edit', node }),
            },
            {
              key: 'duplicate',
              label: 'Duplicate',
              onSelect: () => onAction({ kind: 'duplicate', node }),
            },
            {
              key: 'export',
              label: 'Export project',
              onSelect: () => onAction({ kind: 'export', node }),
            },
            {
              key: 'delete',
              label: 'Delete project',
              danger: true,
              separatorBefore: true,
              onSelect: () => onAction({ kind: 'delete', node }),
            },
          ];
        case 'folder':
          return [
            {
              key: 'new-folder',
              label: 'New subfolder',
              icon: <Folder size={14} />,
              onSelect: () =>
                onAction({
                  kind: 'new-folder',
                  projectId: node.projectId ?? '',
                  parentId: node.id,
                }),
            },
            {
              key: 'new-file',
              label: 'New env file',
              icon: <FileCode2 size={14} />,
              onSelect: () =>
                onAction({ kind: 'new-file', projectId: node.projectId ?? '', folderId: node.id }),
            },
            { key: 'edit', label: 'Edit folder', onSelect: () => onAction({ kind: 'edit', node }) },
            {
              key: 'duplicate',
              label: 'Duplicate',
              onSelect: () => onAction({ kind: 'duplicate', node }),
            },
            {
              key: 'export',
              label: 'Export folder',
              onSelect: () => onAction({ kind: 'export', node }),
            },
            {
              key: 'delete',
              label: 'Delete folder',
              danger: true,
              separatorBefore: true,
              onSelect: () => onAction({ kind: 'delete', node }),
            },
          ];
        default:
          return [
            { key: 'edit', label: 'Edit file', onSelect: () => onAction({ kind: 'edit', node }) },
            {
              key: 'duplicate',
              label: 'Duplicate',
              onSelect: () => onAction({ kind: 'duplicate', node }),
            },
            {
              key: 'export',
              label: 'Export file',
              onSelect: () => onAction({ kind: 'export', node }),
            },
            {
              key: 'delete',
              label: 'Delete file',
              danger: true,
              separatorBefore: true,
              onSelect: () => onAction({ kind: 'delete', node }),
            },
          ];
      }
    })();

    const Icon =
      node.kind === 'file'
        ? FileCode2
        : node.kind === 'folder'
          ? isCollapsed
            ? Folder
            : FolderOpen
          : iconByName(node.icon);

    return (
      <div key={node.id}>
        <div
          className={clsx(
            'group flex items-center gap-1 rounded-lg pe-1 transition-colors',
            selected
              ? 'bg-brand-100 dark:bg-brand-500/15'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800/70',
          )}
          style={{ paddingInlineStart: depth * 12 }}
        >
          <button
            type="button"
            onClick={() => {
              if (node.kind === 'file') onSelectFile(node.id);
              else setCollapsed((prev) => ({ ...prev, [node.id]: !prev[node.id] }));
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-start"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {hasChildren && node.kind !== 'file' ? (
                <ChevronRight
                  size={12}
                  className={clsx(
                    'text-slate-400 transition-transform',
                    !isCollapsed && 'rotate-90',
                  )}
                />
              ) : null}
            </span>
            <Icon
              size={14}
              className={clsx(
                'shrink-0',
                node.kind === 'file'
                  ? selected
                    ? 'text-brand-600 dark:text-brand-300'
                    : 'text-slate-400'
                  : tone.text,
              )}
            />
            <span
              className={clsx(
                'min-w-0 flex-1 truncate text-[12.5px]',
                node.kind === 'file' ? 'font-mono' : 'font-medium',
                selected
                  ? 'text-brand-800 dark:text-brand-100'
                  : 'text-slate-700 dark:text-slate-200',
              )}
            >
              {node.name}
            </span>
            {node.varCount > 0 && (
              <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                {node.varCount}
              </span>
            )}
            {node.secretCount > 0 && <KeyRound size={10} className="shrink-0 text-amber-500" />}
          </button>
          <Menu
            items={menuItems}
            className="h-6 w-6 shrink-0 text-slate-400 opacity-0 hover:bg-slate-200 group-hover:opacity-100 dark:hover:bg-slate-700"
            label={`${node.name} actions`}
          />
        </div>
        {!isCollapsed && hasChildren && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-slate-100 p-2.5 dark:border-slate-800">
        <Input
          size="sm"
          value={query}
          placeholder="Filter the tree…"
          leading={<Search size={13} />}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-slate-400">
            {searching ? 'Nothing matched' : 'This workspace is empty'}
          </div>
        ) : (
          filtered.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  );
}
