import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LINK_FILE } from '@shared/paths';
import { folderPath } from '@shared/tree';
import type { Id, VaultData } from '@shared/types';

export type LinkMapping = {
  environment?: string;
  folder?: string;
  file?: string;
  local?: string;
  fileId?: Id;
  folderId?: Id;
};

export type LinkFile = {
  version: 1;
  workspace?: string;
  project?: string;
  projectId?: Id;
  environment?: string;
  folder?: string;
  file?: string;
  local?: string;
  folderId?: Id;
  fileId?: Id;
  mappings?: LinkMapping[];
  target?: string;
};

export type ResolvedMapping = {
  mapping: LinkMapping;
  fileId: Id;
};

export function linkPathFor(dir: string): string {
  return path.join(dir, LINK_FILE);
}

export function readLink(startDir: string): { dir: string; link: LinkFile } | null {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < 24; depth += 1) {
    const candidate = linkPathFor(current);
    if (existsSync(candidate)) {
      try {
        return { dir: current, link: JSON.parse(readFileSync(candidate, 'utf8')) as LinkFile };
      } catch {
        return null;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function mappingsOf(link: LinkFile): LinkMapping[] {
  if (link.mappings && link.mappings.length > 0) return link.mappings;
  if (link.fileId || link.file || link.folder) {
    return [
      {
        environment: link.environment,
        folder: link.folder,
        file: link.file,
        local: link.local,
        fileId: link.fileId,
        folderId: link.folderId,
      },
    ];
  }
  return [];
}

export function writeLink(dir: string, link: LinkFile): string {
  const mappings = mappingsOf(link);
  const primary = mappings[0];
  const payload: LinkFile = {
    ...link,
    environment: primary?.environment,
    folder: primary?.folder,
    file: primary?.file,
    local: primary?.local,
    fileId: primary?.fileId,
    folderId: primary?.folderId,
    mappings: mappings.length > 0 ? mappings : undefined,
  };
  const target = linkPathFor(dir);
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return target;
}

export function writeMappings(dir: string, base: LinkFile, mappings: LinkMapping[]): string {
  return writeLink(dir, { ...base, mappings });
}

export function removeLink(dir: string): boolean {
  const target = linkPathFor(dir);
  if (!existsSync(target)) return false;
  unlinkSync(target);
  return true;
}

function resolveOne(data: VaultData, link: LinkFile, mapping: LinkMapping): Id | null {
  if (mapping.fileId && data.files.some((f) => f.id === mapping.fileId)) return mapping.fileId;

  const project = link.projectId
    ? (data.projects.find((p) => p.id === link.projectId) ??
      data.projects.find((p) => p.name === link.project))
    : data.projects.find((p) => p.name === link.project);
  if (!project) return null;

  const folders = data.folders.filter((f) => f.projectId === project.id);
  const folder = mapping.folder
    ? folders.find((f) => folderPath(data, f.id).join('/') === mapping.folder)
    : undefined;
  if (mapping.folder && !folder) return null;

  const file = data.files.find(
    (f) =>
      f.projectId === project.id &&
      (folder ? f.folderId === folder.id : !mapping.folder || f.folderId === null) &&
      (mapping.file ? f.name === mapping.file : true),
  );
  return file?.id ?? null;
}

export function resolvedMappings(data: VaultData, link: LinkFile): ResolvedMapping[] {
  const out: ResolvedMapping[] = [];
  for (const mapping of mappingsOf(link)) {
    const fileId = resolveOne(data, link, mapping);
    if (fileId) out.push({ mapping, fileId });
  }
  return out;
}

export function resolveLinkedFile(data: VaultData, link: LinkFile): Id | null {
  return resolvedMappings(data, link)[0]?.fileId ?? null;
}

export function mappingLabel(data: VaultData, rm: ResolvedMapping): string {
  if (rm.mapping.environment) return rm.mapping.environment;
  const file = data.files.find((f) => f.id === rm.fileId);
  if (!file) return rm.mapping.file ?? 'unknown';
  const folder = folderPath(data, file.folderId).join('/');
  return folder || file.name;
}

export function mappingLocalName(data: VaultData, rm: ResolvedMapping): string {
  if (rm.mapping.local) return rm.mapping.local;
  const file = data.files.find((f) => f.id === rm.fileId);
  return rm.mapping.file ?? file?.name ?? '.env';
}

export function matchMappings(
  data: VaultData,
  list: ResolvedMapping[],
  query: string,
): ResolvedMapping[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];

  const fields = (rm: ResolvedMapping): string[] => {
    const file = data.files.find((f) => f.id === rm.fileId);
    return [
      mappingLabel(data, rm),
      rm.mapping.folder ?? '',
      rm.mapping.file ?? file?.name ?? '',
      mappingLocalName(data, rm),
    ].map((s) => s.toLowerCase());
  };

  const exact = list.filter((rm) => fields(rm).includes(term));
  if (exact.length > 0) return exact;
  return list.filter((rm) => fields(rm).some((f) => f.includes(term)));
}

export function projectForDirectory(data: VaultData, dir: string): string | null {
  const resolved = path.resolve(dir);
  const direct = data.projects.find((p) => p.links.some((l) => path.resolve(l) === resolved));
  if (direct) return direct.id;
  const parent = data.projects.find((p) =>
    p.links.some((l) => resolved.startsWith(`${path.resolve(l)}${path.sep}`)),
  );
  return parent?.id ?? null;
}
