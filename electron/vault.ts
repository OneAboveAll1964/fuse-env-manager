import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, VAULT_VERSION, emptyVault } from '../shared/defaults';
import { backupPath, defaultVaultDir, vaultPath as vaultFilePath } from '../shared/paths';
import {
  VaultError,
  createVault,
  decryptVault,
  encryptVault,
  readHeader,
  rewrapVault,
  unwrapDek,
} from '../shared/vault-crypto';
import type {
  AppSettings,
  ChangeKind,
  ChangeSource,
  EntityKind,
  EnvFile,
  EnvFolder,
  EnvVar,
  Id,
  Project,
  Revision,
  VaultData,
  Workspace,
} from '../shared/types';
import { clearDeviceKey, deviceKeyExists, saveDeviceKey, unlockDeviceKey } from './keychain';

export type Snapshot = {
  workspaces?: Workspace[];
  projects?: Project[];
  folders?: EnvFolder[];
  files?: EnvFile[];
  vars?: EnvVar[];
};

type RecordInput = {
  kind: ChangeKind;
  entity: EntityKind;
  entityId: Id;
  label: string;
  path: string;
  before: Snapshot | null;
  after: Snapshot | null;
  source?: ChangeSource;
  note?: string;
};

let dek: Buffer | null = null;
let cache: VaultData | null = null;
let watcher: FSWatcher | null = null;
let selfWriteAt = 0;
let onExternalChange: (() => void) | null = null;

export const vaultDir = defaultVaultDir();
export const vaultPath = vaultFilePath(vaultDir);

