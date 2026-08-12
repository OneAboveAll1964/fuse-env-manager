import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LINK_FILE } from '@shared/paths';
import type { Id, VaultData } from '@shared/types';

export type LinkFile = {
  version: 1;
  workspace?: string;
  project?: string;
  folder?: string;
  file?: string;
  projectId?: Id;
  folderId?: Id;
  fileId?: Id;
  target?: string;
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

export function writeLink(dir: string, link: LinkFile): string {
  const target = linkPathFor(dir);
  writeFileSync(target, `${JSON.stringify(link, null, 2)}\n`, 'utf8');
  return target;
}

export function removeLink(dir: string): boolean {
  const target = linkPathFor(dir);
  if (!existsSync(target)) return false;
  unlinkSync(target);
  return true;
}

export function resolveLinkedFile(data: VaultData, link: LinkFile): string | null {
  if (link.fileId && data.files.some((f) => f.id === link.fileId)) return link.fileId;
  if (!link.project) return null;
  const project = data.projects.find((p) => p.name === link.project);
  if (!project) return null;
  const folders = data.folders.filter((f) => f.projectId === project.id);
  const folder = link.folder ? folders.find((f) => f.name === link.folder) : undefined;
  const file = data.files.find(
    (f) =>
      f.projectId === project.id &&
      (folder ? f.folderId === folder.id : true) &&
      (link.file ? f.name === link.file : true),
  );
  return file?.id ?? null;
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
