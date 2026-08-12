import JSZip from 'jszip';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SERIALIZE_OPTIONS, serialize } from '@shared/codecs';
import { filePath, folderPath, nextOrder, uniqueName, varsOf } from '@shared/tree';
import { createVault, decryptVault, unwrapDek } from '@shared/vault-crypto';
import type {
  ArchiveManifest,
  EnvFile,
  EnvFolder,
  EnvVar,
  Id,
  ImportMode,
  Project,
  VaultData,
  Workspace,
} from '@shared/types';
import { connect } from '../core/client';
import { newId, nowIso, record } from '../core/mutations';
import { findFiles, findProject } from '../core/resolve';
import { c } from '../ui/colors';
import { failure, heading, info, keyValue, print, success, warn } from '../ui/output';
import { confirm, isInteractive, password as askPassword, select } from '../ui/prompt';
import { flagBool, flagString, type ParsedArgs } from '../core/args';

const MANIFEST = 'manifest.json';
const PAYLOAD = 'data/vault.json';
const ENCRYPTED_PAYLOAD = 'data/vault.fuse';

type Payload = {
  workspaces: Workspace[];
  projects: Project[];
  folders: EnvFolder[];
  files: EnvFile[];
  vars: EnvVar[];
  revisions: [];
};

function safeSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'untitled';
}

