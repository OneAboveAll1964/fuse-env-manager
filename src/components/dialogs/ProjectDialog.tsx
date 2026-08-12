import { useEffect, useState } from 'react';
import { PROJECT_ICONS, STARTER_FOLDERS } from '@shared/defaults';
import type { Project, Tone } from '@shared/types';
import { Button, Input, Modal, Select, Switch, Textarea, useToast } from '@/components/ui';
import { IconPicker, TonePicker } from '@/components/dialogs/TonePicker';
import { errorMessage, getBridge } from '@/lib/bridge';
import { useVault } from '@/lib/vault';

export function ProjectDialog({
  open,
  project,
  workspaceId,
  onClose,
  onCreated,
}: {
  open: boolean;
  project: Project | null;
  workspaceId: string | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}): JSX.Element {
  const toast = useToast();
  const { data, setData } = useVault();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState<Tone>('slate');
  const [icon, setIcon] = useState('Package');
  const [tags, setTags] = useState('');
  const [targetWorkspace, setTargetWorkspace] = useState('');
  const [withStarters, setWithStarters] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? '');
    setDescription(project?.description ?? '');
    setTone(project?.tone ?? 'slate');
    setIcon(project?.icon ?? 'Package');
    setTags(project?.tags.join(', ') ?? '');
    setTargetWorkspace(project?.workspaceId ?? workspaceId ?? data.workspaces[0]?.id ?? '');
    setWithStarters(true);
  }, [open, project, workspaceId, data.workspaces]);

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      toast.warning('The project needs a name');
      return;
    }
    if (!targetWorkspace) {
      toast.warning('Create a workspace first');
      return;
    }
    setBusy(true);
    const parsedTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      if (project) {
        let next = await getBridge().projects.update(project.id, {
          name: name.trim(),
          description: description.trim(),
          tone,
          icon,
          tags: parsedTags,
        });
        if (targetWorkspace !== project.workspaceId) {
          next = await getBridge().projects.move(project.id, targetWorkspace);
        }
        setData(next);
        toast.success('Project updated');
      } else {
        const result = await getBridge().projects.create({
          workspaceId: targetWorkspace,
          name: name.trim(),
          description: description.trim(),
          tone,
          icon,
          tags: parsedTags,
          starterFolders: withStarters ? STARTER_FOLDERS : [],
        });
        setData(result.data);
        toast.success(
          'Project created',
          withStarters ? 'Development, staging and production are ready.' : undefined,
        );
        onCreated?.(result.project.id);
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
      size="lg"
      eyebrow="Project"
      title={project ? 'Edit project' : 'New project'}
      description="A project holds the folders and env files for one codebase."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            {project ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          label="Name"
          value={name}
          autoFocus
          placeholder="Storefront API"
          onChange={(e) => setName(e.target.value)}
        />
        <Select
          label="Workspace"
          value={targetWorkspace}
          onChange={setTargetWorkspace}
          options={data.workspaces.map((w) => ({ value: w.id, label: w.name }))}
        />
        <div className="md:col-span-2">
          <Textarea
            label="Description"
            value={description}
            rows={2}
            placeholder="What this project is"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <Input
            label="Tags"
            value={tags}
            placeholder="node, api, internal"
            hint="Separate tags with commas"
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <TonePicker value={tone} onChange={setTone} />
        <IconPicker value={icon} onChange={setIcon} names={PROJECT_ICONS} />
        {!project && (
          <div className="md:col-span-2">
            <Switch
              checked={withStarters}
              onChange={setWithStarters}
              size="sm"
              label="Create the usual environment folders"
              description={`Adds ${STARTER_FOLDERS.join(', ')}, each with an empty .env file.`}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
