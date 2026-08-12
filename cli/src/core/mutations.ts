import { randomUUID } from 'node:crypto';
import { looksSecret, suggestType } from '@shared/env-types';
import { descendantFolderIds, filePath, folderFullPath, nextOrder, uniqueName } from '@shared/tree';
import type {
  EnvFile,
  EnvFolder,
  EnvFormat,
  EnvVar,
  Id,
  ImportMode,
  Project,
  Revision,
  Tone,
  VaultData,
  Workspace,
} from '@shared/types';

export function newId(): Id {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

type Snapshot = {
  workspaces?: Workspace[];
  projects?: Project[];
  folders?: EnvFolder[];
  files?: EnvFile[];
  vars?: EnvVar[];
};

export function record(
  data: VaultData,
  input: {
    kind: Revision['kind'];
    entity: Revision['entity'];
    entityId: Id;
    label: string;
    path: string;
    before: Snapshot | null;
    after: Snapshot | null;
    note?: string;
  },
): void {
  if (!data.settings.historyEnabled) return;
  data.revisions.unshift({
    id: newId(),
    at: nowIso(),
    kind: input.kind,
    entity: input.entity,
    entityId: input.entityId,
    label: input.label,
    path: input.path,
    before: input.before ? JSON.stringify(input.before) : null,
    after: input.after ? JSON.stringify(input.after) : null,
    source: 'cli',
    note: input.note ?? '',
  });
  const { historyRetentionDays, historyMaxEntries } = data.settings;
  if (historyRetentionDays > 0) {
    const cutoff = Date.now() - historyRetentionDays * 86_400_000;
    data.revisions = data.revisions.filter((r) => new Date(r.at).getTime() >= cutoff);
  }
  if (historyMaxEntries > 0 && data.revisions.length > historyMaxEntries) {
    data.revisions = data.revisions.slice(0, historyMaxEntries);
  }
}

export function createWorkspace(data: VaultData, name: string, tone: Tone = 'brand'): Workspace {
  const workspace: Workspace = {
    id: newId(),
    name: uniqueName(name, data.workspaces.map((w) => w.name)),
    description: '',
    tone,
    icon: 'Building2',
    order: nextOrder(data.workspaces),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  data.workspaces.push(workspace);
  if (!data.settings.activeWorkspaceId) data.settings.activeWorkspaceId = workspace.id;
  record(data, {
    kind: 'create',
    entity: 'workspace',
    entityId: workspace.id,
    label: workspace.name,
    path: workspace.name,
    before: null,
    after: { workspaces: [workspace] },
  });
  return workspace;
}

export function createProject(data: VaultData, workspaceId: Id, name: string): Project {
  const siblings = data.projects.filter((p) => p.workspaceId === workspaceId);
  const project: Project = {
    id: newId(),
    workspaceId,
    name: uniqueName(name, siblings.map((p) => p.name)),
    description: '',
    tone: 'slate',
    icon: 'Package',
    tags: [],
    links: [],
    order: nextOrder(siblings),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  data.projects.push(project);
  record(data, {
    kind: 'create',
    entity: 'project',
    entityId: project.id,
    label: project.name,
    path: project.name,
    before: null,
    after: { projects: [project] },
  });
  return project;
}

export function createFolder(
  data: VaultData,
  projectId: Id,
  parentId: Id | null,
  name: string,
): EnvFolder {
  const siblings = data.folders.filter(
    (f) => f.projectId === projectId && f.parentId === parentId,
  );
  const folder: EnvFolder = {
    id: newId(),
    projectId,
    parentId,
    name: uniqueName(name, siblings.map((f) => f.name)),
    description: '',
    tone: name === 'production' ? 'rose' : name === 'staging' ? 'amber' : 'emerald',
    order: nextOrder(siblings),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  data.folders.push(folder);
  record(data, {
    kind: 'create',
    entity: 'folder',
    entityId: folder.id,
    label: folder.name,
    path: folderFullPath(data, folder.id),
    before: null,
    after: { folders: [folder] },
  });
  return folder;
}

export function createFile(
  data: VaultData,
  projectId: Id,
  folderId: Id | null,
  name: string,
  format?: EnvFormat,
): EnvFile {
  const siblings = data.files.filter((f) => f.projectId === projectId && f.folderId === folderId);
  const file: EnvFile = {
    id: newId(),
    projectId,
    folderId,
    name: uniqueName(name, siblings.map((f) => f.name)),
    description: '',
    format: format ?? data.settings.defaultFormat,
    order: nextOrder(siblings),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  data.files.push(file);
  record(data, {
    kind: 'create',
    entity: 'file',
    entityId: file.id,
    label: file.name,
    path: filePath(data, file.id),
    before: null,
    after: { files: [file] },
  });
  return file;
}

export type UpsertEntry = {
  key: string;
  value: string;
  note?: string;
  enabled?: boolean;
  secret?: boolean;
};

export type UpsertResult = { added: number; updated: number; skipped: number; removed: number };

export function upsertVars(
  data: VaultData,
  fileId: Id,
  entries: UpsertEntry[],
  mode: ImportMode,
): UpsertResult {
  const file = data.files.find((f) => f.id === fileId);
  if (!file) throw new Error('That file no longer exists');
  const path = filePath(data, fileId);
  const result: UpsertResult = { added: 0, updated: 0, skipped: 0, removed: 0 };

  if (mode === 'replace') {
    const existing = data.vars.filter((v) => v.fileId === fileId);
    if (existing.length > 0) {
      data.vars = data.vars.filter((v) => v.fileId !== fileId);
      result.removed = existing.length;
      record(data, {
        kind: 'import',
        entity: 'file',
        entityId: fileId,
        label: file.name,
        path,
        before: { vars: existing },
        after: null,
        note: 'Replaced every variable in this file',
      });
    }
  }

  for (const entry of entries) {
    const existing = data.vars.find((v) => v.fileId === fileId && v.key === entry.key);
    if (existing && mode === 'skip') {
      result.skipped += 1;
      continue;
    }
    if (existing) {
      if (existing.value === entry.value && (entry.note ?? existing.note) === existing.note) {
        result.skipped += 1;
        continue;
      }
      const before = { ...existing };
      existing.value = entry.value;
      if (entry.note !== undefined && entry.note !== '') existing.note = entry.note;
      if (entry.enabled !== undefined) existing.enabled = entry.enabled;
      if (entry.secret !== undefined) existing.secret = entry.secret;
      existing.updatedAt = nowIso();
      result.updated += 1;
      record(data, {
        kind: 'import',
        entity: 'variable',
        entityId: existing.id,
        label: existing.key,
        path: `${path} / ${existing.key}`,
        before: { vars: [before] },
        after: { vars: [{ ...existing }] },
      });
      continue;
    }

    const variable: EnvVar = {
      id: newId(),
      fileId,
      key: entry.key,
      value: entry.value,
      type: suggestType(entry.key, entry.value),
      secret: entry.secret ?? looksSecret(entry.key),
      enabled: entry.enabled ?? true,
      note: entry.note ?? '',
      options: [],
      order: nextOrder(data.vars.filter((v) => v.fileId === fileId)),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    data.vars.push(variable);
    result.added += 1;
    record(data, {
      kind: 'import',
      entity: 'variable',
      entityId: variable.id,
      label: variable.key,
      path: `${path} / ${variable.key}`,
      before: null,
      after: { vars: [variable] },
    });
  }

  return result;
}

export function removeVars(data: VaultData, ids: Id[]): number {
  const removed = data.vars.filter((v) => ids.includes(v.id));
  if (removed.length === 0) return 0;
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
  return removed.length;
}

export function removeFile(data: VaultData, fileId: Id): void {
  const file = data.files.find((f) => f.id === fileId);
  if (!file) throw new Error('That file no longer exists');
  const path = filePath(data, fileId);
  const vars = data.vars.filter((v) => v.fileId === fileId);
  data.files = data.files.filter((f) => f.id !== fileId);
  data.vars = data.vars.filter((v) => v.fileId !== fileId);
  record(data, {
    kind: 'delete',
    entity: 'file',
    entityId: fileId,
    label: file.name,
    path,
    before: { files: [file], vars },
    after: null,
  });
}

export function removeFolder(data: VaultData, folderId: Id): void {
  const folder = data.folders.find((f) => f.id === folderId);
  if (!folder) throw new Error('That folder no longer exists');
  const path = folderFullPath(data, folderId);
  const ids = new Set(descendantFolderIds(data, folderId));
  const folders = data.folders.filter((f) => ids.has(f.id));
  const files = data.files.filter((f) => f.folderId && ids.has(f.folderId));
  const fileIds = new Set(files.map((f) => f.id));
  const vars = data.vars.filter((v) => fileIds.has(v.fileId));
  data.folders = data.folders.filter((f) => !ids.has(f.id));
  data.files = data.files.filter((f) => !fileIds.has(f.id));
  data.vars = data.vars.filter((v) => !fileIds.has(v.fileId));
  record(data, {
    kind: 'delete',
    entity: 'folder',
    entityId: folderId,
    label: folder.name,
    path,
    before: { folders, files, vars },
    after: null,
  });
}

export function removeProject(data: VaultData, projectId: Id): void {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('That project no longer exists');
  const folders = data.folders.filter((f) => f.projectId === projectId);
  const files = data.files.filter((f) => f.projectId === projectId);
  const fileIds = new Set(files.map((f) => f.id));
  const vars = data.vars.filter((v) => fileIds.has(v.fileId));
  data.projects = data.projects.filter((p) => p.id !== projectId);
  data.folders = data.folders.filter((f) => f.projectId !== projectId);
  data.files = data.files.filter((f) => f.projectId !== projectId);
  data.vars = data.vars.filter((v) => !fileIds.has(v.fileId));
  record(data, {
    kind: 'delete',
    entity: 'project',
    entityId: projectId,
    label: project.name,
    path: project.name,
    before: { projects: [project], folders, files, vars },
    after: null,
  });
}

export function copyFile(data: VaultData, sourceId: Id, targetFolderId: Id | null, projectId: Id, name?: string): EnvFile {
  const source = data.files.find((f) => f.id === sourceId);
  if (!source) throw new Error('That file no longer exists');
  const created = createFile(data, projectId, targetFolderId, name ?? source.name, source.format);
  const entries = data.vars
    .filter((v) => v.fileId === sourceId)
    .sort((a, b) => a.order - b.order)
    .map((v) => ({
      key: v.key,
      value: v.value,
      note: v.note,
      enabled: v.enabled,
      secret: v.secret,
    }));
  upsertVars(data, created.id, entries, 'merge');
  return created;
}

export function linkProject(data: VaultData, projectId: Id, target: string): void {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('That project no longer exists');
  if (!project.links.includes(target)) project.links.push(target);
  project.updatedAt = nowIso();
}

export function unlinkProject(data: VaultData, projectId: Id, target: string): void {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) return;
  project.links = project.links.filter((l) => l !== target);
  project.updatedAt = nowIso();
}

export function restoreRevision(data: VaultData, revisionId: Id): Revision {
  const revision = data.revisions.find((r) => r.id === revisionId);
  if (!revision) throw new Error('That history entry no longer exists');
  const parse = (raw: string | null): Snapshot | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Snapshot;
    } catch {
      return null;
    }
  };
  const before = parse(revision.before);
  const after = parse(revision.after);

  const upsert = <T extends { id: Id }>(list: T[], items: T[] | undefined): void => {
    if (!items) return;
    for (const item of items) {
      const index = list.findIndex((existing) => existing.id === item.id);
      if (index === -1) list.push(item);
      else list[index] = item;
    }
  };

  if (before) {
    upsert(data.workspaces, before.workspaces);
    upsert(data.projects, before.projects);
    upsert(data.folders, before.folders);
    upsert(data.files, before.files);
    upsert(data.vars, before.vars);
  } else if (after) {
    const ids = <T extends { id: Id }>(items: T[] | undefined): Set<Id> =>
      new Set((items ?? []).map((i) => i.id));
    const w = ids(after.workspaces);
    const p = ids(after.projects);
    const f = ids(after.folders);
    const fi = ids(after.files);
    const v = ids(after.vars);
    data.workspaces = data.workspaces.filter((i) => !w.has(i.id));
    data.projects = data.projects.filter((i) => !p.has(i.id));
    data.folders = data.folders.filter((i) => !f.has(i.id));
    data.files = data.files.filter((i) => !fi.has(i.id));
    data.vars = data.vars.filter((i) => !v.has(i.id));
  } else {
    throw new Error('There is nothing to restore in that entry');
  }

  record(data, {
    kind: 'restore',
    entity: revision.entity,
    entityId: revision.entityId,
    label: revision.label,
    path: revision.path,
    before: after,
    after: before,
    note: `Restored the state from ${revision.at}`,
  });
  return revision;
}
