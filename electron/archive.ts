import JSZip from 'jszip';
import { readFile, writeFile } from 'node:fs/promises';
import { serialize } from '../shared/codecs';
import { descendantFolderIds, filePath, folderPath, nextOrder, uniqueName } from '../shared/tree';
import { createVault, decryptVault, unwrapDek } from '../shared/vault-crypto';
import type {
  ArchiveManifest,
  EnvFile,
  EnvFolder,
  EnvVar,
  ExportOptions,
  Id,
  ImportArchiveResult,
  ImportMode,
  Project,
  Revision,
  VaultData,
  Workspace,
} from '../shared/types';
import type { ArchivePreview } from '../shared/bridge';
import { mutate, newId, nowIso, record, requireUnlocked } from './vault';

const MANIFEST = 'manifest.json';
const PAYLOAD = 'data/vault.json';
const ENCRYPTED_PAYLOAD = 'data/vault.fuse';
const ARCHIVE_VERSION = 1;

type Payload = {
  workspaces: Workspace[];
  projects: Project[];
  folders: EnvFolder[];
  files: EnvFile[];
  vars: EnvVar[];
  revisions: Revision[];
};

function collectScope(data: VaultData, options: ExportOptions): Payload {
  const { scope } = options;
  const everything =
    scope.workspaceIds.length === 0 &&
    scope.projectIds.length === 0 &&
    scope.folderIds.length === 0 &&
    scope.fileIds.length === 0;

  const workspaceIds = new Set<Id>(scope.workspaceIds);
  const projectIds = new Set<Id>(scope.projectIds);
  const folderIds = new Set<Id>();
  const fileIds = new Set<Id>(scope.fileIds);

  for (const id of scope.folderIds) {
    for (const descendant of descendantFolderIds(data, id)) folderIds.add(descendant);
  }

  if (everything) {
    for (const w of data.workspaces) workspaceIds.add(w.id);
    for (const p of data.projects) projectIds.add(p.id);
    for (const f of data.folders) folderIds.add(f.id);
    for (const f of data.files) fileIds.add(f.id);
  } else {
    for (const project of data.projects) {
      if (workspaceIds.has(project.workspaceId)) projectIds.add(project.id);
    }
    for (const folder of data.folders) {
      if (projectIds.has(folder.projectId)) {
        for (const descendant of descendantFolderIds(data, folder.id)) folderIds.add(descendant);
      }
    }
    for (const file of data.files) {
      if (projectIds.has(file.projectId)) fileIds.add(file.id);
      else if (file.folderId && folderIds.has(file.folderId)) fileIds.add(file.id);
    }
    for (const folder of data.folders) {
      if (folderIds.has(folder.id)) projectIds.add(folder.projectId);
    }
    for (const file of data.files) {
      if (fileIds.has(file.id)) projectIds.add(file.projectId);
    }
    for (const project of data.projects) {
      if (projectIds.has(project.id)) workspaceIds.add(project.workspaceId);
    }
    for (const folder of data.folders) {
      if (projectIds.has(folder.projectId)) folderIds.add(folder.id);
    }
  }

  const files = data.files.filter((f) => fileIds.has(f.id));
  const vars = data.vars
    .filter((v) => fileIds.has(v.fileId))
    .map((v) =>
      options.includeSecrets || !v.secret ? v : { ...v, value: '', note: v.note || 'Secret omitted' },
    );

  return {
    workspaces: data.workspaces.filter((w) => workspaceIds.has(w.id)),
    projects: data.projects.filter((p) => projectIds.has(p.id)),
    folders: data.folders.filter((f) => folderIds.has(f.id)),
    files,
    vars,
    revisions: options.includeHistory
      ? data.revisions.filter(
          (r) => fileIds.has(r.entityId) || projectIds.has(r.entityId) || folderIds.has(r.entityId),
        )
      : [],
  };
}

function safeSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'untitled';
}

function diskPathFor(data: VaultData, payload: Payload, file: EnvFile): string {
  const project = payload.projects.find((p) => p.id === file.projectId);
  const workspace = project ? payload.workspaces.find((w) => w.id === project.workspaceId) : undefined;
  const segments = [
    workspace ? safeSegment(workspace.name) : 'workspace',
    project ? safeSegment(project.name) : 'project',
    ...folderPath(data, file.folderId).map(safeSegment),
    safeSegment(file.name),
  ];
  return `files/${segments.join('/')}`;
}

