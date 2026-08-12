import type {
  DiffRow,
  EnvFile,
  EnvFolder,
  EnvVar,
  Id,
  Project,
  SearchHit,
  TreeNode,
  VaultData,
  Workspace,
} from './types';

export function byOrder<T extends { order: number; name?: string }>(a: T, b: T): number {
  if (a.order !== b.order) return a.order - b.order;
  return (a.name ?? '').localeCompare(b.name ?? '');
}

export function nextOrder(items: { order: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.order), -1) + 1;
}

export function foldersOf(data: VaultData, projectId: Id, parentId: Id | null): EnvFolder[] {
  return data.folders
    .filter((f) => f.projectId === projectId && f.parentId === parentId)
    .sort(byOrder);
}

export function filesOf(data: VaultData, projectId: Id, folderId: Id | null): EnvFile[] {
  return data.files
    .filter((f) => f.projectId === projectId && f.folderId === folderId)
    .sort(byOrder);
}

export function varsOf(data: VaultData, fileId: Id): EnvVar[] {
  return data.vars.filter((v) => v.fileId === fileId).sort((a, b) => a.order - b.order);
}

export function projectsOf(data: VaultData, workspaceId: Id): Project[] {
  return data.projects.filter((p) => p.workspaceId === workspaceId).sort(byOrder);
}

export function workspacesOf(data: VaultData): Workspace[] {
  return [...data.workspaces].sort(byOrder);
}

export function descendantFolderIds(data: VaultData, folderId: Id): Id[] {
  const out: Id[] = [];
  const walk = (id: Id): void => {
    out.push(id);
    for (const child of data.folders.filter((f) => f.parentId === id)) walk(child.id);
  };
  walk(folderId);
  return out;
}

export function fileIdsUnderFolder(data: VaultData, folderId: Id): Id[] {
  const folderIds = new Set(descendantFolderIds(data, folderId));
  return data.files.filter((f) => f.folderId && folderIds.has(f.folderId)).map((f) => f.id);
}

export function fileIdsUnderProject(data: VaultData, projectId: Id): Id[] {
  return data.files.filter((f) => f.projectId === projectId).map((f) => f.id);
}

export function fileIdsUnderWorkspace(data: VaultData, workspaceId: Id): Id[] {
  const projectIds = new Set(
    data.projects.filter((p) => p.workspaceId === workspaceId).map((p) => p.id),
  );
  return data.files.filter((f) => projectIds.has(f.projectId)).map((f) => f.id);
}

export function folderPath(data: VaultData, folderId: Id | null): string[] {
  const out: string[] = [];
  let current = folderId ? data.folders.find((f) => f.id === folderId) : undefined;
  let guard = 0;
  while (current && guard < 64) {
    out.unshift(current.name);
    current = current.parentId ? data.folders.find((f) => f.id === current?.parentId) : undefined;
    guard += 1;
  }
  return out;
}

export function filePath(data: VaultData, fileId: Id): string {
  const file = data.files.find((f) => f.id === fileId);
  if (!file) return '';
  const project = data.projects.find((p) => p.id === file.projectId);
  const workspace = project ? data.workspaces.find((w) => w.id === project.workspaceId) : undefined;
  const segments = [workspace?.name, project?.name, ...folderPath(data, file.folderId), file.name];
  return segments.filter(Boolean).join(' / ');
}

export function folderFullPath(data: VaultData, folderId: Id): string {
  const folder = data.folders.find((f) => f.id === folderId);
  if (!folder) return '';
  const project = data.projects.find((p) => p.id === folder.projectId);
  const workspace = project ? data.workspaces.find((w) => w.id === project.workspaceId) : undefined;
  return [workspace?.name, project?.name, ...folderPath(data, folderId)]
    .filter(Boolean)
    .join(' / ');
}

export function projectFullPath(data: VaultData, projectId: Id): string {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) return '';
  const workspace = data.workspaces.find((w) => w.id === project.workspaceId);
  return [workspace?.name, project.name].filter(Boolean).join(' / ');
}

function fileNode(data: VaultData, file: EnvFile, parentPath: string): TreeNode {
  const vars = data.vars.filter((v) => v.fileId === file.id);
  return {
    id: file.id,
    kind: 'file',
    name: file.name,
    tone: 'slate',
    icon: 'FileCode2',
    path: `${parentPath} / ${file.name}`,
    parentId: file.folderId,
    projectId: file.projectId,
    workspaceId: data.projects.find((p) => p.id === file.projectId)?.workspaceId ?? null,
    format: file.format,
    varCount: vars.length,
    secretCount: vars.filter((v) => v.secret).length,
    children: [],
  };
}

