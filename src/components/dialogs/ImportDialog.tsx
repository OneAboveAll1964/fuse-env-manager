import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FileUp, Import } from 'lucide-react';
import { FORMATS, FORMAT_LABELS } from '@shared/env-types';
import type { EnvFormat, ImportMode, ImportPreview } from '@shared/types';
import {
  Badge,
  Button,
  Modal,
  SegmentedControl,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  useToast,
} from '@/components/ui';
import { errorMessage, getBridge } from '@/lib/bridge';
import { truncateMiddle } from '@/lib/format';
import { useVault } from '@/lib/vault';

const MODES: Array<{ value: ImportMode; label: string; title: string }> = [
  { value: 'merge', label: 'Merge', title: 'Update matching keys and add new ones' },
  { value: 'skip', label: 'Keep existing', title: 'Only add keys that are missing' },
  { value: 'replace', label: 'Replace all', title: 'Remove every existing key first' },
];

export function ImportDialog({
  open,
  fileId,
  onClose,
}: {
  open: boolean;
  fileId: string | null;
  onClose: () => void;
}): JSX.Element {
  const toast = useToast();
  const { setData, fileById } = useVault();
  const [text, setText] = useState('');
  const [format, setFormat] = useState<EnvFormat | 'auto'>('auto');
  const [mode, setMode] = useState<ImportMode>('merge');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const file = fileById(fileId);

  useEffect(() => {
    if (!open) {
      setText('');
      setPreview(null);
      setFormat('auto');
      setMode('merge');
    }
  }, [open]);

  const refreshPreview = useCallback(
    async (nextText: string, nextFormat: EnvFormat | 'auto'): Promise<void> => {
      if (!fileId || !nextText.trim()) {
        setPreview(null);
        return;
      }
      try {
        setPreview(await getBridge().files.preview(fileId, nextText, nextFormat));
      } catch (err) {
        toast.error('Could not read that content', errorMessage(err));
      }
    },
    [fileId, toast],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshPreview(text, format), 200);
    return () => window.clearTimeout(timer);
  }, [text, format, refreshPreview]);

  const pickFile = async (): Promise<void> => {
    try {
      const picked = await getBridge().transfer.importFromDisk();
      if (!picked) return;
      setText(picked.text);
      toast.info(`Loaded ${picked.name}`);
    } catch (err) {
      toast.error('Could not read that file', errorMessage(err));
    }
  };

  const apply = async (): Promise<void> => {
    if (!fileId || !preview || preview.entries.length === 0) return;
    setBusy(true);
    try {
      const next = await getBridge().vars.bulk({
        fileId,
        mode,
        entries: preview.entries.map((entry) => ({
          key: entry.key,
          value: entry.value,
          type: entry.type,
          secret: entry.secret,
          enabled: entry.enabled,
          note: entry.note,
        })),
      });
      setData(next);
      toast.success(
        `Imported into ${file?.name ?? 'the file'}`,
        `${preview.entries.length} variables were processed.`,
      );
      onClose();
    } catch (err) {
      toast.error('The import failed', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const conflicts = preview?.entries.filter((e) => e.conflict).length ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      eyebrow="Import"
      title={`Import into ${file?.name ?? 'this file'}`}
      description="Paste the contents of an env file, or load one from disk. Fuse works out the types for you."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            iconLeft={<Import size={15} />}
            disabled={!preview || preview.entries.length === 0}
            onClick={() => void apply()}
          >
            Import {preview ? `${preview.entries.length} variables` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Select
              label="Format"
              size="sm"
              value={format}
              onChange={setFormat}
              searchable
              options={[
                { value: 'auto', label: 'Detect automatically' },
                ...FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] })),
              ]}
            />
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
              When a key already exists
            </span>
            <SegmentedControl items={MODES} value={mode} onChange={setMode} size="sm" />
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" iconLeft={<FileUp size={14} />} onClick={() => void pickFile()}>
            Load a file
          </Button>
        </div>

        <Textarea
          value={text}
          rows={8}
          spellCheck={false}
          placeholder={'DATABASE_URL=postgres://localhost:5432/app\nPORT=3000'}
          className="font-mono text-[12px]"
          onChange={(e) => setText(e.target.value)}
        />

        {preview?.errors.length ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              {preview.errors.slice(0, 4).map((error) => (
                <div key={error} className="truncate">
                  {error}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {preview && preview.entries.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] dark:border-slate-800 dark:bg-slate-800/40">
              <span className="font-semibold uppercase tracking-[0.1em] text-slate-500">
                Preview
              </span>
              <Badge variant="brand">{preview.entries.length} keys</Badge>
              {conflicts > 0 && <Badge variant="warning">{conflicts} already exist</Badge>}
              <span className="flex-1" />
              <span className="text-slate-400">{FORMAT_LABELS[preview.format]}</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Key</TH>
                    <TH>Value</TH>
                    <TH>Type</TH>
                    <TH align="end">Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.entries.map((entry) => (
                    <TR key={entry.key}>
                      <TD className="font-mono text-[12px] font-medium text-slate-800 dark:text-slate-100">
                        {entry.key}
                      </TD>
                      <TD className="font-mono text-[12px] text-slate-500 dark:text-slate-400">
                        {entry.secret ? '••••••••' : truncateMiddle(entry.value || '—', 40)}
                      </TD>
                      <TD className="text-[12px] text-slate-500">{entry.type}</TD>
                      <TD align="end">
                        {entry.conflict ? (
                          <Badge variant="warning">
                            {mode === 'skip' ? 'kept' : mode === 'replace' ? 'replaced' : 'updated'}
                          </Badge>
                        ) : (
                          <Badge variant="success">new</Badge>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
