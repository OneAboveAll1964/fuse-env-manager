import { useEffect, useState } from 'react';
import { FORMATS, FORMAT_LABELS } from '@shared/env-types';
import type { EnvFile, EnvFormat } from '@shared/types';
import { Button, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';

const PRESETS = ['.env', '.env.local', '.env.production', '.env.staging', '.env.test'];

export function FileDialog({
  open,
  file,
  projectId,
  folderId,
  onClose,
  onCreated,
}: {
  open: boolean;
  file: EnvFile | null;
  projectId: string | null;
  folderId: string | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}): JSX.Element {
  const toast = useToast();
  const { data, setData } = useVault();
  const [name, setName] = useState('.env');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<EnvFormat>('dotenv');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(file?.name ?? '.env');
    setDescription(file?.description ?? '');
    setFormat(file?.format ?? data.settings.defaultFormat);
  }, [open, file, data.settings.defaultFormat]);

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      toast.warning('The file needs a name');
      return;
    }
    setBusy(true);
    try {
      if (file) {
        const next = await getBridge().files.update(file.id, {
          name: name.trim(),
          description: description.trim(),
          format,
        });
        setData(next);
        toast.success('File updated');
      } else {
        if (!projectId) {
          toast.warning('Pick a project first');
          return;
        }
        const result = await getBridge().files.create({
          projectId,
          folderId,
          name: name.trim(),
          description: description.trim(),
          format,
        });
        setData(result.data);
        toast.success('File created');
        onCreated?.(result.file.id);
      }
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
      eyebrow="Env file"
      title={file ? 'Edit file' : 'New env file'}
      description="The format decides how this file is rendered when you copy, export or pull it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            {file ? 'Save changes' : 'Create file'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="File name"
          value={name}
          autoFocus
          placeholder=".env"
          onChange={(e) => setName(e.target.value)}
        />
        {!file && (
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setName(preset)}
                className="rounded-lg border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-brand-950/40"
              >
                {preset}
              </button>
            ))}
          </div>
        )}
        <Select
          label="Format"
          value={format}
          onChange={setFormat}
          searchable
          options={FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
        />
        <Textarea
          label="Description"
          value={description}
          rows={2}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </Modal>
  );
}
