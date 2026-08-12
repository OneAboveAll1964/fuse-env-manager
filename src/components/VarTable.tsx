import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Copy, Eye, EyeOff, KeyRound, Pencil, Trash2, X } from 'lucide-react';
import { VAR_TYPE_LABELS, validateValue } from '@shared/env-types';
import type { EnvVar } from '@shared/types';
import { Badge, Menu, Table, TBody, TD, TH, THead, TR } from '@/components/ui';
import { maskValue, truncateMiddle } from '@/lib/format';

export function VarTable({
  vars,
  dense,
  maskSecrets,
  selected,
  revealed,
  onToggleSelected,
  onToggleAll,
  onToggleReveal,
  onCopy,
  onEdit,
  onDelete,
  onToggleEnabled,
  onInlineSave,
}: {
  vars: EnvVar[];
  dense: boolean;
  maskSecrets: boolean;
  selected: string[];
  revealed: string[];
  onToggleSelected: (id: string) => void;
  onToggleAll: () => void;
  onToggleReveal: (id: string) => void;
  onCopy: (variable: EnvVar) => void;
  onEdit: (variable: EnvVar) => void;
  onDelete: (variable: EnvVar) => void;
  onToggleEnabled: (variable: EnvVar) => void;
  onInlineSave: (variable: EnvVar, value: string) => void;
}): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  const allSelected = vars.length > 0 && selected.length === vars.length;
  const cellPadding = dense ? 'py-1.5' : 'py-3';

  const startEdit = (variable: EnvVar): void => {
    if (variable.value.includes('\n')) {
      onEdit(variable);
      return;
    }
    setEditingId(variable.id);
    setDraft(variable.value);
  };

  const commit = (variable: EnvVar): void => {
    setEditingId(null);
    if (draft !== variable.value) onInlineSave(variable, draft);
  };

  const rows = useMemo(() => vars, [vars]);

  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-9">
            <button
              type="button"
              onClick={onToggleAll}
              aria-label="Select all"
              className={clsx(
                'flex h-4 w-4 items-center justify-center rounded border transition-colors',
                allSelected
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-300 dark:border-slate-600',
              )}
            >
              {allSelected && <Check size={10} />}
            </button>
          </TH>
          <TH className="w-56">Key</TH>
          <TH className="w-full max-w-0">Value</TH>
          <TH className="w-28">Type</TH>
          <TH align="end" className="w-28">
            Actions
          </TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((variable) => {
          const isSelected = selected.includes(variable.id);
          const isRevealed = revealed.includes(variable.id);
          const hide = variable.secret && maskSecrets && !isRevealed;
          const check = validateValue(variable.type, variable.value, variable.options);
          const editing = editingId === variable.id;

          return (
            <TR
              key={variable.id}
              className={clsx(
                isSelected && 'bg-brand-50/60 dark:bg-brand-950/20',
                !variable.enabled && 'opacity-55',
              )}
            >
              <TD className={cellPadding}>
                <button
                  type="button"
                  onClick={() => onToggleSelected(variable.id)}
                  aria-label={`Select ${variable.key}`}
                  className={clsx(
                    'flex h-4 w-4 items-center justify-center rounded border transition-colors',
                    isSelected
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-300 dark:border-slate-600',
                  )}
                >
                  {isSelected && <Check size={10} />}
                </button>
              </TD>

              <TD className={clsx(cellPadding, 'w-56')}>
                <div className="flex items-center gap-1.5">
                  {variable.secret && (
                    <KeyRound size={11} className="shrink-0 text-accent-600 dark:text-accent-400" />
                  )}
                  <span
                    className={clsx(
                      'mono-value truncate text-[12.5px] font-medium',
                      variable.enabled
                        ? 'text-slate-800 dark:text-slate-100'
                        : 'text-slate-500 line-through dark:text-slate-400',
                    )}
                  >
                    {variable.key}
                  </span>
                </div>
                {variable.note && (
                  <div className="mt-0.5 truncate text-[11px] text-slate-400">{variable.note}</div>
                )}
              </TD>

              <TD className={clsx(cellPadding, 'w-full max-w-0')}>
                {editing ? (
                  <input
                    ref={inputRef}
                    value={draft}
                    spellCheck={false}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commit(variable)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') {
                        setDraft(variable.value);
                        setEditingId(null);
                      }
                    }}
                    className="mono-value h-8 w-full rounded-lg border border-brand-500 bg-white px-2 text-[12.5px] text-slate-900 outline-none ring-4 ring-brand-500/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                ) : (
                  <button
                    type="button"
                    onDoubleClick={() => startEdit(variable)}
                    onClick={() => startEdit(variable)}
                    title="Click to edit"
                    className="block w-full text-start"
                  >
                    <span
                      className={clsx(
                        'mono-value block truncate text-[12.5px]',
                        hide ? 'text-slate-400' : 'text-slate-600 dark:text-slate-300',
                        !check.ok && 'text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {variable.value === ''
                        ? '—'
                        : hide
                          ? maskValue(variable.value)
                          : truncateMiddle(variable.value.replace(/\n/g, '⏎ '), 72)}
                    </span>
                  </button>
                )}
                {!check.ok && (
                  <div className="mt-0.5 truncate text-[11px] text-rose-500">{check.message}</div>
                )}
              </TD>

              <TD className={cellPadding}>
                <Badge
                  variant={variable.secret ? 'accent' : 'neutral'}
                  className="whitespace-nowrap"
                >
                  {VAR_TYPE_LABELS[variable.type]}
                </Badge>
              </TD>

              <TD align="end" className={cellPadding}>
                <div className="flex items-center justify-end gap-0.5">
                  {variable.secret && (
                    <button
                      type="button"
                      onClick={() => onToggleReveal(variable.id)}
                      title={isRevealed ? 'Hide' : 'Reveal'}
                      aria-label={isRevealed ? 'Hide' : 'Reveal'}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                    >
                      {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onCopy(variable)}
                    title="Copy value"
                    aria-label="Copy value"
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                  >
                    <Copy size={13} />
                  </button>
                  <Menu
                    label={`${variable.key} actions`}
                    className="h-7 w-7 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                    items={[
                      {
                        key: 'edit',
                        label: 'Edit',
                        icon: <Pencil size={14} />,
                        onSelect: () => onEdit(variable),
                      },
                      {
                        key: 'toggle',
                        label: variable.enabled ? 'Comment out' : 'Activate',
                        icon: variable.enabled ? <X size={14} /> : <Check size={14} />,
                        onSelect: () => onToggleEnabled(variable),
                      },
                      {
                        key: 'delete',
                        label: 'Delete',
                        icon: <Trash2 size={14} />,
                        danger: true,
                        separatorBefore: true,
                        onSelect: () => onDelete(variable),
                      },
                    ]}
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
