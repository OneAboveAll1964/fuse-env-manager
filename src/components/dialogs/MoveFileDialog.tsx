import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Copy } from 'lucide-react';
import { folderPath, uniqueName } from '@shared/tree';
import type { EnvFile } from '@shared/types';
import { Button, Input, Modal, Select, useToast } from '@/components/ui';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';

export function MoveFileDialog({
  open,
  file,
  action,
  onClose,
}: {
  open: boolean;
  file: EnvFile | null;
  action: 'move' | 'copy';
  onClose: () => void;
}): JSX.Element {
  const toast = useToast();
  const { data, setData } = useVault();
  const [target, setTarget] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const currentSlot = file ? `${file.projectId}:${file.folderId ?? ''}` : '';

  const options = useMemo(() => {
    const out: Array<{ value: string; label: string; sublabel?: string }> = [];
    for (const project of data.projects) {
      const workspace = data.workspaces.find((w) => w.id === project.workspaceId);
      const base = `${workspace?.name ?? 'Vault'} / ${project.name}`;
      out.push({ value: `${project.id}:`, label: base });
      for (const folder of data.folders.filter((f) => f.projectId === project.id)) {
        out.push({
          value: `${project.id}:${folder.id}`,
          label: `${base} / ${folderPath(data, folder.id).join(' / ')}`,
        });
      }
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return action === 'move' ? out.filter((o) => o.value !== currentSlot) : out;
  }, [data, action, currentSlot]);

  useEffect(() => {
    if (!open || !file) return;
    setName(file.name);
    const sameProject = options.find((o) => o.value.startsWith(`${file.projectId}:`));
    setTarget(sameProject?.value ?? options[0]?.value ?? '');
  }, [open, file, options]);

  const destination = useMemo(() => {
    const separator = target.indexOf(':');
    if (separator < 1) return null;
    return { projectId: target.slice(0, separator), folderId: target.slice(separator + 1) || null };
  }, [target]);

  const finalName = useMemo(() => {
    if (!destination) return name.trim();
    const taken = data.files
      .filter(
        (f) =>
          f.projectId === destination.projectId &&
          f.folderId === destination.folderId &&
          f.id !== (action === 'move' ? file?.id : ''),
      )
      .map((f) => f.name);
    return uniqueName(name.trim() || file?.name || '.env', taken);
  }, [destination, name, data, file, action]);

  const renamed = name.trim() !== '' && finalName !== name.trim();

  const submit = async (): Promise<void> => {
    if (!file || !destination) return;
    setBusy(true);
    try {
      const bridge = getBridge();
      if (action === 'move') {
        setData(
          await bridge.files.move(file.id, destination.projectId, destination.folderId, name),
        );
      } else {
        setData(
          (await bridge.files.copyTo(file.id, destination.projectId, destination.folderId, name))
            .data,
        );
      }
      const place = options.find((o) => o.value === target)?.label ?? 'its new place';
      toast.success(
        action === 'move' ? `${file.name} moved` : `${file.name} copied`,
        `Now in ${place} as ${finalName}.`,
      );
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
      eyebrow={action === 'move' ? 'Move' : 'Copy'}
      title={`${action === 'move' ? 'Move' : 'Copy'} ${file?.name ?? 'file'}`}
      description={
        action === 'move'
          ? 'The file and everything in it goes to the new place. History stays with it.'
          : 'A full copy is made there, variables included. The original stays put.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!destination}
            iconLeft={action === 'move' ? <ArrowRight size={15} /> : <Copy size={15} />}
            onClick={() => void submit()}
          >
            {action === 'move' ? 'Move here' : 'Copy here'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Destination"
          value={target}
          onChange={setTarget}
          searchable
          emptyText="There is nowhere else to put it yet"
          options={options}
        />
        <Input
          label="Name there"
          value={name}
          onChange={(e) => setName(e.target.value)}
          hint={
            renamed
              ? `A file with this name is already there, so it becomes ${finalName}.`
              : undefined
          }
        />
      </div>
    </Modal>
  );
}
