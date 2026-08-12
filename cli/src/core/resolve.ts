import { filePath, folderPath, foldersOf, filesOf, projectsOf, workspacesOf } from '@shared/tree';
import type { EnvFile, EnvFolder, Id, Project, VaultData, Workspace } from '@shared/types';
import { c } from '../ui/colors';
import { isInteractive, select, type Choice } from '../ui/prompt';

export function describeFile(data: VaultData, fileId: Id): string {
  return filePath(data, fileId);
}

function segments(spec: string): string[] {
  return spec
    .split(/[/\\]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function findFiles(data: VaultData, spec: string): EnvFile[] {
  const parts = segments(spec);
  if (parts.length === 0) return [];
  const wanted = parts.map((p) => p.toLowerCase());

  return data.files.filter((file) => {
    const project = data.projects.find((p) => p.id === file.projectId);
    if (!project) return false;
    const workspace = data.workspaces.find((w) => w.id === project.workspaceId);
    const full = [
      workspace?.name ?? '',
      project.name,
      ...folderPath(data, file.folderId),
      file.name,
    ].map((s) => s.toLowerCase());

    let cursor = 0;
    for (const part of wanted) {
      const index = full.indexOf(part, cursor);
      if (index === -1) return false;
      cursor = index + 1;
    }
    return wanted[wanted.length - 1] === full[full.length - 1] || wanted.length < full.length;
  });
}

export function findFile(data: VaultData, spec: string): EnvFile | null {
  const matches = findFiles(data, spec);
  if (matches.length === 1) return matches[0];
  const exact = matches.find(
    (file) => filePath(data, file.id).toLowerCase() === spec.toLowerCase(),
  );
  return exact ?? null;
}

export function findProject(data: VaultData, spec: string): Project | null {
  const parts = segments(spec);
  const name = parts[parts.length - 1]?.toLowerCase();
  if (!name) return null;
  return (
    data.projects.find((p) => p.name.toLowerCase() === name) ??
    data.projects.find((p) => p.name.toLowerCase().includes(name)) ??
    null
  );
}

export async function pickWorkspace(
  data: VaultData,
  message = 'Which workspace?',
): Promise<Workspace | null> {
  const list = workspacesOf(data);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  const id = await select<Id>(
    message,
    list.map<Choice<Id>>((workspace) => ({
      value: workspace.id,
      label: workspace.name,
      hint: `${data.projects.filter((p) => p.workspaceId === workspace.id).length} projects`,
    })),
  );
  return list.find((w) => w.id === id) ?? null;
}

export async function pickProject(
  data: VaultData,
  workspaceId: Id,
  message = 'Which project?',
): Promise<Project | null> {
  const list = projectsOf(data, workspaceId);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  const id = await select<Id>(
    message,
    list.map<Choice<Id>>((project) => ({
      value: project.id,
      label: project.name,
      hint:
        project.description ||
        `${data.files.filter((f) => f.projectId === project.id).length} files`,
    })),
  );
  return list.find((p) => p.id === id) ?? null;
}

export async function pickFolder(
  data: VaultData,
  projectId: Id,
  message = 'Which folder?',
  allowRoot = true,
): Promise<EnvFolder | null> {
  const choices: Choice<Id | null>[] = [];
  if (allowRoot) {
    choices.push({ value: null, label: c.grey('(project root)'), hint: 'files not in a folder' });
  }

  const walk = (parentId: Id | null, depth: number): void => {
    for (const folder of foldersOf(data, projectId, parentId)) {
      const count = filesOf(data, projectId, folder.id).length;
      choices.push({
        value: folder.id,
        label: `${'  '.repeat(depth)}${folder.name}`,
        hint: `${count} files`,
      });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);

  if (choices.length === 0) return null;
  if (choices.length === 1 && choices[0].value === null) return null;
  if (!isInteractive()) return null;

  const id = await select<Id | null>(message, choices);
  return id ? (data.folders.find((f) => f.id === id) ?? null) : null;
}

export async function pickFile(
  data: VaultData,
  message = 'Which env file?',
  filter?: (file: EnvFile) => boolean,
): Promise<EnvFile | null> {
  const list = data.files.filter((file) => (filter ? filter(file) : true));
  if (list.length === 0) return null;

  const choices = list
    .map<Choice<Id>>((file) => ({
      value: file.id,
      label: filePath(data, file.id),
      hint: `${data.vars.filter((v) => v.fileId === file.id).length} vars`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const id = await select<Id>(message, choices, { filterable: true });
  return list.find((f) => f.id === id) ?? null;
}

export async function pickFileGuided(data: VaultData): Promise<EnvFile | null> {
  const workspace = await pickWorkspace(data);
  if (!workspace) return null;
  const project = await pickProject(data, workspace.id);
  if (!project) return null;

  const files = data.files.filter((f) => f.projectId === project.id);
  if (files.length === 0) return null;
  if (files.length === 1) return files[0];

  const choices = files
    .map<Choice<Id>>((file) => {
      const folder = folderPath(data, file.folderId).join(' / ');
      return {
        value: file.id,
        label: folder ? `${folder} / ${file.name}` : file.name,
        hint: `${data.vars.filter((v) => v.fileId === file.id).length} vars`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const id = await select<Id>('Which env file?', choices);
  return files.find((f) => f.id === id) ?? null;
}
