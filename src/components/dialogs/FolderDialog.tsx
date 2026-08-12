import { useEffect, useState } from 'react';
import type { EnvFolder, Tone } from '@shared/types';
import { Button, Input, Modal, Textarea, useToast } from '@/components/ui';
import { TonePicker } from '@/components/dialogs/TonePicker';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';

export function FolderDialog({
  open,
  folder,
  projectId,
  parentId,
  onClose,
  onCreated,
}: {
  open: boolean;
  folder: EnvFolder | null;
  projectId: string | null;
  parentId: string | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}): JSX.Element {
  const toast = useToast();
  const { setData } = useVault();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState<Tone>('slate');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(folder?.name ?? '');
    setDescription(folder?.description ?? '');
    setTone(folder?.tone ?? 'slate');
  }, [open, folder]);

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      toast.warning('The folder needs a name');
      return;
    }
    setBusy(true);
    try {
      if (folder) {
        const next = await getBridge().folders.update(folder.id, {
          name: name.trim(),
          description: description.trim(),
          tone,
        });
        setData(next);
        toast.success('Folder updated');
      } else {
        if (!projectId) {
          toast.warning('Pick a project first');
          return;
        }
        const result = await getBridge().folders.create({
          projectId,
          parentId,
          name: name.trim(),
          description: description.trim(),
          tone,
        });
        setData(result.data);
        toast.success('Folder created');
        onCreated?.(result.folder.id);
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
      eyebrow="Folder"
      title={folder ? 'Edit folder' : 'New folder'}
      description="Folders group env files, usually one per environment. They can be nested."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            {folder ? 'Save changes' : 'Create folder'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Name"
          value={name}
          autoFocus
          placeholder="production"
          onChange={(e) => setName(e.target.value)}
        />
        <Textarea
          label="Description"
          value={description}
          rows={2}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TonePicker value={tone} onChange={setTone} />
      </div>
    </Modal>
  );
}
