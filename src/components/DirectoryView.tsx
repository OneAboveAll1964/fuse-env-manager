import { useState } from 'react';
import clsx from 'clsx';
import { FileCode2, Folder, KeyRound, Package } from 'lucide-react';
import { FORMAT_LABELS } from '@shared/env-types';
import type { TreeNode } from '@shared/types';
import { Badge, Menu, Table, TBody, TD, TH, THead, TR } from '@/components/ui';
import { nodeMenuItems, type TreeAction } from '@/components/nodeActions';
import { TONE_CLASSES, pluralise } from '@/lib/format';
import { iconByName } from '@/lib/icons';

function holds(node: TreeNode): string {
  if (node.kind === 'file') return pluralise(node.varCount, 'variable');
  const folders = node.children.filter((c) => c.kind !== 'file').length;
  const files = node.children.filter((c) => c.kind === 'file').length;
  return [folders > 0 ? pluralise(folders, 'folder') : null, pluralise(files, 'file')]
    .filter(Boolean)
    .join(', ');
}

export function DirectoryView({
  nodes,
  selectedFileId,
  onOpen,
  onAction,
}: {
  nodes: TreeNode[];
  selectedFileId: string | null;
  onOpen: (node: TreeNode) => void;
  onAction: (action: TreeAction) => void;
}): JSX.Element {
  const [focused, setFocused] = useState<string | null>(null);

  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-full max-w-0">Name</TH>
          <TH className="w-28">Kind</TH>
          <TH className="w-40">Holds</TH>
          <TH className="w-24">Secrets</TH>
          <TH align="end" className="w-16" />
        </TR>
      </THead>
      <TBody>
        {nodes.map((node) => {
          const isFile = node.kind === 'file';
          const Icon = isFile
            ? FileCode2
            : node.kind === 'folder'
              ? Folder
              : iconByName(node.icon, Package);
          const tone = TONE_CLASSES[node.tone];
          const active = focused === node.id || (isFile && node.id === selectedFileId);

          return (
            <TR
              key={node.id}
              clickable
              className={clsx(active && 'bg-brand-50/60 dark:bg-brand-950/20')}
              onClick={() => setFocused(node.id)}
              onDoubleClick={() => onOpen(node)}
            >
              <TD className="w-full max-w-0">
                <div className="flex items-center gap-2.5">
                  <span
                    className={clsx(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      isFile
                        ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        : `${tone.bar} text-white`,
                    )}
                  >
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={clsx(
                        'block truncate text-[13px] text-slate-800 dark:text-slate-100',
                        isFile ? 'mono-value' : 'font-medium',
                      )}
                    >
                      {node.name}
                    </span>
                    {!isFile && node.children.length === 0 && (
                      <span className="block truncate text-[11px] text-slate-400">empty</span>
                    )}
                  </span>
                </div>
              </TD>
              <TD>
                <Badge variant="neutral" className="whitespace-nowrap">
                  {isFile ? FORMAT_LABELS[node.format ?? 'dotenv'] : node.kind}
                </Badge>
              </TD>
              <TD className="text-[12px] text-slate-500 dark:text-slate-400">{holds(node)}</TD>
              <TD>
                {node.secretCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[12px] text-accent-700 dark:text-accent-300">
                    <KeyRound size={11} />
                    {node.secretCount}
                  </span>
                ) : (
                  <span className="text-[12px] text-slate-300 dark:text-slate-600">—</span>
                )}
              </TD>
              <TD align="end">
                <div onClick={(event) => event.stopPropagation()}>
                  <Menu
                    label={`${node.name} actions`}
                    className="h-7 w-7 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                    items={nodeMenuItems(node, onAction, { includeOpen: true })}
                  />
                </div>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