export async function buildArchive(
  options: ExportOptions,
  appVersion: string,
): Promise<{ bytes: Buffer; manifest: ArchiveManifest }> {
  const data = requireUnlocked();
  const payload = collectScope(data, options);

  const manifest: ArchiveManifest = {
    kind: 'fuse-archive',
    version: ARCHIVE_VERSION,
    createdAt: nowIso(),
    app: 'Fuse',
    appVersion,
    encrypted: options.encrypt,
    includesSecrets: options.includeSecrets,
    includesHistory: options.includeHistory,
    counts: {
      workspaces: payload.workspaces.length,
      projects: payload.projects.length,
      folders: payload.folders.length,
      files: payload.files.length,
      vars: payload.vars.length,
    },
  };

  const zip = new JSZip();
  zip.file(MANIFEST, JSON.stringify(manifest, null, 2));

  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  if (options.encrypt) {
    if (!options.password) throw new Error('A password is required to encrypt the archive');
    zip.file(ENCRYPTED_PAYLOAD, createVault(options.password, json, 'Fuse archive'));
  } else {
    zip.file(PAYLOAD, json);
    if (options.format !== 'native') {
      for (const file of payload.files) {
        const list = payload.vars
          .filter((v) => v.fileId === file.id)
          .sort((a, b) => a.order - b.order)
          .map((v) => ({
            key: v.key,
            value: v.value,
            note: v.note,
            enabled: v.enabled,
            secret: v.secret,
          }));
        zip.file(
          diskPathFor(data, payload, file),
          serialize(list, options.format, {
            quoteMode: data.settings.quoteMode,
            maskSecrets: !options.includeSecrets,
            header: `Exported from Fuse on ${new Date().toLocaleString()}`,
          }),
        );
      }
    }
    zip.file(
      'README.txt',
      [
        'Fuse export',
        '',
        `Created: ${manifest.createdAt}`,
        `Secrets included: ${options.includeSecrets ? 'yes' : 'no'}`,
        '',
        'data/vault.json holds the full structure and can be imported back into Fuse.',
        options.format === 'native'
          ? ''
          : 'files/ holds plain rendered copies for use outside Fuse.',
        '',
        'Treat this archive as sensitive if it contains secrets.',
      ].join('\n'),
    );
  }

  const bytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  return { bytes, manifest };
}

export async function writeArchive(
  target: string,
  options: ExportOptions,
  appVersion: string,
): Promise<{ path: string; bytes: number }> {
  const { bytes } = await buildArchive(options, appVersion);
  await writeFile(target, bytes);
  return { path: target, bytes: bytes.length };
}

export async function previewArchive(archivePath: string): Promise<ArchivePreview> {
  const zip = await JSZip.loadAsync(await readFile(archivePath));
  const manifestFile = zip.file(MANIFEST);
  if (!manifestFile) throw new Error('This zip is not a Fuse export');
  const manifest = JSON.parse(await manifestFile.async('string')) as ArchiveManifest;
  if (manifest.kind !== 'fuse-archive') throw new Error('This zip is not a Fuse export');
  return { manifest, needsPassword: manifest.encrypted };
}

async function readPayload(archivePath: string, password: string): Promise<Payload> {
  const zip = await JSZip.loadAsync(await readFile(archivePath));
  const encrypted = zip.file(ENCRYPTED_PAYLOAD);
  if (encrypted) {
    if (!password) throw new Error('This archive is encrypted and needs its password');
    const buffer = Buffer.from(await encrypted.async('nodebuffer'));
    const dek = unwrapDek(buffer, password);
    return JSON.parse(decryptVault(buffer, dek).toString('utf8')) as Payload;
  }
  const plain = zip.file(PAYLOAD);
  if (!plain) throw new Error('This archive has no importable data');
  return JSON.parse(await plain.async('string')) as Payload;
}

