import { useEffect, useState } from 'react';
import { WORKSPACE_ICONS } from '@shared/defaults';
import type { Tone, Workspace } from '@shared/types';
import { Button, Input, Modal, Textarea, useToast } from '@/components/ui';
import { IconPicker, TonePicker } from '@/components/dialogs/TonePicker';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';

export function WorkspaceDialog({
  open,
  workspace,
  onClose,
}: {
  open: boolean;
  workspace: Workspace | null;
  onClose: () => void;
}): JSX.Element {
  const toast = useToast();
  const { setData } = useVault();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState<Tone>('brand');
  const [icon, setIcon] = useState('Building2');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(workspace?.name ?? '');
    setDescription(workspace?.description ?? '');
    setTone(workspace?.tone ?? 'brand');
    setIcon(workspace?.icon ?? 'Building2');
  }, [open, workspace]);

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      toast.warning('The workspace needs a name');
      return;
    }
    setBusy(true);
    try {
      if (workspace) {
        const next = await getBridge().workspaces.update(workspace.id, {
          name: name.trim(),
          description: description.trim(),
          tone,
          icon,
        });
        setData(next);
        toast.success('Workspace updated');
      } else {
        const result = await getBridge().workspaces.create({
          name: name.trim(),
          description: description.trim(),
          tone,
          icon,
        });
        setData(result.data);
        toast.success('Workspace created', 'Add a project to start storing variables.');
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
      eyebrow="Workspace"
      title={workspace ? 'Edit workspace' : 'New workspace'}
      description="Workspaces keep separate clients or companies apart. Nothing is shared between them."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            {workspace ? 'Save changes' : 'Create workspace'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Name"
          value={name}
          autoFocus
          placeholder="Acme Studio"
          onChange={(e) => setName(e.target.value)}
        />
        <Textarea
          label="Description"
          value={description}
          rows={2}
          placeholder="What this workspace is for"
          onChange={(e) => setDescription(e.target.value)}
        />
        <TonePicker value={tone} onChange={setTone} />
        <IconPicker value={icon} onChange={setIcon} names={WORKSPACE_ICONS} />
      </div>
    </Modal>
  );
}