export function newId(): Id {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isInitialized(): boolean {
  return existsSync(vaultPath);
}

export function isLocked(): boolean {
  return dek === null;
}

export function requireUnlocked(): VaultData {
  if (!dek || !cache) throw new VaultError('locked', 'The vault is locked');
  return cache;
}

export function vaultHint(): string {
  try {
    if (!existsSync(vaultPath)) return '';
    return readHeader(readFileSync(vaultPath)).header.meta.hint;
  } catch {
    return '';
  }
}

function normaliseSettings(raw: Partial<AppSettings> | undefined): AppSettings {
  return { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
}

function normalise(parsed: Partial<VaultData>): VaultData {
  return {
    version: parsed.version ?? VAULT_VERSION,
    settings: normaliseSettings(parsed.settings),
    workspaces: (parsed.workspaces ?? []).map((w, i) => ({
      id: w.id ?? newId(),
      name: w.name ?? 'Workspace',
      description: w.description ?? '',
      tone: w.tone ?? 'brand',
      icon: w.icon ?? 'Building2',
      order: Number.isFinite(w.order) ? w.order : i,
      createdAt: w.createdAt ?? nowIso(),
      updatedAt: w.updatedAt ?? nowIso(),
    })),
    projects: (parsed.projects ?? []).map((p, i) => ({
      id: p.id ?? newId(),
      workspaceId: p.workspaceId ?? '',
      name: p.name ?? 'Project',
      description: p.description ?? '',
      tone: p.tone ?? 'slate',
      icon: p.icon ?? 'Package',
      tags: p.tags ?? [],
      links: p.links ?? [],
      order: Number.isFinite(p.order) ? p.order : i,
      createdAt: p.createdAt ?? nowIso(),
      updatedAt: p.updatedAt ?? nowIso(),
    })),
    folders: (parsed.folders ?? []).map((f, i) => ({
      id: f.id ?? newId(),
      projectId: f.projectId ?? '',
      parentId: f.parentId ?? null,
      name: f.name ?? 'folder',
      description: f.description ?? '',
      tone: f.tone ?? 'slate',
      order: Number.isFinite(f.order) ? f.order : i,
      createdAt: f.createdAt ?? nowIso(),
      updatedAt: f.updatedAt ?? nowIso(),
    })),
    files: (parsed.files ?? []).map((f, i) => ({
      id: f.id ?? newId(),
      projectId: f.projectId ?? '',
      folderId: f.folderId ?? null,
      name: f.name ?? '.env',
      description: f.description ?? '',
      format: f.format ?? 'dotenv',
      order: Number.isFinite(f.order) ? f.order : i,
      createdAt: f.createdAt ?? nowIso(),
      updatedAt: f.updatedAt ?? nowIso(),
    })),
    vars: (parsed.vars ?? []).map((v, i) => ({
      id: v.id ?? newId(),
      fileId: v.fileId ?? '',
      key: v.key ?? '',
      value: v.value ?? '',
      type: v.type ?? 'string',
      secret: v.secret ?? false,
      enabled: v.enabled ?? true,
      note: v.note ?? '',
      options: v.options ?? [],
      order: Number.isFinite(v.order) ? v.order : i,
      createdAt: v.createdAt ?? nowIso(),
      updatedAt: v.updatedAt ?? nowIso(),
    })),
    revisions: (parsed.revisions ?? []).map((r) => ({
      id: r.id ?? newId(),
      at: r.at ?? nowIso(),
      kind: r.kind ?? 'update',
      entity: r.entity ?? 'variable',
      entityId: r.entityId ?? '',
      label: r.label ?? '',
      path: r.path ?? '',
      before: r.before ?? null,
      after: r.after ?? null,
      source: r.source ?? 'app',
      note: r.note ?? '',
    })),
  };
}

async function readVaultFile(): Promise<Buffer> {
  return readFile(vaultPath);
}

async function writeVaultFile(buffer: Buffer): Promise<void> {
  await mkdir(vaultDir, { recursive: true });
  const tmp = `${vaultPath}.tmp`;
  await writeFile(tmp, buffer, { mode: 0o600 });
  try {
    await unlink(backupPath(vaultDir));
  } catch {}
  try {
    await rename(vaultPath, backupPath(vaultDir));
  } catch {}
  await rename(tmp, vaultPath);
  selfWriteAt = Date.now();
}

export async function createNewVault(
  password: string,
  hint: string,
  seed: VaultData,
): Promise<void> {
  await mkdir(vaultDir, { recursive: true });
  const buffer = createVault(password, Buffer.from(JSON.stringify(seed), 'utf8'), hint);
  await writeFile(vaultPath, buffer, { mode: 0o600 });
  selfWriteAt = Date.now();
  const file = await readVaultFile();
  dek = unwrapDek(file, password);
  cache = seed;
}

export async function unlockWithPassword(password: string): Promise<void> {
  const file = await readVaultFile();
  const key = unwrapDek(file, password);
  const plaintext = decryptVault(file, key);
  dek = key;
  cache = normalise(JSON.parse(plaintext.toString('utf8')) as Partial<VaultData>);
}

export async function unlockWithDeviceKey(pin: string): Promise<void> {
  const key = unlockDeviceKey(pin);
  const file = await readVaultFile();
  const plaintext = decryptVault(file, key);
  dek = key;
  cache = normalise(JSON.parse(plaintext.toString('utf8')) as Partial<VaultData>);
}

export function rememberDevice(pin: string, useBiometrics: boolean): void {
  if (!dek) throw new VaultError('locked', 'The vault is locked');
  saveDeviceKey(dek, pin, useBiometrics);
}

export function forgetDevice(): void {
  clearDeviceKey();
}

export function hasDeviceKey(): boolean {
  return deviceKeyExists();
}

export function lock(): void {
  if (dek) dek.fill(0);
  dek = null;
  cache = null;
}

export async function changePassword(
  currentPassword: string,
  nextPassword: string,
  hint: string,
): Promise<void> {
  const file = await readVaultFile();
  const rewrapped = rewrapVault(file, currentPassword, nextPassword, hint);
  await writeVaultFile(rewrapped);
  dek = unwrapDek(rewrapped, nextPassword);
}

export async function reload(): Promise<VaultData> {
  if (!dek) throw new VaultError('locked', 'The vault is locked');
  const file = await readVaultFile();
  const plaintext = decryptVault(file, dek);
  cache = normalise(JSON.parse(plaintext.toString('utf8')) as Partial<VaultData>);
  return cache;
}

export function snapshotData(): VaultData {
  return requireUnlocked();
}

function pruneRevisions(data: VaultData): void {
  const { historyRetentionDays, historyMaxEntries } = data.settings;
  if (historyRetentionDays > 0) {
    const cutoff = Date.now() - historyRetentionDays * 86_400_000;
    data.revisions = data.revisions.filter((r) => new Date(r.at).getTime() >= cutoff);
  }
  if (historyMaxEntries > 0 && data.revisions.length > historyMaxEntries) {
    data.revisions = data.revisions.slice(0, historyMaxEntries);
  }
}

export function record(data: VaultData, input: RecordInput): void {
  if (!data.settings.historyEnabled) return;
  const revision: Revision = {
    id: newId(),
    at: nowIso(),
    kind: input.kind,
    entity: input.entity,
    entityId: input.entityId,
    label: input.label,
    path: input.path,
    before: input.before ? JSON.stringify(input.before) : null,
    after: input.after ? JSON.stringify(input.after) : null,
    source: input.source ?? 'app',
    note: input.note ?? '',
  };
  data.revisions.unshift(revision);
  pruneRevisions(data);
}

let writeChain: Promise<void> = Promise.resolve();

export function mutate(fn: (data: VaultData) => void | Promise<void>): Promise<VaultData> {
  const run = writeChain.then(async () => {
    const data = requireUnlocked();
    await fn(data);
    await persist(data);
  });
  writeChain = run.catch(() => undefined);
  return run.then(() => requireUnlocked());
}

export async function persist(data: VaultData): Promise<void> {
  if (!dek) throw new VaultError('locked', 'The vault is locked');
  const file = await readVaultFile();
  const next = encryptVault(file, dek, Buffer.from(JSON.stringify(data), 'utf8'));
  await writeVaultFile(next);
  cache = data;
}

export function watchVaultFile(handler: () => void): void {
  onExternalChange = handler;
  if (watcher) return;
  try {
    if (!existsSync(vaultDir)) return;
    watcher = watch(vaultDir, (_event, filename) => {
      if (filename !== path.basename(vaultPath)) return;
      if (Date.now() - selfWriteAt < 1200) return;
      onExternalChange?.();
    });
  } catch {
    watcher = null;
  }
}

export function stopWatching(): void {
  watcher?.close();
  watcher = null;
}

export function applySnapshot(data: VaultData, snapshot: Snapshot): void {
  const upsert = <T extends { id: Id }>(list: T[], items: T[] | undefined): void => {
    if (!items) return;
    for (const item of items) {
      const index = list.findIndex((existing) => existing.id === item.id);
      if (index === -1) list.push(item);
      else list[index] = item;
    }
  };
  upsert(data.workspaces, snapshot.workspaces);
  upsert(data.projects, snapshot.projects);
  upsert(data.folders, snapshot.folders);
  upsert(data.files, snapshot.files);
  upsert(data.vars, snapshot.vars);
}

export function removeSnapshot(data: VaultData, snapshot: Snapshot): void {
  const ids = <T extends { id: Id }>(items: T[] | undefined): Set<Id> =>
    new Set((items ?? []).map((i) => i.id));
  const w = ids(snapshot.workspaces);
  const p = ids(snapshot.projects);
  const f = ids(snapshot.folders);
  const fi = ids(snapshot.files);
  const v = ids(snapshot.vars);
  data.workspaces = data.workspaces.filter((i) => !w.has(i.id));
  data.projects = data.projects.filter((i) => !p.has(i.id));
  data.folders = data.folders.filter((i) => !f.has(i.id));
  data.files = data.files.filter((i) => !fi.has(i.id));
  data.vars = data.vars.filter((i) => !v.has(i.id));
}

export function parseSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

export function seedVault(): VaultData {
  return emptyVault();
}

export function replaceVault(next: Partial<VaultData>): Promise<VaultData> {
  const incoming = normalise(next);
  return mutate((data) => {
    data.version = incoming.version;
    data.settings = incoming.settings;
    data.workspaces = incoming.workspaces;
    data.projects = incoming.projects;
    data.folders = incoming.folders;
    data.files = incoming.files;
    data.vars = incoming.vars;
    data.revisions = incoming.revisions;
  });
}