export async function importArchive(
  archivePath: string,
  password: string,
  mode: ImportMode,
): Promise<ImportArchiveResult> {
  const payload = await readPayload(archivePath, password);
  const result: ImportArchiveResult = {
    workspaces: 0,
    projects: 0,
    folders: 0,
    files: 0,
    vars: 0,
    skipped: 0,
    overwritten: 0,
  };

  await mutate((data) => {
    const workspaceMap = new Map<Id, Id>();
    const projectMap = new Map<Id, Id>();
    const folderMap = new Map<Id, Id>();
    const fileMap = new Map<Id, Id>();

    for (const workspace of payload.workspaces) {
      const existing = data.workspaces.find((w) => w.name === workspace.name);
      if (existing && mode !== 'replace') {
        workspaceMap.set(workspace.id, existing.id);
        continue;
      }
      const created: Workspace = {
        ...workspace,
        id: newId(),
        name: existing
          ? workspace.name
          : uniqueName(workspace.name, data.workspaces.map((w) => w.name)),
        order: nextOrder(data.workspaces),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      if (existing && mode === 'replace') {
        workspaceMap.set(workspace.id, existing.id);
        continue;
      }
      data.workspaces.push(created);
      workspaceMap.set(workspace.id, created.id);
      result.workspaces += 1;
    }

    for (const project of payload.projects) {
      const workspaceId = workspaceMap.get(project.workspaceId) ?? data.workspaces[0]?.id;
      if (!workspaceId) continue;
      const siblings = data.projects.filter((p) => p.workspaceId === workspaceId);
      const existing = siblings.find((p) => p.name === project.name);
      if (existing && mode === 'skip') {
        projectMap.set(project.id, existing.id);
        result.skipped += 1;
        continue;
      }
      if (existing && mode === 'merge') {
        projectMap.set(project.id, existing.id);
        continue;
      }
      const created: Project = {
        ...project,
        id: newId(),
        workspaceId,
        links: [],
        name: existing ? project.name : uniqueName(project.name, siblings.map((p) => p.name)),
        order: nextOrder(siblings),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      if (existing && mode === 'replace') {
        const cascadeFolders = data.folders.filter((f) => f.projectId === existing.id);
        const cascadeFiles = data.files.filter((f) => f.projectId === existing.id);
        const cascadeFileIds = new Set(cascadeFiles.map((f) => f.id));
        data.folders = data.folders.filter((f) => f.projectId !== existing.id);
        data.files = data.files.filter((f) => f.projectId !== existing.id);
        data.vars = data.vars.filter((v) => !cascadeFileIds.has(v.fileId));
        result.overwritten += cascadeFolders.length + cascadeFiles.length;
        data.projects = data.projects.filter((p) => p.id !== existing.id);
      }
      data.projects.push(created);
      projectMap.set(project.id, created.id);
      result.projects += 1;
    }

    const orderedFolders = [...payload.folders].sort((a, b) => {
      const depth = (folder: EnvFolder): number => {
        let level = 0;
        let current: EnvFolder | undefined = folder;
        while (current?.parentId) {
          current = payload.folders.find((f) => f.id === current?.parentId);
          level += 1;
          if (level > 32) break;
        }
        return level;
      };
      return depth(a) - depth(b);
    });

    for (const folder of orderedFolders) {
      const projectId = projectMap.get(folder.projectId);
      if (!projectId) continue;
      const parentId = folder.parentId ? (folderMap.get(folder.parentId) ?? null) : null;
      const siblings = data.folders.filter(
        (f) => f.projectId === projectId && f.parentId === parentId,
      );
      const existing = siblings.find((f) => f.name === folder.name);
      if (existing && mode !== 'replace') {
        folderMap.set(folder.id, existing.id);
        continue;
      }
      const created: EnvFolder = {
        ...folder,
        id: newId(),
        projectId,
        parentId,
        order: nextOrder(siblings),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      data.folders.push(created);
      folderMap.set(folder.id, created.id);
      result.folders += 1;
    }

    for (const file of payload.files) {
      const projectId = projectMap.get(file.projectId);
      if (!projectId) continue;
      const folderId = file.folderId ? (folderMap.get(file.folderId) ?? null) : null;
      const siblings = data.files.filter(
        (f) => f.projectId === projectId && f.folderId === folderId,
      );
      const existing = siblings.find((f) => f.name === file.name);
      if (existing && mode === 'skip') {
        fileMap.set(file.id, existing.id);
        result.skipped += 1;
        continue;
      }
      if (existing) {
        fileMap.set(file.id, existing.id);
        if (mode === 'replace') {
          data.vars = data.vars.filter((v) => v.fileId !== existing.id);
          result.overwritten += 1;
        }
        continue;
      }
      const created: EnvFile = {
        ...file,
        id: newId(),
        projectId,
        folderId,
        order: nextOrder(siblings),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      data.files.push(created);
      fileMap.set(file.id, created.id);
      result.files += 1;
    }

    for (const variable of payload.vars) {
      const fileId = fileMap.get(variable.fileId);
      if (!fileId) continue;
      const existing = data.vars.find((v) => v.fileId === fileId && v.key === variable.key);
      if (existing) {
        if (mode === 'skip') {
          result.skipped += 1;
          continue;
        }
        existing.value = variable.value;
        existing.type = variable.type;
        existing.secret = variable.secret;
        existing.enabled = variable.enabled;
        existing.note = variable.note;
        existing.updatedAt = nowIso();
        result.overwritten += 1;
        continue;
      }
      data.vars.push({
        ...variable,
        id: newId(),
        fileId,
        order: nextOrder(data.vars.filter((v) => v.fileId === fileId)),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      result.vars += 1;
    }

    record(data, {
      kind: 'import',
      entity: 'workspace',
      entityId: 'archive',
      label: 'Archive import',
      path: archivePath,
      before: null,
      after: null,
      source: 'import',
      note: `Imported ${result.projects} projects, ${result.files} files and ${result.vars} variables`,
    });
  });

  return result;
}

export function fileDiskName(data: VaultData, fileId: Id): string {
  const file = data.files.find((f) => f.id === fileId);
  if (!file) return 'export.env';
  return safeSegment(file.name) || safeSegment(filePath(data, fileId));
}