export async function exportArchive(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;

  const scopeSpec = flagString(args, 'project') ?? flagString(args, 'workspace') ?? args.positional[0];
  let projectIds: Id[] = [];
  let workspaceIds: Id[] = [];

  if (flagString(args, 'workspace')) {
    const workspace = data.workspaces.find(
      (w) => w.name.toLowerCase() === (flagString(args, 'workspace') ?? '').toLowerCase(),
    );
    if (!workspace) {
      failure(`No workspace called "${flagString(args, 'workspace') ?? ''}"`);
      return 1;
    }
    workspaceIds = [workspace.id];
  } else if (scopeSpec) {
    const project = findProject(data, scopeSpec);
    if (!project) {
      failure(`No project matched "${scopeSpec}"`);
      return 1;
    }
    projectIds = [project.id];
  }

  const includeSecrets = !flagBool(args, 'no-secrets');
  const encrypt = flagBool(args, 'encrypt') || (!flagBool(args, 'plain') && includeSecrets);
  let archivePassword = flagString(args, 'password') ?? '';

  if (encrypt && !archivePassword) {
    if (!isInteractive()) {
      failure('Give --password for an encrypted archive, or pass --plain.');
      return 1;
    }
    archivePassword = await askPassword('Password for the archive');
    if (archivePassword.length < 8) {
      failure('Use at least 8 characters');
      return 1;
    }
  }

  const wantedProjects =
    workspaceIds.length > 0
      ? data.projects.filter((p) => workspaceIds.includes(p.workspaceId))
      : projectIds.length > 0
        ? data.projects.filter((p) => projectIds.includes(p.id))
        : data.projects;

  const projectIdSet = new Set(wantedProjects.map((p) => p.id));
  const folders = data.folders.filter((f) => projectIdSet.has(f.projectId));
  const files = data.files.filter((f) => projectIdSet.has(f.projectId));
  const fileIds = new Set(files.map((f) => f.id));
  const vars = data.vars
    .filter((v) => fileIds.has(v.fileId))
    .map((v) => (includeSecrets || !v.secret ? v : { ...v, value: '' }));
  const workspaces = data.workspaces.filter((w) =>
    wantedProjects.some((p) => p.workspaceId === w.id),
  );

  const payload: Payload = { workspaces, projects: wantedProjects, folders, files, vars, revisions: [] };

  const manifest: ArchiveManifest = {
    kind: 'fuse-archive',
    version: 1,
    createdAt: nowIso(),
    app: 'Fuse CLI',
    appVersion: 'cli',
    encrypted: encrypt,
    includesSecrets: includeSecrets,
    includesHistory: false,
    counts: {
      workspaces: workspaces.length,
      projects: wantedProjects.length,
      folders: folders.length,
      files: files.length,
      vars: vars.length,
    },
  };

  const zip = new JSZip();
  zip.file(MANIFEST, JSON.stringify(manifest, null, 2));
  const json = Buffer.from(JSON.stringify(payload), 'utf8');

  if (encrypt) {
    zip.file(ENCRYPTED_PAYLOAD, createVault(archivePassword, json, 'Fuse archive'));
  } else {
    zip.file(PAYLOAD, json);
    for (const file of files) {
      const project = wantedProjects.find((p) => p.id === file.projectId);
      const workspace = workspaces.find((w) => w.id === project?.workspaceId);
      const segments = [
        workspace ? safeSegment(workspace.name) : 'workspace',
        project ? safeSegment(project.name) : 'project',
        ...folderPath(data, file.folderId).map(safeSegment),
        safeSegment(file.name),
      ];
      zip.file(
        `files/${segments.join('/')}`,
        serialize(
          varsOf(data, file.id).map((v) => ({
            key: v.key,
            value: includeSecrets || !v.secret ? v.value : '',
            note: v.note,
            enabled: v.enabled,
            secret: v.secret,
          })),
          file.format,
          { ...DEFAULT_SERIALIZE_OPTIONS, quoteMode: data.settings.quoteMode },
        ),
      );
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const outName = flagString(args, 'out', 'o') ?? `fuse-export-${stamp}.zip`;
  const target = path.isAbsolute(outName) ? outName : path.join(process.cwd(), outName);

  const bytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  writeFileSync(target, bytes);

  heading('Export');
  keyValue([
    ['file', c.bold(target)],
    ['size', `${(bytes.length / 1024).toFixed(1)} KB`],
    ['projects', String(manifest.counts.projects)],
    ['env files', String(manifest.counts.files)],
    ['variables', String(manifest.counts.vars)],
    ['encrypted', encrypt ? c.green('yes') : c.yellow('no')],
    ['secrets', includeSecrets ? c.yellow('included') : c.green('left out')],
  ]);
  print();
  if (!encrypt && includeSecrets) {
    warn('This archive holds secrets in plain text', 'keep it safe and delete it when you are done');
  }
  success('Export written');
  return 0;
}

export async function importArchive(args: ParsedArgs): Promise<number> {
  const source = args.positional[0] ?? flagString(args, 'file', 'f');
  if (!source) {
    failure('Give the archive: fuse import fuse-export-2026-08-12.zip');
    return 1;
  }
  const archivePath = path.isAbsolute(source) ? source : path.join(process.cwd(), source);
  if (!existsSync(archivePath)) {
    failure(`${archivePath} does not exist`);
    return 1;
  }

  const zip = await JSZip.loadAsync(readFileSync(archivePath));
  const manifestFile = zip.file(MANIFEST);
  if (!manifestFile) {
    failure('That zip is not a Fuse export');
    return 1;
  }
  const manifest = JSON.parse(await manifestFile.async('string')) as ArchiveManifest;

  heading('Import', path.basename(archivePath));
  keyValue([
    ['created', manifest.createdAt],
    ['encrypted', manifest.encrypted ? c.green('yes') : c.yellow('no')],
    ['secrets', manifest.includesSecrets ? 'included' : 'left out'],
    ['projects', String(manifest.counts.projects)],
    ['env files', String(manifest.counts.files)],
    ['variables', String(manifest.counts.vars)],
  ]);
  print();

  let payload: Payload;
  const encrypted = zip.file(ENCRYPTED_PAYLOAD);
  if (encrypted) {
    let archivePassword = flagString(args, 'password') ?? '';
    if (!archivePassword) {
      if (!isInteractive()) {
        failure('This archive is encrypted. Pass --password.');
        return 1;
      }
      archivePassword = await askPassword('Archive password');
    }
    const buffer = Buffer.from(await encrypted.async('nodebuffer'));
    try {
      const dek = unwrapDek(buffer, archivePassword);
      payload = JSON.parse(decryptVault(buffer, dek).toString('utf8')) as Payload;
    } catch {
      failure('That password did not open the archive');
      return 1;
    }
  } else {
    const plain = zip.file(PAYLOAD);
    if (!plain) {
      failure('That archive has no importable data');
      return 1;
    }
    payload = JSON.parse(await plain.async('string')) as Payload;
  }

  let mode: ImportMode = (flagString(args, 'mode') as ImportMode | undefined) ?? 'merge';
  if (!flagBool(args, 'yes', 'y') && isInteractive()) {
    mode = await select<ImportMode>('When something already exists', [
      { value: 'merge', label: 'Merge', hint: 'update matching entries, add what is missing' },
      { value: 'skip', label: 'Keep existing', hint: 'only add what does not exist yet' },
      { value: 'replace', label: 'Replace', hint: 'clear matching files first' },
    ]);
    const ok = await confirm('Import into this vault now?', true);
    if (!ok) {
      info('Nothing was imported');
      return 0;
    }
  }

  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const counts = { workspaces: 0, projects: 0, folders: 0, files: 0, vars: 0, skipped: 0, updated: 0 };

  await client.save((draft) => {
    const workspaceMap = new Map<Id, Id>();
    const projectMap = new Map<Id, Id>();
    const folderMap = new Map<Id, Id>();
    const fileMap = new Map<Id, Id>();

    for (const workspace of payload.workspaces) {
      const existing = draft.workspaces.find((w) => w.name === workspace.name);
      if (existing) {
        workspaceMap.set(workspace.id, existing.id);
        continue;
      }
      const created: Workspace = {
        ...workspace,
        id: newId(),
        order: nextOrder(draft.workspaces),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      draft.workspaces.push(created);
      workspaceMap.set(workspace.id, created.id);
      counts.workspaces += 1;
    }

    for (const project of payload.projects) {
      const workspaceId = workspaceMap.get(project.workspaceId) ?? draft.workspaces[0]?.id;
      if (!workspaceId) continue;
      const siblings = draft.projects.filter((p) => p.workspaceId === workspaceId);
      const existing = siblings.find((p) => p.name === project.name);
      if (existing && mode !== 'replace') {
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
      draft.projects.push(created);
      projectMap.set(project.id, created.id);
      counts.projects += 1;
    }

    const ordered = [...payload.folders].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));
    for (const folder of ordered) {
      const projectId = projectMap.get(folder.projectId);
      if (!projectId) continue;
      const parentId = folder.parentId ? (folderMap.get(folder.parentId) ?? null) : null;
      const siblings = draft.folders.filter(
        (f) => f.projectId === projectId && f.parentId === parentId,
      );
      const existing = siblings.find((f) => f.name === folder.name);
      if (existing) {
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
      draft.folders.push(created);
      folderMap.set(folder.id, created.id);
      counts.folders += 1;
    }

    for (const file of payload.files) {
      const projectId = projectMap.get(file.projectId);
      if (!projectId) continue;
      const folderId = file.folderId ? (folderMap.get(file.folderId) ?? null) : null;
      const siblings = draft.files.filter(
        (f) => f.projectId === projectId && f.folderId === folderId,
      );
      const existing = siblings.find((f) => f.name === file.name);
      if (existing) {
        fileMap.set(file.id, existing.id);
        if (mode === 'replace') draft.vars = draft.vars.filter((v) => v.fileId !== existing.id);
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
      draft.files.push(created);
      fileMap.set(file.id, created.id);
      counts.files += 1;
    }

    for (const variable of payload.vars) {
      const fileId = fileMap.get(variable.fileId);
      if (!fileId) continue;
      const existing = draft.vars.find((v) => v.fileId === fileId && v.key === variable.key);
      if (existing) {
        if (mode === 'skip') {
          counts.skipped += 1;
          continue;
        }
        existing.value = variable.value;
        existing.type = variable.type;
        existing.secret = variable.secret;
        existing.note = variable.note;
        existing.updatedAt = nowIso();
        counts.updated += 1;
        continue;
      }
      draft.vars.push({
        ...variable,
        id: newId(),
        fileId,
        order: nextOrder(draft.vars.filter((v) => v.fileId === fileId)),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      counts.vars += 1;
    }

    record(draft, {
      kind: 'import',
      entity: 'workspace',
      entityId: 'archive',
      label: path.basename(archivePath),
      path: archivePath,
      before: null,
      after: null,
      note: `Imported ${counts.projects} projects, ${counts.files} files and ${counts.vars} variables`,
    });
  });

  success(
    'Import finished',
    `${counts.projects} projects, ${counts.files} files, ${counts.vars} variables added; ${counts.updated} updated, ${counts.skipped} skipped`,
  );
  return 0;
}

export function describeFiles(data: VaultData, spec: string): void {
  findFiles(data, spec).forEach((file) => print(`  ${filePath(data, file.id)}`));
}
