import { Copy, Download, FileCode2, FolderPlus, LogIn, Pencil, Trash2 } from 'lucide-react';
import type { TreeNode } from '@shared/types';
import type { MenuItem } from '@/components/ui';

export type TreeAction =
  | { kind: 'new-project'; workspaceId: string }
  | { kind: 'new-folder'; projectId: string; parentId: string | null }
  | { kind: 'new-file'; projectId: string; folderId: string | null }
  | { kind: 'open'; node: TreeNode }
  | { kind: 'edit'; node: TreeNode }
  | { kind: 'duplicate'; node: TreeNode }
  | { kind: 'delete'; node: TreeNode }
  | { kind: 'export'; node: TreeNode };

export function nodeMenuItems(
  node: TreeNode,
  onAction: (action: TreeAction) => void,
  options: { includeOpen?: boolean } = {},
): MenuItem[] {
  const open: MenuItem[] = options.includeOpen
    ? [
        {
          key: 'open',
          label: node.kind === 'file' ? 'Open' : 'Open folder',
          icon: <LogIn size={14} />,
          onSelect: () => onAction({ kind: 'open', node }),
        },
      ]
    : [];

  const edit: MenuItem = {
    key: 'edit',
    label: `Edit ${node.kind}`,
    icon: <Pencil size={14} />,
    onSelect: () => onAction({ kind: 'edit', node }),
  };
  const duplicate: MenuItem = {
    key: 'duplicate',
    label: 'Duplicate',
    icon: <Copy size={14} />,
    onSelect: () => onAction({ kind: 'duplicate', node }),
  };
  const exportItem: MenuItem = {
    key: 'export',
    label: node.kind === 'file' ? 'Save to disk' : `Export ${node.kind}`,
    icon: <Download size={14} />,
    onSelect: () => onAction({ kind: 'export', node }),
  };
  const remove: MenuItem = {
    key: 'delete',
    label: `Delete ${node.kind}`,
    icon: <Trash2 size={14} />,
    danger: true,
    separatorBefore: true,
    onSelect: () => onAction({ kind: 'delete', node }),
  };

  switch (node.kind) {
    case 'workspace':
      return [
        ...open,
        {
          key: 'new-project',
          label: 'New project',
          icon: <FolderPlus size={14} />,
          onSelect: () => onAction({ kind: 'new-project', workspaceId: node.id }),
        },
        edit,
        duplicate,
        remove,
      ];
    case 'project':
      return [
        ...open,
        {
          key: 'new-folder',
          label: 'New folder',
          icon: <FolderPlus size={14} />,
          onSelect: () => onAction({ kind: 'new-folder', projectId: node.id, parentId: null }),
        },
        {
          key: 'new-file',
          label: 'New env file',
          icon: <FileCode2 size={14} />,
          onSelect: () => onAction({ kind: 'new-file', projectId: node.id, folderId: null }),
        },
        edit,
        duplicate,
        exportItem,
        remove,
      ];
    case 'folder':
      return [
        ...open,
        {
          key: 'new-folder',
          label: 'New subfolder',
          icon: <FolderPlus size={14} />,
          onSelect: () =>
            onAction({ kind: 'new-folder', projectId: node.projectId ?? '', parentId: node.id }),
        },
        {
          key: 'new-file',
          label: 'New env file',
          icon: <FileCode2 size={14} />,
          onSelect: () =>
            onAction({ kind: 'new-file', projectId: node.projectId ?? '', folderId: node.id }),
        },
        edit,
        duplicate,
        exportItem,
        remove,
      ];
    default:
      return [...open, edit, duplicate, exportItem, remove];
  }
}
