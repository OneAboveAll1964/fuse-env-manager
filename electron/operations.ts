import { DEFAULT_SETTINGS, STARTER_FOLDERS } from '../shared/defaults';
import { DEFAULT_SERIALIZE_OPTIONS, parseText, serialize } from '../shared/codecs';
import { looksSecret, suggestType } from '../shared/env-types';
import {
  descendantFolderIds,
  filePath,
  folderFullPath,
  nextOrder,
  projectFullPath,
  uniqueName,
  varsOf,
} from '../shared/tree';
import type {
  AppSettings,
  ChangeSource,
  EnvFile,
  EnvFolder,
  EnvFormat,
  EnvVar,
  Id,
  ImportMode,
  ImportPreview,
  Project,
  Revision,
  VaultData,
  Workspace,
} from '../shared/types';
import type {
  BulkVarInput,
  FileInput,
  FolderInput,
  ProjectInput,
  RenderOptions,
  VarInput,
  WorkspaceInput,
} from '../shared/bridge';
import {
  type Snapshot,
  applySnapshot,
  mutate,
  newId,
  nowIso,
  parseSnapshot,
  record,
  removeSnapshot,
  requireUnlocked,
} from './vault';

function notFound(what: string): never {
  throw new Error(`That ${what} no longer exists`);
}

function cascadeForFile(data: VaultData, file: EnvFile): Snapshot {
  return { files: [file], vars: data.vars.filter((v) => v.fileId === file.id) };
}

function cascadeForFolder(data: VaultData, folder: EnvFolder): Snapshot {
  const folderIds = new Set(descendantFolderIds(data, folder.id));
  const folders = data.folders.filter((f) => folderIds.has(f.id));
  const files = data.files.filter((f) => f.folderId && folderIds.has(f.folderId));
  const fileIds = new Set(files.map((f) => f.id));
  return { folders, files, vars: data.vars.filter((v) => fileIds.has(v.fileId)) };
}

function cascadeForProject(data: VaultData, project: Project): Snapshot {
  const folders = data.folders.filter((f) => f.projectId === project.id);
  const files = data.files.filter((f) => f.projectId === project.id);
  const fileIds = new Set(files.map((f) => f.id));
  return {
    projects: [project],
    folders,
    files,
    vars: data.vars.filter((v) => fileIds.has(v.fileId)),
  };
}

function cascadeForWorkspace(data: VaultData, workspace: Workspace): Snapshot {
  const projects = data.projects.filter((p) => p.workspaceId === workspace.id);
  const projectIds = new Set(projects.map((p) => p.id));
  const folders = data.folders.filter((f) => projectIds.has(f.projectId));
  const files = data.files.filter((f) => projectIds.has(f.projectId));
  const fileIds = new Set(files.map((f) => f.id));
  return {
    workspaces: [workspace],
    projects,
    folders,
    files,
    vars: data.vars.filter((v) => fileIds.has(v.fileId)),
  };
}

export function saveSettings(settings: AppSettings): Promise<VaultData> {
  return mutate((data) => {
    data.settings = { ...DEFAULT_SETTINGS, ...settings };
  });
}

