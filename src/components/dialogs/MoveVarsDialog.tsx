import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Copy } from 'lucide-react';
import { filePath } from '@shared/tree';
import type { ImportMode } from '@shared/types';
import { Button, Modal, SegmentedControl, Select, useToast } from '@/components/ui';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';

const MODES: Array<{ value: ImportMode; label: string; title: string }> = [
  { value: 'merge', label: 'Overwrite', title: 'Replace the value when the key already exists' },
  { value: 'skip', label: 'Keep existing', title: 'Leave existing keys untouched' },
];

export function MoveVarsDialog({
  open,
  varIds,
  sourceFileId,
  action,
  onClose,
  onDone,
}: {
  open: boolean;
  varIds: string[];
  sourceFileId: string | null;
  action: 'copy' | 'move';
  onClose: () => void;
  onDone: () => void;
}): JSX.Element {
  const toast = useToast();
  const { data, setData } = useVault();
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () =>
      data.files
        .filter((f) => f.id !== sourceFileId)
        .map((f) => ({ value: f.id, label: f.name, sublabel: filePath(data, f.id) }))
        .sort((a, b) => (a.sublabel ?? '').localeCompare(b.sublabel ?? '')),
    [data, sourceFileId],
  );

  useEffect(() => {
    if (open) {
      setTarget(options[0]?.value ?? '');
      setMode('merge');
    }
  }, [open, options]);

  const submit = async (): Promise<void> => {
    if (!target) return;
    setBusy(true);
    try {
      const bridge = getBridge();
      const next =
        action === 'copy'
          ? await bridge.vars.copyTo(varIds, target, mode)
          : await bridge.vars.moveTo(varIds, target, mode);
      setData(next);
      toast.success(
        action === 'copy' ? 'Variables copied' : 'Variables moved',
        `${varIds.length} variables went to ${data.files.find((f) => f.id === target)?.name ?? 'the file'}.`,
      );
      onDone();
      onClose();
    } catch (err) {
      toast.error('That did not work', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      eyebrow={action === 'copy' ? 'Copy' : 'Move'}
      title={`${action === 'copy' ? 'Copy' : 'Move'} ${varIds.length} variable${varIds.length === 1 ? '' : 's'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!target}
            iconLeft={action === 'copy' ? <Copy size={15} /> : <ArrowRight size={15} />}
            onClick={() => void submit()}
          >
            {action === 'copy' ? 'Copy here' : 'Move here'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Destination file"
          value={target}
          onChange={setTarget}
          searchable
          emptyText="There is nowhere else to put these yet"
          options={options}
        />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
            When a key already exists there
          </span>
          <SegmentedControl items={MODES} value={mode} onChange={setMode} size="sm" />
        </div>
      </div>
    </Modal>
  );
}