function folderNode(data: VaultData, folder: EnvFolder, parentPath: string): TreeNode {
  const path = `${parentPath} / ${folder.name}`;
  const children: TreeNode[] = [
    ...foldersOf(data, folder.projectId, folder.id).map((f) => folderNode(data, f, path)),
    ...filesOf(data, folder.projectId, folder.id).map((f) => fileNode(data, f, path)),
  ];
  const varCount = children.reduce((sum, c) => sum + c.varCount, 0);
  const secretCount = children.reduce((sum, c) => sum + c.secretCount, 0);
  return {
    id: folder.id,
    kind: 'folder',
    name: folder.name,
    tone: folder.tone,
    icon: 'Folder',
    path,
    parentId: folder.parentId,
    projectId: folder.projectId,
    workspaceId: data.projects.find((p) => p.id === folder.projectId)?.workspaceId ?? null,
    format: null,
    varCount,
    secretCount,
    children,
  };
}

function projectNode(data: VaultData, project: Project, parentPath: string): TreeNode {
  const path = `${parentPath} / ${project.name}`;
  const children: TreeNode[] = [
    ...foldersOf(data, project.id, null).map((f) => folderNode(data, f, path)),
    ...filesOf(data, project.id, null).map((f) => fileNode(data, f, path)),
  ];
  const varCount = children.reduce((sum, c) => sum + c.varCount, 0);
  const secretCount = children.reduce((sum, c) => sum + c.secretCount, 0);
  return {
    id: project.id,
    kind: 'project',
    name: project.name,
    tone: project.tone,
    icon: project.icon,
    path,
    parentId: project.workspaceId,
    projectId: project.id,
    workspaceId: project.workspaceId,
    format: null,
    varCount,
    secretCount,
    children,
  };
}

export function buildTree(data: VaultData, workspaceId: Id | null): TreeNode[] {
  const workspaces = workspacesOf(data).filter((w) => !workspaceId || w.id === workspaceId);
  return workspaces.map((workspace) => {
    const children = projectsOf(data, workspace.id).map((p) =>
      projectNode(data, p, workspace.name),
    );
    return {
      id: workspace.id,
      kind: 'workspace' as const,
      name: workspace.name,
      tone: workspace.tone,
      icon: workspace.icon,
      path: workspace.name,
      parentId: null,
      projectId: null,
      workspaceId: workspace.id,
      format: null,
      varCount: children.reduce((sum, c) => sum + c.varCount, 0),
      secretCount: children.reduce((sum, c) => sum + c.secretCount, 0),
      children,
    };
  });
}

export function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]): void => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function searchVault(data: VaultData, query: string, limit = 200): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];
  for (const variable of data.vars) {
    const file = data.files.find((f) => f.id === variable.fileId);
    if (!file) continue;
    const project = data.projects.find((p) => p.id === file.projectId);
    if (!project) continue;

    const path = filePath(data, file.id);
    let matchedIn: SearchHit['matchedIn'] | null = null;
    if (variable.key.toLowerCase().includes(q)) matchedIn = 'key';
    else if (!variable.secret && variable.value.toLowerCase().includes(q)) matchedIn = 'value';
    else if (variable.note.toLowerCase().includes(q)) matchedIn = 'note';
    else if (path.toLowerCase().includes(q)) matchedIn = 'path';
    if (!matchedIn) continue;

    hits.push({
      varId: variable.id,
      fileId: file.id,
      key: variable.key,
      value: variable.value,
      secret: variable.secret,
      type: variable.type,
      path,
      workspaceId: project.workspaceId,
      projectId: project.id,
      matchedIn,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export function diffVars(left: EnvVar[], right: EnvVar[]): DiffRow[] {
  const keys = new Set([...left.map((v) => v.key), ...right.map((v) => v.key)]);
  const rows: DiffRow[] = [];
  for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
    const l = left.find((v) => v.key === key) ?? null;
    const r = right.find((v) => v.key === key) ?? null;
    let status: DiffRow['status'];
    if (l && !r) status = 'removed';
    else if (!l && r) status = 'added';
    else if (l && r && l.value !== r.value) status = 'changed';
    else status = 'same';
    rows.push({
      key,
      status,
      left: l ? l.value : null,
      right: r ? r.value : null,
      leftSecret: l?.secret ?? false,
      rightSecret: r?.secret ?? false,
    });
  }
  return rows;
}

export function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let index = 2;
  while (taken.includes(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