export async function createWorkspace(
  input: WorkspaceInput,
  source: ChangeSource = 'app',
): Promise<{ data: VaultData; workspace: Workspace }> {
  const id = newId();
  const data = await mutate((draft) => {
    const workspace: Workspace = {
      id,
      name: uniqueName(input.name.trim() || 'Workspace', draft.workspaces.map((w) => w.name)),
      description: input.description ?? '',
      tone: input.tone ?? 'brand',
      icon: input.icon ?? 'Building2',
      order: nextOrder(draft.workspaces),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    draft.workspaces.push(workspace);
    if (!draft.settings.activeWorkspaceId) draft.settings.activeWorkspaceId = workspace.id;
    record(draft, {
      kind: 'create',
      entity: 'workspace',
      entityId: workspace.id,
      label: workspace.name,
      path: workspace.name,
      before: null,
      after: { workspaces: [workspace] },
      source,
    });
  });
  const workspace = data.workspaces.find((w) => w.id === id);
  if (!workspace) notFound('workspace');
  return { data, workspace };
}

export function updateWorkspace(id: Id, patch: Partial<Workspace>): Promise<VaultData> {
  return mutate((data) => {
    const index = data.workspaces.findIndex((w) => w.id === id);
    if (index === -1) notFound('workspace');
    const before = { ...data.workspaces[index] };
    const next: Workspace = { ...before, ...patch, id, updatedAt: nowIso() };
    data.workspaces[index] = next;
    record(data, {
      kind: patch.name && patch.name !== before.name ? 'rename' : 'update',
      entity: 'workspace',
      entityId: id,
      label: next.name,
      path: next.name,
      before: { workspaces: [before] },
      after: { workspaces: [next] },
    });
  });
}

export function removeWorkspace(id: Id): Promise<VaultData> {
  return mutate((data) => {
    const workspace = data.workspaces.find((w) => w.id === id);
    if (!workspace) notFound('workspace');
    const snapshot = cascadeForWorkspace(data, workspace);
    removeSnapshot(data, snapshot);
    if (data.settings.activeWorkspaceId === id) {
      data.settings.activeWorkspaceId = data.workspaces[0]?.id ?? null;
    }
    record(data, {
      kind: 'delete',
      entity: 'workspace',
      entityId: id,
      label: workspace.name,
      path: workspace.name,
      before: snapshot,
      after: null,
    });
  });
}

export function reorderWorkspaces(ids: Id[]): Promise<VaultData> {
  return mutate((data) => {
    ids.forEach((id, index) => {
      const workspace = data.workspaces.find((w) => w.id === id);
      if (workspace) workspace.order = index;
    });
  });
}

export async function duplicateWorkspace(
  id: Id,
  name: string,
): Promise<{ data: VaultData; workspace: Workspace }> {
  const newWorkspaceId = newId();
  const data = await mutate((draft) => {
    const source = draft.workspaces.find((w) => w.id === id);
    if (!source) notFound('workspace');
    const workspace: Workspace = {
      ...source,
      id: newWorkspaceId,
      name: uniqueName(name, draft.workspaces.map((w) => w.name)),
      order: nextOrder(draft.workspaces),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    draft.workspaces.push(workspace);

    for (const project of draft.projects.filter((p) => p.workspaceId === id)) {
      cloneProjectInto(draft, project, newWorkspaceId, project.name);
    }
    record(draft, {
      kind: 'duplicate',
      entity: 'workspace',
      entityId: workspace.id,
      label: workspace.name,
      path: workspace.name,
      before: null,
      after: { workspaces: [workspace] },
    });
  });
  const workspace = data.workspaces.find((w) => w.id === newWorkspaceId);
  if (!workspace) notFound('workspace');
  return { data, workspace };
}

function cloneProjectInto(
  data: VaultData,
  source: Project,
  workspaceId: Id,
  name: string,
): Project {
  const project: Project = {
    ...source,
    id: newId(),
    workspaceId,
    name: uniqueName(
      name,
      data.projects.filter((p) => p.workspaceId === workspaceId).map((p) => p.name),
    ),
    links: [],
    order: nextOrder(data.projects.filter((p) => p.workspaceId === workspaceId)),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  data.projects.push(project);

  const folderMap = new Map<Id, Id>();
  for (const folder of data.folders.filter((f) => f.projectId === source.id)) {
    folderMap.set(folder.id, newId());
  }
  for (const folder of data.folders.filter((f) => f.projectId === source.id)) {
    data.folders.push({
      ...folder,
      id: folderMap.get(folder.id) ?? newId(),
      projectId: project.id,
      parentId: folder.parentId ? (folderMap.get(folder.parentId) ?? null) : null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  for (const file of data.files.filter((f) => f.projectId === source.id)) {
    const cloned: EnvFile = {
      ...file,
      id: newId(),
      projectId: project.id,
      folderId: file.folderId ? (folderMap.get(file.folderId) ?? null) : null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    data.files.push(cloned);
    for (const variable of data.vars.filter((v) => v.fileId === file.id)) {
      data.vars.push({ ...variable, id: newId(), fileId: cloned.id, createdAt: nowIso(), updatedAt: nowIso() });
    }
  }
  return project;
}

export async function createProject(
  input: ProjectInput,
  source: ChangeSource = 'app',
): Promise<{ data: VaultData; project: Project }> {
  const id = newId();
  const data = await mutate((draft) => {
    const workspace = draft.workspaces.find((w) => w.id === input.workspaceId);
    if (!workspace) notFound('workspace');
    const siblings = draft.projects.filter((p) => p.workspaceId === input.workspaceId);
    const project: Project = {
      id,
      workspaceId: input.workspaceId,
      name: uniqueName(input.name.trim() || 'Project', siblings.map((p) => p.name)),
      description: input.description ?? '',
      tone: input.tone ?? 'slate',
      icon: input.icon ?? 'Package',
      tags: input.tags ?? [],
      links: [],
      order: nextOrder(siblings),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    draft.projects.push(project);

    const starters = input.starterFolders ?? STARTER_FOLDERS;
    starters.forEach((folderName, index) => {
      const folder: EnvFolder = {
        id: newId(),
        projectId: project.id,
        parentId: null,
        name: folderName,
        description: '',
        tone: folderName === 'production' ? 'rose' : folderName === 'staging' ? 'amber' : 'emerald',
        order: index,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      draft.folders.push(folder);
      draft.files.push({
        id: newId(),
        projectId: project.id,
        folderId: folder.id,
        name: '.env',
        description: '',
        format: draft.settings.defaultFormat,
        order: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    });

    record(draft, {
      kind: 'create',
      entity: 'project',
      entityId: project.id,
      label: project.name,
      path: `${workspace.name} / ${project.name}`,
      before: null,
      after: { projects: [project] },
      source,
    });
  });
  const project = data.projects.find((p) => p.id === id);
  if (!project) notFound('project');
  return { data, project };
}

export function updateProject(id: Id, patch: Partial<Project>): Promise<VaultData> {
  return mutate((data) => {
    const index = data.projects.findIndex((p) => p.id === id);
    if (index === -1) notFound('project');
    const before = { ...data.projects[index] };
    const next: Project = { ...before, ...patch, id, updatedAt: nowIso() };
    data.projects[index] = next;
    record(data, {
      kind: patch.name && patch.name !== before.name ? 'rename' : 'update',
      entity: 'project',
      entityId: id,
      label: next.name,
      path: projectFullPath(data, id),
      before: { projects: [before] },
      after: { projects: [next] },
    });
  });
}

export function removeProject(id: Id): Promise<VaultData> {
  return mutate((data) => {
    const project = data.projects.find((p) => p.id === id);
    if (!project) notFound('project');
    const path = projectFullPath(data, id);
    const snapshot = cascadeForProject(data, project);
    removeSnapshot(data, snapshot);
    record(data, {
      kind: 'delete',
      entity: 'project',
      entityId: id,
      label: project.name,
      path,
      before: snapshot,
      after: null,
    });
  });
}

export async function duplicateProject(
  id: Id,
  name: string,
  workspaceId: Id,
): Promise<{ data: VaultData; project: Project }> {
  let createdId = '';
  const data = await mutate((draft) => {
    const source = draft.projects.find((p) => p.id === id);
    if (!source) notFound('project');
    const project = cloneProjectInto(draft, source, workspaceId, name);
    createdId = project.id;
    record(draft, {
      kind: 'duplicate',
      entity: 'project',
      entityId: project.id,
      label: project.name,
      path: projectFullPath(draft, project.id),
      before: null,
      after: { projects: [project] },
    });
  });
  const project = data.projects.find((p) => p.id === createdId);
  if (!project) notFound('project');
  return { data, project };
}

export function moveProject(id: Id, workspaceId: Id): Promise<VaultData> {
  return mutate((data) => {
    const project = data.projects.find((p) => p.id === id);
    if (!project) notFound('project');
    const before = { ...project };
    project.workspaceId = workspaceId;
    project.order = nextOrder(data.projects.filter((p) => p.workspaceId === workspaceId));
    project.updatedAt = nowIso();
    record(data, {
      kind: 'move',
      entity: 'project',
      entityId: id,
      label: project.name,
      path: projectFullPath(data, id),
      before: { projects: [before] },
      after: { projects: [{ ...project }] },
    });
  });
}

export function linkProjectPath(id: Id, target: string): Promise<VaultData> {
  return mutate((data) => {
    const project = data.projects.find((p) => p.id === id);
    if (!project) notFound('project');
    if (!project.links.includes(target)) project.links.push(target);
    project.updatedAt = nowIso();
  });
}

export function unlinkProjectPath(id: Id, target: string): Promise<VaultData> {
  return mutate((data) => {
    const project = data.projects.find((p) => p.id === id);
    if (!project) notFound('project');
    project.links = project.links.filter((l) => l !== target);
    project.updatedAt = nowIso();
  });
}

export async function createFolder(
  input: FolderInput,
  source: ChangeSource = 'app',
): Promise<{ data: VaultData; folder: EnvFolder }> {
  const id = newId();
  const data = await mutate((draft) => {
    const project = draft.projects.find((p) => p.id === input.projectId);
    if (!project) notFound('project');
    const siblings = draft.folders.filter(
      (f) => f.projectId === input.projectId && f.parentId === input.parentId,
    );
    const folder: EnvFolder = {
      id,
      projectId: input.projectId,
      parentId: input.parentId,
      name: uniqueName(input.name.trim() || 'folder', siblings.map((f) => f.name)),
      description: input.description ?? '',
      tone: input.tone ?? 'slate',
      order: nextOrder(siblings),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    draft.folders.push(folder);
    record(draft, {
      kind: 'create',
      entity: 'folder',
      entityId: folder.id,
      label: folder.name,
      path: folderFullPath(draft, folder.id),
      before: null,
      after: { folders: [folder] },
      source,
    });
  });
  const folder = data.folders.find((f) => f.id === id);
  if (!folder) notFound('folder');
  return { data, folder };
}

export function updateFolder(id: Id, patch: Partial<EnvFolder>): Promise<VaultData> {
  return mutate((data) => {
    const index = data.folders.findIndex((f) => f.id === id);
    if (index === -1) notFound('folder');
    const before = { ...data.folders[index] };
    const next: EnvFolder = { ...before, ...patch, id, updatedAt: nowIso() };
    data.folders[index] = next;
    record(data, {
      kind: patch.name && patch.name !== before.name ? 'rename' : 'update',
      entity: 'folder',
      entityId: id,
      label: next.name,
      path: folderFullPath(data, id),
      before: { folders: [before] },
      after: { folders: [next] },
    });
  });
}

export function removeFolder(id: Id): Promise<VaultData> {
  return mutate((data) => {
    const folder = data.folders.find((f) => f.id === id);
    if (!folder) notFound('folder');
    const path = folderFullPath(data, id);
    const snapshot = cascadeForFolder(data, folder);
    removeSnapshot(data, snapshot);
    record(data, {
      kind: 'delete',
      entity: 'folder',
      entityId: id,
      label: folder.name,
      path,
      before: snapshot,
      after: null,
    });
  });
}

export async function duplicateFolder(
  id: Id,
  name: string,
): Promise<{ data: VaultData; folder: EnvFolder }> {
  let createdId = '';
  const data = await mutate((draft) => {
    const source = draft.folders.find((f) => f.id === id);
    if (!source) notFound('folder');
    const siblings = draft.folders.filter(
      (f) => f.projectId === source.projectId && f.parentId === source.parentId,
    );
    const map = new Map<Id, Id>();
    const ids = descendantFolderIds(draft, id);
    ids.forEach((oldId) => map.set(oldId, newId()));
    createdId = map.get(id) ?? newId();

    for (const oldId of ids) {
      const original = draft.folders.find((f) => f.id === oldId);
      if (!original) continue;
      draft.folders.push({
        ...original,
        id: map.get(oldId) ?? newId(),
        parentId:
          oldId === id
            ? original.parentId
            : original.parentId
              ? (map.get(original.parentId) ?? null)
              : null,
        name:
          oldId === id ? uniqueName(name, siblings.map((f) => f.name)) : original.name,
        order: oldId === id ? nextOrder(siblings) : original.order,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
    for (const file of draft.files.filter((f) => f.folderId && ids.includes(f.folderId))) {
      const cloned: EnvFile = {
        ...file,
        id: newId(),
        folderId: file.folderId ? (map.get(file.folderId) ?? null) : null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      draft.files.push(cloned);
      for (const variable of draft.vars.filter((v) => v.fileId === file.id)) {
        draft.vars.push({
          ...variable,
          id: newId(),
          fileId: cloned.id,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }
    }
    record(draft, {
      kind: 'duplicate',
      entity: 'folder',
      entityId: createdId,
      label: name,
      path: folderFullPath(draft, createdId),
      before: null,
      after: { folders: draft.folders.filter((f) => f.id === createdId) },
    });
  });
  const folder = data.folders.find((f) => f.id === createdId);
  if (!folder) notFound('folder');
  return { data, folder };
}

export function moveFolder(id: Id, projectId: Id, parentId: Id | null): Promise<VaultData> {
  return mutate((data) => {
    const folder = data.folders.find((f) => f.id === id);
    if (!folder) notFound('folder');
    if (parentId && descendantFolderIds(data, id).includes(parentId)) {
      throw new Error('A folder cannot be moved inside itself');
    }
    const before = { ...folder };
    const ids = descendantFolderIds(data, id);
    folder.parentId = parentId;
    folder.projectId = projectId;
    folder.order = nextOrder(
      data.folders.filter((f) => f.projectId === projectId && f.parentId === parentId),
    );
    folder.updatedAt = nowIso();
    for (const child of data.folders.filter((f) => ids.includes(f.id))) child.projectId = projectId;
    for (const file of data.files.filter((f) => f.folderId && ids.includes(f.folderId))) {
      file.projectId = projectId;
    }
    record(data, {
      kind: 'move',
      entity: 'folder',
      entityId: id,
      label: folder.name,
      path: folderFullPath(data, id),
      before: { folders: [before] },
      after: { folders: [{ ...folder }] },
    });
  });
}

export async function createFile(
  input: FileInput,
  source: ChangeSource = 'app',
): Promise<{ data: VaultData; file: EnvFile }> {
  const id = newId();
  const data = await mutate((draft) => {
    const project = draft.projects.find((p) => p.id === input.projectId);
    if (!project) notFound('project');
    const siblings = draft.files.filter(
      (f) => f.projectId === input.projectId && f.folderId === input.folderId,
    );
    const file: EnvFile = {
      id,
      projectId: input.projectId,
      folderId: input.folderId,
      name: uniqueName(input.name.trim() || '.env', siblings.map((f) => f.name)),
      description: input.description ?? '',
      format: input.format ?? draft.settings.defaultFormat,
      order: nextOrder(siblings),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    draft.files.push(file);
    record(draft, {
      kind: 'create',
      entity: 'file',
      entityId: file.id,
      label: file.name,
      path: filePath(draft, file.id),
      before: null,
      after: { files: [file] },
      source,
    });
  });
  const file = data.files.find((f) => f.id === id);
  if (!file) notFound('file');
  return { data, file };
}

export function updateFile(id: Id, patch: Partial<EnvFile>): Promise<VaultData> {
  return mutate((data) => {
    const index = data.files.findIndex((f) => f.id === id);
    if (index === -1) notFound('file');
    const before = { ...data.files[index] };
    const next: EnvFile = { ...before, ...patch, id, updatedAt: nowIso() };
    data.files[index] = next;
    record(data, {
      kind: patch.name && patch.name !== before.name ? 'rename' : 'update',
      entity: 'file',
      entityId: id,
      label: next.name,
      path: filePath(data, id),
      before: { files: [before] },
      after: { files: [next] },
    });
  });
}

export function removeFile(id: Id): Promise<VaultData> {
  return mutate((data) => {
    const file = data.files.find((f) => f.id === id);
    if (!file) notFound('file');
    const path = filePath(data, id);
    const snapshot = cascadeForFile(data, file);
    removeSnapshot(data, snapshot);
    record(data, {
      kind: 'delete',
      entity: 'file',
      entityId: id,
      label: file.name,
      path,
      before: snapshot,
      after: null,
    });
  });
}

export async function duplicateFile(
  id: Id,
  name: string,
): Promise<{ data: VaultData; file: EnvFile }> {
  const newFileId = newId();
  const data = await mutate((draft) => {
    const source = draft.files.find((f) => f.id === id);
    if (!source) notFound('file');
    const siblings = draft.files.filter(
      (f) => f.projectId === source.projectId && f.folderId === source.folderId,
    );
    const file: EnvFile = {
      ...source,
      id: newFileId,
      name: uniqueName(name, siblings.map((f) => f.name)),
      order: nextOrder(siblings),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    draft.files.push(file);
    for (const variable of draft.vars.filter((v) => v.fileId === id)) {
      draft.vars.push({
        ...variable,
        id: newId(),
        fileId: file.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
    record(draft, {
      kind: 'duplicate',
      entity: 'file',
      entityId: file.id,
      label: file.name,
      path: filePath(draft, file.id),
      before: null,
      after: { files: [file] },
    });
  });
  const file = data.files.find((f) => f.id === newFileId);
  if (!file) notFound('file');
  return { data, file };
}

export function moveFile(id: Id, projectId: Id, folderId: Id | null): Promise<VaultData> {
  return mutate((data) => {
    const file = data.files.find((f) => f.id === id);
    if (!file) notFound('file');
    const before = { ...file };
    file.projectId = projectId;
    file.folderId = folderId;
    file.order = nextOrder(
      data.files.filter((f) => f.projectId === projectId && f.folderId === folderId),
    );
    file.updatedAt = nowIso();
    record(data, {
      kind: 'move',
      entity: 'file',
      entityId: id,
      label: file.name,
      path: filePath(data, id),
      before: { files: [before] },
      after: { files: [{ ...file }] },
    });
  });
}

export function renderFile(fileId: Id, options: RenderOptions = {}): string {
  const data = requireUnlocked();
  const file = data.files.find((f) => f.id === fileId);
  if (!file) notFound('file');
  const list = varsOf(data, fileId);
  return serialize(
    list.map((v) => ({
      key: v.key,
      value: v.value,
      note: v.note,
      enabled: v.enabled,
      secret: v.secret,
    })),
    options.format ?? file.format,
    {
      ...DEFAULT_SERIALIZE_OPTIONS,
      quoteMode: data.settings.quoteMode,
      includeNotes: options.includeNotes ?? true,
      includeDisabled: options.includeDisabled ?? true,
      maskSecrets: options.maskSecrets ?? false,
      header: options.header ?? '',
      resourceName: file.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'fuse-env',
    },
  );
}

export function previewImport(
  fileId: Id,
  text: string,
  format: EnvFormat | 'auto',
): ImportPreview {
  const data = requireUnlocked();
  const file = data.files.find((f) => f.id === fileId);
  const resolved: EnvFormat = format === 'auto' ? (file?.format ?? 'dotenv') : format;
  const parsed = parseText(text, resolved);
  const existing = fileId ? varsOf(data, fileId) : [];

  return {
    format: resolved,
    errors: parsed.errors,
    entries: parsed.entries.map((entry) => {
      const match = existing.find((v) => v.key === entry.key);
      return {
        key: entry.key,
        value: entry.value,
        type: suggestType(entry.key, entry.value),
        secret: looksSecret(entry.key),
        enabled: entry.enabled,
        note: entry.note,
        conflict: Boolean(match),
        existingValue: match ? match.value : null,
      };
    }),
  };
}

export async function createVar(
  input: VarInput,
  source: ChangeSource = 'app',
): Promise<{ data: VaultData; variable: EnvVar }> {
  const id = newId();
  const data = await mutate((draft) => {
    const file = draft.files.find((f) => f.id === input.fileId);
    if (!file) notFound('file');
    if (draft.vars.some((v) => v.fileId === input.fileId && v.key === input.key)) {
      throw new Error(`${input.key} already exists in ${file.name}`);
    }
    const variable: EnvVar = {
      id,
      fileId: input.fileId,
      key: input.key,
      value: input.value,
      type: input.type ?? suggestType(input.key, input.value),
      secret: input.secret ?? looksSecret(input.key),
      enabled: input.enabled ?? true,
      note: input.note ?? '',
      options: input.options ?? [],
      order: nextOrder(draft.vars.filter((v) => v.fileId === input.fileId)),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    draft.vars.push(variable);
    record(draft, {
      kind: 'create',
      entity: 'variable',
      entityId: variable.id,
      label: variable.key,
      path: `${filePath(draft, file.id)} / ${variable.key}`,
      before: null,
      after: { vars: [variable] },
      source,
    });
  });
  const variable = data.vars.find((v) => v.id === id);
  if (!variable) notFound('variable');
  return { data, variable };
}

export function updateVar(id: Id, patch: Partial<EnvVar>): Promise<VaultData> {
  return mutate((data) => {
    const index = data.vars.findIndex((v) => v.id === id);
    if (index === -1) notFound('variable');
    const before = { ...data.vars[index] };
    if (patch.key && patch.key !== before.key) {
      const clash = data.vars.some(
        (v) => v.fileId === before.fileId && v.key === patch.key && v.id !== id,
      );
      if (clash) throw new Error(`${patch.key} already exists in this file`);
    }
    const next: EnvVar = { ...before, ...patch, id, updatedAt: nowIso() };
    data.vars[index] = next;
    record(data, {
      kind: patch.key && patch.key !== before.key ? 'rename' : 'update',
      entity: 'variable',
      entityId: id,
      label: next.key,
      path: `${filePath(data, next.fileId)} / ${next.key}`,
      before: { vars: [before] },
      after: { vars: [next] },
    });
  });
}

export function removeVars(ids: Id[]): Promise<VaultData> {
  return mutate((data) => {
    const removed = data.vars.filter((v) => ids.includes(v.id));
    if (removed.length === 0) return;
    data.vars = data.vars.filter((v) => !ids.includes(v.id));
    for (const variable of removed) {
      record(data, {
        kind: 'delete',
        entity: 'variable',
        entityId: variable.id,
        label: variable.key,
        path: `${filePath(data, variable.fileId)} / ${variable.key}`,
        before: { vars: [variable] },
        after: null,
      });
    }
  });
}

export function bulkUpsertVars(input: BulkVarInput, source: ChangeSource = 'app'): Promise<VaultData> {
  return mutate((data) => {
    const file = data.files.find((f) => f.id === input.fileId);
    if (!file) notFound('file');
    const path = filePath(data, file.id);

    if (input.mode === 'replace') {
      const existing = data.vars.filter((v) => v.fileId === input.fileId);
      if (existing.length > 0) {
        data.vars = data.vars.filter((v) => v.fileId !== input.fileId);
        record(data, {
          kind: 'import',
          entity: 'file',
          entityId: file.id,
          label: file.name,
          path,
          before: { vars: existing },
          after: null,
          source,
          note: 'Replaced every variable in this file',
        });
      }
    }

    for (const entry of input.entries) {
      const existing = data.vars.find((v) => v.fileId === input.fileId && v.key === entry.key);
      if (existing && input.mode === 'skip') continue;

      if (existing) {
        const before = { ...existing };
        existing.value = entry.value;
        existing.type = entry.type ?? existing.type;
        existing.secret = entry.secret ?? existing.secret;
        existing.enabled = entry.enabled ?? existing.enabled;
        if (entry.note) existing.note = entry.note;
        existing.updatedAt = nowIso();
        record(data, {
          kind: 'import',
          entity: 'variable',
          entityId: existing.id,
          label: existing.key,
          path: `${path} / ${existing.key}`,
          before: { vars: [before] },
          after: { vars: [{ ...existing }] },
          source,
        });
        continue;
      }

      const variable: EnvVar = {
        id: newId(),
        fileId: input.fileId,
        key: entry.key,
        value: entry.value,
        type: entry.type ?? suggestType(entry.key, entry.value),
        secret: entry.secret ?? looksSecret(entry.key),
        enabled: entry.enabled ?? true,
        note: entry.note ?? '',
        options: [],
        order: nextOrder(data.vars.filter((v) => v.fileId === input.fileId)),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      data.vars.push(variable);
      record(data, {
        kind: 'import',
        entity: 'variable',
        entityId: variable.id,
        label: variable.key,
        path: `${path} / ${variable.key}`,
        before: null,
        after: { vars: [variable] },
        source,
      });
    }
  });
}

export function reorderVars(fileId: Id, ids: Id[]): Promise<VaultData> {
  return mutate((data) => {
    ids.forEach((id, index) => {
      const variable = data.vars.find((v) => v.id === id && v.fileId === fileId);
      if (variable) variable.order = index;
    });
  });
}

export function copyVarsTo(ids: Id[], fileId: Id, mode: ImportMode): Promise<VaultData> {
  const data = requireUnlocked();
  const entries = data.vars
    .filter((v) => ids.includes(v.id))
    .map((v) => ({
      key: v.key,
      value: v.value,
      type: v.type,
      secret: v.secret,
      enabled: v.enabled,
      note: v.note,
    }));
  return bulkUpsertVars({ fileId, entries, mode });
}

export async function moveVarsTo(ids: Id[], fileId: Id, mode: ImportMode): Promise<VaultData> {
  await copyVarsTo(ids, fileId, mode);
  return removeVars(ids);
}

export function listRevisions(filter: { entityId?: Id; limit?: number }): Revision[] {
  const data = requireUnlocked();
  const limit = filter.limit ?? 200;
  const list = filter.entityId
    ? data.revisions.filter((r) => r.entityId === filter.entityId)
    : data.revisions;
  return list.slice(0, limit);
}

export function restoreRevision(revisionId: Id): Promise<VaultData> {
  return mutate((data) => {
    const revision = data.revisions.find((r) => r.id === revisionId);
    if (!revision) notFound('revision');
    const before = parseSnapshot(revision.before);
    const after = parseSnapshot(revision.after);

    if (before) {
      applySnapshot(data, before);
    } else if (after) {
      removeSnapshot(data, after);
    } else {
      throw new Error('There is nothing to restore in this entry');
    }

    record(data, {
      kind: 'restore',
      entity: revision.entity,
      entityId: revision.entityId,
      label: revision.label,
      path: revision.path,
      before: after,
      after: before,
      source: 'restore',
      note: `Restored the state from ${new Date(revision.at).toLocaleString()}`,
    });
  });
}

export function clearHistory(): Promise<VaultData> {
  return mutate((data) => {
    data.revisions = [];
  });
}
