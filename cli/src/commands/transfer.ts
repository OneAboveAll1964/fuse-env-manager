import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SERIALIZE_OPTIONS, detectFormat, parseText, serialize } from '@shared/codecs';
import { FORMATS, FORMAT_LABELS } from '@shared/env-types';
import { filePath, folderPath, varsOf } from '@shared/tree';
import type { EnvFile, EnvFormat, ImportMode, VaultData } from '@shared/types';
import { connect } from '../core/client';
import {
  upsertVars,
  createFile,
  createFolder,
  createProject,
  createWorkspace,
} from '../core/mutations';
import {
  focusedMapping,
  mappingLabel,
  mappingLocalName,
  mappingsOf,
  matchMappings,
  projectForDirectory,
  readLink,
  resolveLinkedFile,
  resolvedMappings,
  writeLink,
  writeMappings,
  type LinkFile,
  type LinkMapping,
  type ResolvedMapping,
} from '../core/link';
import {
  findFile,
  findFiles,
  findProject,
  pickFileGuided,
  pickProject,
  pickWorkspace,
} from '../core/resolve';
import { c, symbols } from '../ui/colors';
import {
  box,
  diffLine,
  failure,
  heading,
  info,
  keyValue,
  print,
  success,
  table,
  warn,
} from '../ui/output';
import { confirm, isInteractive, select, text, type Choice } from '../ui/prompt';
import { flagBool, flagString, type ParsedArgs } from '../core/args';

const ENV_CANDIDATES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.staging',
];

function renderFile(data: VaultData, file: EnvFile, format: EnvFormat): string {
  return serialize(
    varsOf(data, file.id).map((v) => ({
      key: v.key,
      value: v.value,
      note: v.note,
      enabled: v.enabled,
      secret: v.secret,
    })),
    format,
    {
      ...DEFAULT_SERIALIZE_OPTIONS,
      quoteMode: data.settings.quoteMode,
      header: `Pulled from Fuse: ${filePath(data, file.id)}`,
      resourceName: file.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'fuse-env',
    },
  );
}

function localCandidates(dir: string): string[] {
  return findLocalEnvFiles(dir);
}

async function chooseLocalName(
  cwd: string,
  vaultName: string,
  mappedLocal: string | null,
  explicit: string | undefined,
): Promise<string | null> {
  if (explicit) return explicit;
  if (mappedLocal) return mappedLocal;
  if (existsSync(path.join(cwd, vaultName))) return vaultName;

  const candidates = localCandidates(cwd).filter((name) => name !== vaultName);
  if (candidates.length === 0) return vaultName;

  if (!isInteractive()) {
    warn(
      `This folder has ${candidates.slice(0, 3).join(', ')} but not ${vaultName}`,
      `writing ${vaultName}, pass --as to write into one of them instead`,
    );
    return vaultName;
  }

  const picked = await select<string>(`This folder has no ${vaultName}. Where should it go?`, [
    ...candidates.map<Choice<string>>((name) => ({
      value: name,
      label: `Write into ${name}`,
      hint: 'the file already here',
    })),
    { value: vaultName, label: `Create ${vaultName}`, hint: 'the name used in the vault' },
  ]);
  return picked;
}

function rememberLocalName(
  link: { dir: string; link: LinkFile } | null,
  fileId: string,
  localName: string,
): void {
  if (!link) return;
  const mappings = mappingsOf(link.link);
  const index = mappings.findIndex((m) => m.fileId === fileId);
  if (index === -1 || mappings[index].local === localName) return;
  writeMappings(
    link.dir,
    link.link,
    mappings.map((m, i) => (i === index ? { ...m, local: localName } : m)),
  );
}

type PullRow = {
  rm: ResolvedMapping;
  file: EnvFile;
  local: string;
  target: string;
  contents: string;
  state: 'new' | 'same' | 'differs';
  added: number;
  changed: number;
  removed: number;
};

function buildPullRows(data: VaultData, list: ResolvedMapping[], cwd: string): PullRow[] {
  const rows: PullRow[] = [];
  for (const rm of list) {
    const file = data.files.find((f) => f.id === rm.fileId);
    if (!file) continue;
    const local = mappingLocalName(data, rm);
    const target = path.isAbsolute(local) ? local : path.join(cwd, local);
    const contents = renderFile(data, file, file.format);
    const row: PullRow = {
      rm,
      file,
      local,
      target,
      contents,
      state: 'new',
      added: 0,
      changed: 0,
      removed: 0,
    };
    if (existsSync(target)) {
      const current = readFileSync(target, 'utf8');
      if (current === contents) {
        row.state = 'same';
      } else {
        row.state = 'differs';
        const parsed = parseText(current, detectFormat(local, current));
        const incoming = parseText(contents, file.format);
        const currentKeys = new Map(parsed.entries.map((e) => [e.key, e.value]));
        const nextKeys = new Map(incoming.entries.map((e) => [e.key, e.value]));
        for (const key of new Set([...currentKeys.keys(), ...nextKeys.keys()])) {
          const before = currentKeys.get(key);
          const after = nextKeys.get(key);
          if (before === after) continue;
          if (before === undefined) row.added += 1;
          else if (after === undefined) row.removed += 1;
          else row.changed += 1;
        }
        if (row.added + row.changed + row.removed === 0) row.state = 'same';
      }
    }
    rows.push(row);
  }
  return rows;
}

function pullStateLabel(row: PullRow): string {
  if (row.state === 'same') return c.grey('up to date');
  if (row.state === 'new') return c.green('new file');
  const parts = [];
  if (row.added) parts.push(c.green(`+${row.added}`));
  if (row.changed) parts.push(c.yellow(`~${row.changed}`));
  if (row.removed) parts.push(c.red(`-${row.removed}`));
  return parts.join(' ');
}

async function pullMappings(
  data: VaultData,
  list: ResolvedMapping[],
  args: ParsedArgs,
): Promise<number> {
  const cwd = process.cwd();
  const rows = buildPullRows(data, list, cwd);
  if (rows.length === 0) {
    failure('None of the linked environments exist in the vault any more');
    info('Repair the link with', 'fuse link');
    return 1;
  }

  heading('Pull', `${rows.length} environment${rows.length === 1 ? '' : 's'} into this folder`);
  table(
    ['environment', 'vault file', 'local file', 'state'],
    rows.map((row) => [
      mappingLabel(data, row.rm),
      c.grey(row.file.name),
      row.local,
      pullStateLabel(row),
    ]),
    [24, 20, 24, 20],
  );
  print();

  const pending = rows.filter((row) => row.state !== 'same');
  if (pending.length === 0) {
    success('Everything is already up to date');
    return 0;
  }

  const overwrites = pending.filter((row) => row.state === 'differs');
  if (overwrites.length > 0 && !flagBool(args, 'yes', 'y')) {
    if (!isInteractive()) {
      failure(
        `${overwrites.length} local file${overwrites.length === 1 ? '' : 's'} would change. Re-run with --yes.`,
      );
      return 1;
    }
    const ok = await confirm(`Overwrite ${overwrites.map((row) => row.local).join(', ')}?`, true);
    if (!ok) {
      info('Nothing was written');
      return 0;
    }
  }

  for (const row of pending) writeFileSync(row.target, row.contents, 'utf8');
  for (const row of pending) {
    success(
      `Wrote ${row.local}`,
      `${varsOf(data, row.file.id).length} variables from ${mappingLabel(data, row.rm)}`,
    );
  }
  return 0;
}

async function resolveTargetFile(
  data: VaultData,
  args: ParsedArgs,
  cwd: string,
): Promise<EnvFile | null> {
  const spec = flagString(args, 'file', 'f') ?? args.positional[0];
  if (spec) {
    const direct = findFile(data, spec);
    if (direct) return direct;
    const matches = findFiles(data, spec);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      if (!isInteractive()) {
        failure(`"${spec}" matched ${matches.length} files. Be more specific.`);
        matches.slice(0, 10).forEach((file) => print(`    ${c.grey(filePath(data, file.id))}`));
        return null;
      }
      const id = await select<string>(
        `"${spec}" matched several files`,
        matches.map<Choice<string>>((file) => ({
          value: file.id,
          label: filePath(data, file.id),
        })),
      );
      return matches.find((f) => f.id === id) ?? null;
    }
    failure(`Nothing in the vault matched "${spec}"`);
    return null;
  }

  const linked = readLink(cwd);
  if (linked) {
    const maps = resolvedMappings(data, linked.link);
    if (maps.length > 1) {
      const envFlag = flagString(args, 'env');
      if (envFlag) {
        const hits = matchMappings(data, maps, envFlag);
        if (hits.length === 1) return data.files.find((f) => f.id === hits[0].fileId) ?? null;
        failure(
          hits.length === 0
            ? `No mapped environment here matched "${envFlag}"`
            : `"${envFlag}" matched several environments`,
        );
        maps.forEach((rm) => print(`    ${c.grey(mappingLabel(data, rm))}`));
        return null;
      }
      const focus = focusedMapping(data, linked.link);
      if (focus) {
        info(
          `On ${c.bold(mappingLabel(data, focus))}`,
          `${mappingLocalName(data, focus)} — fuse switch moves the focus`,
        );
        return data.files.find((f) => f.id === focus.fileId) ?? null;
      }
    }
    const fileId = maps[0]?.fileId ?? null;
    if (fileId) {
      const file = data.files.find((f) => f.id === fileId);
      if (file) {
        info(
          `Using the link in ${c.bold(path.relative(cwd, linked.dir) || '.')}`,
          filePath(data, file.id),
        );
        return file;
      }
    }

    const linkedProject = data.projects.find((p) => p.id === linked.link.projectId);
    if (linkedProject) {
      const environments = listEnvironments(data, linkedProject.id, null);
      if (environments.length > 0) {
        warn(
          `The environment this folder was on is gone`,
          `${linked.link.environment ?? linked.link.file ?? ''} in ${linkedProject.name}`,
        );
        if (environments.length === 1) {
          return data.files.find((f) => f.id === environments[0].fileId) ?? null;
        }
        if (isInteractive()) {
          const picked = await select<string>(
            `Which environment of ${linkedProject.name} instead?`,
            environments.map<Choice<string>>((env) => ({
              value: env.fileId,
              label: env.label,
              hint: `${env.file} · ${env.vars} vars`,
            })),
          );
          return data.files.find((f) => f.id === picked) ?? null;
        }
        failure('Pick one with fuse use, or pass --file');
        environments.forEach((env) => print(`    ${c.grey(env.label)}`));
        return null;
      }
    }
  }

  const projectId = projectForDirectory(data, cwd);
  if (projectId) {
    const files = data.files.filter((f) => f.projectId === projectId);
    if (files.length === 1) return files[0];
    if (files.length > 1 && isInteractive()) {
      const id = await select<string>(
        `Which file from ${data.projects.find((p) => p.id === projectId)?.name ?? 'this project'}?`,
        files.map<Choice<string>>((file) => {
          const folder = folderPath(data, file.folderId).join(' / ');
          return {
            value: file.id,
            label: folder ? `${folder} / ${file.name}` : file.name,
            hint: `${data.vars.filter((v) => v.fileId === file.id).length} vars`,
          };
        }),
      );
      return files.find((f) => f.id === id) ?? null;
    }
  }

  if (!isInteractive()) {
    failure('This folder is not linked, so Fuse does not know which file you mean');
    info('Either link it once', 'fuse link --project "Storefront API"');
    info('Or name a file', '--file "Workspace/Project/folder/.env"');
    if (data.files.length > 0 && data.files.length <= 12) {
      data.files.forEach((f) => print(`    ${c.grey(filePath(data, f.id))}`));
    }
    return null;
  }
  return pickFileGuided(data);
}

async function mapAndPull(
  data: VaultData,
  found: { dir: string; link: LinkFile },
  env: Environment,
  args: ParsedArgs,
): Promise<number> {
  const file = data.files.find((f) => f.id === env.fileId);
  if (!file) return 1;

  const existing = resolvedMappings(data, found.link);
  const taken = existing.map((rm) => mappingLocalName(data, rm));
  const renamed = existing.some(
    (rm) => rm.mapping.local && rm.mapping.local !== (rm.mapping.file ?? rm.mapping.local),
  );
  let local = flagString(args, 'as');
  if (!local) {
    const fallback =
      taken.includes(file.name) || renamed
        ? `${env.label.replace(/[^A-Za-z0-9.-]+/g, '-').toLowerCase()}.env`
        : file.name;
    if (isInteractive()) {
      local = await text(`Which local file should ${env.label} live in?`, { initial: fallback });
    } else {
      local = fallback;
    }
  }
  if (!local) return 1;

  const mapping: LinkMapping = {
    environment: env.label,
    folder: env.folder || undefined,
    file: file.name,
    local,
    fileId: file.id,
    folderId: file.folderId ?? undefined,
  };
  writeMappings(found.dir, found.link, [...mappingsOf(found.link), mapping]);
  info(`Mapped ${env.label}`, `${local} — fuse switch ${env.label} to work on it`);
  return pullMappings(data, [{ mapping, fileId: file.id }], args);
}

export async function pull(args: ParsedArgs): Promise<number> {
  const cwd = process.cwd();
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;

  const found = readLink(cwd);
  const maps = found ? resolvedMappings(data, found.link) : [];
  const bare = args.positional[0];

  if (!flagString(args, 'file', 'f') && found) {
    if (bare && maps.length > 0) {
      const hits = matchMappings(data, maps, bare);
      if (hits.length === 1) return pullMappings(data, hits, args);
      if (hits.length > 1) {
        if (!isInteractive()) {
          failure(`"${bare}" matched ${hits.length} environments here. Be more specific.`);
          hits.forEach((rm) => print(`    ${c.grey(mappingLabel(data, rm))}`));
          return 1;
        }
        const picked = await select<string>(
          `"${bare}" matched several`,
          hits.map<Choice<string>>((rm) => ({
            value: rm.fileId,
            label: mappingLabel(data, rm),
            hint: mappingLocalName(data, rm),
          })),
        );
        const hit = hits.find((rm) => rm.fileId === picked);
        return hit ? pullMappings(data, [hit], args) : 1;
      }
    }

    if (!bare && maps.length > 1) {
      if (flagBool(args, 'all')) return pullMappings(data, maps, args);
      const focus = focusedMapping(data, found.link);
      if (focus) return pullMappings(data, [focus], args);
    }

    if (bare) {
      const projectId = found.link.projectId;
      if (projectId && data.projects.some((p) => p.id === projectId)) {
        const environments = listEnvironments(data, projectId, maps[0]?.fileId ?? null);
        const named = matchEnvironment(environments, bare);
        if (named.length === 1) {
          if (maps.length > 1) return mapAndPull(data, found, named[0], args);
          return use(args);
        }
        if (named.length > 1) return use(args);
      }
    }
  }

  const file = await resolveTargetFile(data, args, cwd);
  if (!file) return 1;

  const format = (flagString(args, 'format') as EnvFormat | undefined) ?? file.format;
  if (!FORMATS.includes(format)) {
    failure(`Unknown format "${format}"`);
    return 1;
  }

  const linkForNames = readLink(cwd);
  const mappedLocal = linkForNames
    ? (resolvedMappings(data, linkForNames.link).find((rm) => rm.fileId === file.id)?.mapping
        .local ?? null)
    : null;
  const outName = await chooseLocalName(cwd, file.name, mappedLocal, flagString(args, 'as', 'o'));
  if (!outName) return 1;
  rememberLocalName(linkForNames, file.id, outName);
  const outDir = flagString(args, 'dir') ?? cwd;
  const target = path.isAbsolute(outName) ? outName : path.join(outDir, outName);
  const contents = renderFile(data, file, format);
  const count = varsOf(data, file.id).length;

  heading('Pull', filePath(data, file.id));
  keyValue([
    ['from', c.brightCyan(filePath(data, file.id))],
    ['into', c.bold(target)],
    ['format', FORMAT_LABELS[format]],
    ['variables', String(count)],
  ]);
  print();

  if (existsSync(target)) {
    const current = readFileSync(target, 'utf8');
    if (current === contents) {
      success('That file is already up to date');
      return 0;
    }
    const parsed = parseText(current, detectFormat(path.basename(target), current));
    const incoming = parseText(contents, format);
    const currentKeys = new Map(parsed.entries.map((e) => [e.key, e.value]));
    const nextKeys = new Map(incoming.entries.map((e) => [e.key, e.value]));

    warn(`${path.basename(target)} already exists here`);
    print();
    const keys = [...new Set([...currentKeys.keys(), ...nextKeys.keys()])].sort();
    let changes = 0;
    for (const key of keys) {
      const before = currentKeys.get(key);
      const after = nextKeys.get(key);
      if (before === after) continue;
      changes += 1;
      if (before === undefined) diffLine('+', `${key}=${after ?? ''}`);
      else if (after === undefined) diffLine('-', `${key}=${before}`);
      else diffLine('~', `${key}: ${before} ${symbols.arrow} ${after}`);
    }
    if (changes === 0) print(`  ${c.grey('only formatting differs')}`);
    print();

    if (!flagBool(args, 'yes', 'y')) {
      if (!isInteractive()) {
        failure('The file already exists. Re-run with --yes to overwrite it.');
        return 1;
      }
      const choice = await select<'overwrite' | 'merge' | 'backup' | 'cancel'>(
        'What should happen to the existing file?',
        [
          { value: 'overwrite', label: 'Overwrite it', hint: 'replace the whole file' },
          { value: 'merge', label: 'Merge', hint: 'keep local keys that the vault does not have' },
          {
            value: 'backup',
            label: 'Overwrite and keep a backup',
            hint: `${path.basename(target)}.bak`,
          },
          { value: 'cancel', label: 'Cancel', hint: 'change nothing' },
        ],
      );
      if (choice === 'cancel') {
        info('Nothing was written');
        return 0;
      }
      if (choice === 'backup') writeFileSync(`${target}.bak`, current, 'utf8');
      if (choice === 'merge') {
        const merged = [...incoming.entries];
        for (const entry of parsed.entries) {
          if (!nextKeys.has(entry.key)) merged.push(entry);
        }
        writeFileSync(
          target,
          serialize(
            merged.map((e) => ({ ...e, secret: false })),
            format,
            {
              quoteMode: data.settings.quoteMode,
              header: `Merged from Fuse: ${filePath(data, file.id)}`,
            },
          ),
          'utf8',
        );
        success(`Merged into ${path.basename(target)}`, `${merged.length} variables`);
        return 0;
      }
    }
  }

  writeFileSync(target, contents, 'utf8');
  success(`Wrote ${path.basename(target)}`, `${count} variables from ${filePath(data, file.id)}`);

  if (flagBool(args, 'link')) {
    const project = data.projects.find((p) => p.id === file.projectId);
    const workspace = project
      ? data.workspaces.find((w) => w.id === project.workspaceId)
      : undefined;
    writeLink(cwd, {
      version: 1,
      workspace: workspace?.name,
      project: project?.name,
      folder: folderPath(data, file.folderId).join('/') || undefined,
      file: file.name,
      fileId: file.id,
      projectId: file.projectId,
      folderId: file.folderId ?? undefined,
    });
    info('Linked this folder', 'future pulls will not ask');
  }

  return 0;
}

export async function put(args: ParsedArgs): Promise<number> {
  return pull({ ...args, flags: { ...args.flags } });
}

function findLocalEnvFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => {
        if (name.startsWith('.env')) return true;
        if (ENV_CANDIDATES.includes(name)) return true;
        return /\.(env|properties|xcconfig)$/i.test(name);
      })
      .filter((name) => {
        try {
          return statSync(path.join(dir, name)).isFile();
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
}

type PushRow = {
  rm: ResolvedMapping;
  file: EnvFile;
  local: string;
  entries: ReturnType<typeof parseText>['entries'];
  missing: boolean;
  added: number;
  updated: number;
};

async function pushMappings(
  client: Awaited<ReturnType<typeof connect>>,
  data: VaultData,
  list: ResolvedMapping[],
  args: ParsedArgs,
): Promise<number> {
  const cwd = process.cwd();
  const mode = (flagString(args, 'mode') as ImportMode | undefined) ?? 'merge';
  const rows: PushRow[] = [];

  for (const rm of list) {
    const file = data.files.find((f) => f.id === rm.fileId);
    if (!file) continue;
    const local = mappingLocalName(data, rm);
    const target = path.isAbsolute(local) ? local : path.join(cwd, local);
    const row: PushRow = { rm, file, local, entries: [], missing: true, added: 0, updated: 0 };
    if (existsSync(target)) {
      row.missing = false;
      const raw = readFileSync(target, 'utf8');
      row.entries = parseText(raw, detectFormat(local, raw)).entries;
      const current = new Map(varsOf(data, file.id).map((v) => [v.key, v.value]));
      for (const entry of row.entries) {
        if (!current.has(entry.key)) row.added += 1;
        else if (current.get(entry.key) !== entry.value) row.updated += 1;
      }
    }
    rows.push(row);
  }

  heading('Push', `${rows.length} environment${rows.length === 1 ? '' : 's'} from this folder`);
  table(
    ['environment', 'local file', 'vault file', 'state'],
    rows.map((row) => [
      mappingLabel(data, row.rm),
      row.local,
      c.grey(row.file.name),
      row.missing
        ? c.grey('no local file, skipped')
        : row.added + row.updated === 0
          ? c.grey('vault already matches')
          : [
              row.added ? c.green(`+${row.added}`) : '',
              row.updated ? c.yellow(`~${row.updated}`) : '',
            ]
              .filter(Boolean)
              .join(' '),
    ]),
    [24, 24, 20, 26],
  );
  print();

  const pending = rows.filter((row) => !row.missing && row.added + row.updated > 0);
  if (pending.length === 0) {
    success('The vault already matches this folder');
    return 0;
  }

  if (!flagBool(args, 'yes', 'y')) {
    if (!isInteractive()) {
      failure(
        `${pending.length} environment${pending.length === 1 ? '' : 's'} would change in the vault. Re-run with --yes.`,
      );
      return 1;
    }
    const ok = await confirm(
      `Update ${pending.map((row) => mappingLabel(data, row.rm)).join(', ')} in the vault?`,
      true,
    );
    if (!ok) {
      info('Nothing was pushed');
      return 0;
    }
  }

  const results = new Map<string, { added: number; updated: number; skipped: number }>();
  await client.save((draft) => {
    for (const row of pending) {
      const outcome = upsertVars(
        draft,
        row.file.id,
        row.entries.map((entry) => ({
          key: entry.key,
          value: entry.value,
          note: entry.note,
          enabled: entry.enabled,
        })),
        mode,
      );
      results.set(row.file.id, outcome);
    }
  });

  for (const row of pending) {
    const outcome = results.get(row.file.id);
    success(
      `${row.local} ${symbols.arrow} ${mappingLabel(data, row.rm)}`,
      outcome
        ? `${outcome.added} added, ${outcome.updated} updated, ${outcome.skipped} unchanged`
        : undefined,
    );
  }
  return 0;
}

export async function push(args: ParsedArgs): Promise<number> {
  const cwd = process.cwd();
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  let data = client.data;

  const linkForNames = readLink(cwd);
  const linkedMaps = linkForNames ? resolvedMappings(data, linkForNames.link) : [];
  let source = args.positional[0] ?? flagString(args, 'source');

  if (!flagString(args, 'file', 'f') && linkForNames && linkedMaps.length > 1) {
    if (!source) {
      if (flagBool(args, 'all')) return pushMappings(client, data, linkedMaps, args);
      const focus = focusedMapping(data, linkForNames.link);
      return pushMappings(client, data, focus ? [focus] : linkedMaps, args);
    }
    const base = path.basename(source);
    const hit =
      linkedMaps.find((rm) => mappingLocalName(data, rm) === base) ??
      matchMappings(data, linkedMaps, base)[0];
    if (hit) {
      args = { ...args, flags: { ...args.flags, file: filePath(data, hit.fileId) } };
    }
  }

  if (!source && linkedMaps.length === 1) {
    const mapped = mappingLocalName(data, linkedMaps[0]);
    if (existsSync(path.join(cwd, mapped))) source = mapped;
  }

  if (!source) {
    const candidates = findLocalEnvFiles(cwd);
    if (candidates.length === 0) {
      failure('No env file was found here. Pass one: fuse push .env');
      return 1;
    }
    source =
      candidates.length === 1 || !isInteractive()
        ? candidates[0]
        : await select<string>(
            'Which local file do you want to send?',
            candidates.map<Choice<string>>((name) => ({
              value: name,
              label: name,
              hint: `${
                readFileSync(path.join(cwd, name), 'utf8')
                  .split('\n')
                  .filter((l) => l.trim() && !l.trim().startsWith('#')).length
              } lines`,
            })),
          );
  }

  const sourcePath = path.isAbsolute(source) ? source : path.join(cwd, source);
  if (!existsSync(sourcePath)) {
    failure(`${sourcePath} does not exist`);
    return 1;
  }

  const raw = readFileSync(sourcePath, 'utf8');
  const format =
    (flagString(args, 'format') as EnvFormat | undefined) ??
    detectFormat(path.basename(sourcePath), raw);
  const parsed = parseText(raw, format);

  if (parsed.entries.length === 0) {
    failure(`No variables were found in ${path.basename(sourcePath)}`);
    parsed.errors.slice(0, 5).forEach((error) => print(`    ${c.grey(error)}`));
    return 1;
  }

  heading('Push', path.basename(sourcePath));
  keyValue([
    ['file', c.bold(sourcePath)],
    ['format', FORMAT_LABELS[format]],
    ['variables', String(parsed.entries.length)],
  ]);
  if (parsed.errors.length > 0) {
    print();
    parsed.errors.slice(0, 5).forEach((error) => warn(error));
  }
  print();

  let target = flagString(args, 'file', 'f')
    ? findFile(data, flagString(args, 'file', 'f') as string)
    : null;

  if (!target) {
    const linked = readLink(cwd);
    const linkedId = linked ? resolveLinkedFile(data, linked.link) : null;
    if (linkedId) target = data.files.find((f) => f.id === linkedId) ?? null;
  }

  if (!target) {
    if (!isInteractive()) {
      failure('Pass --file "Workspace/Project/folder/.env" when running without a terminal.');
      return 1;
    }

    let workspace = await pickWorkspace(data, 'Which workspace should this go to?');
    if (!workspace) {
      const name = await text('Name the first workspace', { initial: 'Personal' });
      data = await client.save((draft) => {
        createWorkspace(draft, name);
      });
      workspace = data.workspaces[data.workspaces.length - 1];
    }

    let project = await (async () => {
      const list = data.projects.filter((p) => p.workspaceId === workspace?.id);
      if (list.length === 0) return null;
      const choice = await select<string>('Which project?', [
        ...list.map<Choice<string>>((p) => ({ value: p.id, label: p.name })),
        { value: '__new__', label: c.green('+ new project') },
      ]);
      return choice === '__new__' ? null : (list.find((p) => p.id === choice) ?? null);
    })();

    if (!project) {
      const suggested = path.basename(cwd);
      const name = await text('Name the project', { initial: suggested });
      const workspaceId = workspace.id;
      data = await client.save((draft) => {
        createProject(draft, workspaceId, name);
      });
      project = data.projects[data.projects.length - 1];
    }

    const folderChoice = await select<string>('Which folder?', [
      ...data.folders
        .filter((f) => f.projectId === project?.id)
        .map<Choice<string>>((f) => ({ value: f.id, label: f.name })),
      { value: '__root__', label: c.grey('(project root)') },
      { value: '__new__', label: c.green('+ new folder') },
    ]);

    let folderId: string | null =
      folderChoice === '__root__' || folderChoice === '__new__' ? null : folderChoice;
    if (folderChoice === '__new__') {
      const name = await text('Name the folder', { initial: 'development' });
      const projectId = project.id;
      data = await client.save((draft) => {
        const created = createFolder(draft, projectId, null, name);
        folderId = created.id;
      });
      folderId = data.folders[data.folders.length - 1].id;
    }

    const existing = data.files.filter(
      (f) => f.projectId === project?.id && f.folderId === folderId,
    );
    const fileChoice = await select<string>('Which env file?', [
      ...existing.map<Choice<string>>((f) => ({
        value: f.id,
        label: f.name,
        hint: `${data.vars.filter((v) => v.fileId === f.id).length} vars`,
      })),
      { value: '__new__', label: c.green(`+ new file (${path.basename(sourcePath)})`) },
    ]);

    if (fileChoice === '__new__') {
      const name = await text('Name the file', { initial: path.basename(sourcePath) });
      const projectId = project.id;
      const parentFolder = folderId;
      data = await client.save((draft) => {
        createFile(draft, projectId, parentFolder, name, format);
      });
      target = data.files[data.files.length - 1];
    } else {
      target = data.files.find((f) => f.id === fileChoice) ?? null;
    }
  }

  if (!target) {
    failure('No destination was chosen');
    return 1;
  }

  const destination = target;
  const existingVars = varsOf(data, destination.id);
  const conflicts = parsed.entries.filter((entry) =>
    existingVars.some((v) => v.key === entry.key && v.value !== entry.value),
  );

  let mode: ImportMode = (flagString(args, 'mode') as ImportMode | undefined) ?? 'merge';
  if (conflicts.length > 0 && !flagBool(args, 'yes', 'y')) {
    print();
    warn(
      `${conflicts.length} keys already exist in ${filePath(data, destination.id)} with a different value`,
    );
    conflicts.slice(0, 8).forEach((entry) => {
      const current = existingVars.find((v) => v.key === entry.key);
      diffLine(
        '~',
        `${entry.key}: ${current?.secret ? '••••' : current?.value} ${symbols.arrow} ${entry.value}`,
      );
    });
    if (conflicts.length > 8) print(`  ${c.grey(`and ${conflicts.length - 8} more`)}`);
    print();

    if (!isInteractive()) {
      failure('Re-run with --yes --mode merge|skip|replace to decide without a prompt.');
      return 1;
    }
    mode = await select<ImportMode>('What should happen to those keys?', [
      { value: 'merge', label: 'Overwrite them', hint: 'the local file wins' },
      { value: 'skip', label: 'Keep what is in the vault', hint: 'only add new keys' },
      {
        value: 'replace',
        label: 'Replace the whole file',
        hint: 'remove keys not in the local file',
      },
    ]);
  }

  const result = await (async () => {
    let outcome = { added: 0, updated: 0, skipped: 0, removed: 0 };
    await client.save((draft) => {
      outcome = upsertVars(
        draft,
        destination.id,
        parsed.entries.map((entry) => ({
          key: entry.key,
          value: entry.value,
          note: entry.note,
          enabled: entry.enabled,
        })),
        mode,
      );
    });
    return outcome;
  })();

  rememberLocalName(linkForNames, destination.id, path.basename(sourcePath));

  const alreadyLinked = Boolean(linkForNames);
  if (!alreadyLinked && !flagBool(args, 'no-link')) {
    const fresh = client.data;
    const destProject = fresh.projects.find((p) => p.id === destination.projectId);
    const destWorkspace = fresh.workspaces.find((w) => w.id === destProject?.workspaceId);
    const label = listEnvironments(fresh, destination.projectId, destination.id).find(
      (env) => env.fileId === destination.id,
    )?.label;

    writeLink(cwd, {
      version: 1,
      workspace: destWorkspace?.name,
      project: destProject?.name,
      environment: label,
      folder: folderPath(fresh, destination.folderId).join('/') || undefined,
      file: destination.name,
      local: path.basename(sourcePath),
      fileId: destination.id,
      projectId: destination.projectId,
      folderId: destination.folderId ?? undefined,
    });

    if (destProject && !destProject.links.includes(cwd)) {
      const projectId = destProject.id;
      await client.save((draft) => {
        const found = draft.projects.find((p) => p.id === projectId);
        if (found && !found.links.includes(cwd)) found.links.push(cwd);
      });
    }
  }

  success(
    `${path.basename(sourcePath)} ${symbols.arrow} ${filePath(client.data, destination.id)}`,
    `${result.added} added, ${result.updated} updated, ${result.skipped} unchanged${result.removed ? `, ${result.removed} removed` : ''}`,
  );

  if (!alreadyLinked && !flagBool(args, 'no-link')) {
    info('Linked this folder', 'fuse pull and fuse use now work here without arguments');
  }

  return 0;
}

async function syncMappings(
  client: Awaited<ReturnType<typeof connect>>,
  data: VaultData,
  list: ResolvedMapping[],
  args: ParsedArgs,
): Promise<number> {
  const cwd = process.cwd();
  const rows = buildPullRows(data, list, cwd);
  const pushRows = new Map<string, { added: number; updated: number }>();

  for (const rm of list) {
    const file = data.files.find((f) => f.id === rm.fileId);
    if (!file) continue;
    const local = mappingLocalName(data, rm);
    const target = path.isAbsolute(local) ? local : path.join(cwd, local);
    if (!existsSync(target)) continue;
    const raw = readFileSync(target, 'utf8');
    const entries = parseText(raw, detectFormat(local, raw)).entries;
    const current = new Map(varsOf(data, file.id).map((v) => [v.key, v.value]));
    let added = 0;
    let updated = 0;
    for (const entry of entries) {
      if (!current.has(entry.key)) added += 1;
      else if (current.get(entry.key) !== entry.value) updated += 1;
    }
    pushRows.set(rm.fileId, { added, updated });
  }

  heading('Sync', `${rows.length} environments against this folder`);
  table(
    ['environment', 'local file', 'state'],
    rows.map((row) => {
      const local = pushRows.get(row.rm.fileId);
      const localAhead = (local?.added ?? 0) + (local?.updated ?? 0);
      const state =
        row.state === 'new'
          ? c.grey('no local file yet')
          : row.state === 'same' && localAhead === 0
            ? c.grey('in sync')
            : [
                row.state === 'differs'
                  ? c.blue(`vault differs by ${row.added + row.changed + row.removed}`)
                  : '',
                localAhead > 0 ? c.green(`local adds ${localAhead}`) : '',
              ]
                .filter(Boolean)
                .join(', ');
      return [mappingLabel(data, row.rm), row.local, state];
    }),
    [24, 24, 44],
  );
  print();

  const pending = rows.filter(
    (row) =>
      row.state !== 'same' ||
      (pushRows.get(row.rm.fileId)?.added ?? 0) + (pushRows.get(row.rm.fileId)?.updated ?? 0) > 0,
  );
  if (pending.length === 0) {
    success('Everything is in sync');
    return 0;
  }

  const direction = flagString(args, 'direction') as 'pull' | 'push' | undefined;
  if (direction === 'pull')
    return pullMappings(data, list, { ...args, flags: { ...args.flags, yes: true } });
  if (direction === 'push')
    return pushMappings(client, data, list, { ...args, flags: { ...args.flags, yes: true } });

  if (!isInteractive()) {
    info('Pick a direction for all of them', '--direction pull|push, with --yes');
    return 0;
  }

  const picked = await select<'pull' | 'push' | 'cancel'>('Which way, for all of them?', [
    { value: 'pull', label: 'Take the vault versions', hint: 'overwrite the local files' },
    { value: 'push', label: 'Take the local versions', hint: 'update the vault' },
    { value: 'cancel', label: 'Cancel' },
  ]);
  if (picked === 'pull') return pullMappings(data, list, args);
  if (picked === 'push') return pushMappings(client, data, list, args);
  info('Nothing changed');
  return 0;
}

export async function sync(args: ParsedArgs): Promise<number> {
  const cwd = process.cwd();
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;

  const foundSync = readLink(cwd);
  const syncMaps = foundSync ? resolvedMappings(data, foundSync.link) : [];
  if (!flagString(args, 'file', 'f') && !args.positional[0] && syncMaps.length > 1) {
    if (flagBool(args, 'all')) return syncMappings(client, data, syncMaps, args);
    const focus = foundSync ? focusedMapping(data, foundSync.link) : null;
    return syncMappings(client, data, focus ? [focus] : syncMaps, args);
  }

  const file = await resolveTargetFile(data, args, cwd);
  if (!file) return 1;

  const localName = flagString(args, 'as') ?? file.name;
  const localPath = path.isAbsolute(localName) ? localName : path.join(cwd, localName);
  if (!existsSync(localPath)) {
    warn(`${localPath} does not exist yet`);
    return pull(args);
  }

  const raw = readFileSync(localPath, 'utf8');
  const parsed = parseText(raw, detectFormat(path.basename(localPath), raw));
  const remote = varsOf(data, file.id);

  const localMap = new Map(parsed.entries.map((e) => [e.key, e.value]));
  const remoteMap = new Map(remote.map((v) => [v.key, v.value]));
  const keys = [...new Set([...localMap.keys(), ...remoteMap.keys()])].sort();

  const onlyLocal: string[] = [];
  const onlyRemote: string[] = [];
  const differ: string[] = [];
  for (const key of keys) {
    const l = localMap.get(key);
    const r = remoteMap.get(key);
    if (l !== undefined && r === undefined) onlyLocal.push(key);
    else if (l === undefined && r !== undefined) onlyRemote.push(key);
    else if (l !== r) differ.push(key);
  }

  heading('Sync', `${path.basename(localPath)} ${symbols.arrow} ${filePath(data, file.id)}`);
  if (onlyLocal.length === 0 && onlyRemote.length === 0 && differ.length === 0) {
    success('Both sides already match');
    return 0;
  }

  table(
    ['status', 'key', 'local', 'vault'],
    [
      ...onlyLocal.map((key) => [c.green('local only'), key, localMap.get(key) ?? '', c.grey('—')]),
      ...onlyRemote.map((key) => {
        const variable = remote.find((v) => v.key === key);
        return [
          c.blue('vault only'),
          key,
          c.grey('—'),
          variable?.secret ? '••••' : (variable?.value ?? ''),
        ];
      }),
      ...differ.map((key) => {
        const variable = remote.find((v) => v.key === key);
        return [
          c.yellow('differs'),
          key,
          localMap.get(key) ?? '',
          variable?.secret ? '••••' : (variable?.value ?? ''),
        ];
      }),
    ],
    [12, 32, 30, 30],
  );
  print();

  if (!isInteractive() && !flagBool(args, 'yes', 'y')) {
    info('Run this in a terminal, or pass --yes with --direction pull|push');
    return 0;
  }

  const direction =
    (flagString(args, 'direction') as 'pull' | 'push' | undefined) ??
    (await select<'pull' | 'push' | 'cancel'>('Which way?', [
      { value: 'pull', label: 'Take the vault version', hint: 'overwrite the local file' },
      { value: 'push', label: 'Take the local version', hint: 'update the vault' },
      { value: 'cancel', label: 'Cancel' },
    ]));

  if (direction === 'pull') return pull({ ...args, flags: { ...args.flags, yes: true } });
  if (direction === 'push') {
    return push({
      ...args,
      positional: [localPath],
      flags: { ...args.flags, yes: true, file: filePath(data, file.id) },
    });
  }
  info('Nothing changed');
  return 0;
}

export type Environment = {
  fileId: string;
  label: string;
  folder: string;
  file: string;
  vars: number;
  current: boolean;
};

export function listEnvironments(
  data: VaultData,
  projectId: string,
  currentFileId: string | null,
): Environment[] {
  const files = data.files.filter((f) => f.projectId === projectId);
  const byFolder = new Map<string, number>();
  for (const file of files) {
    const key = folderPath(data, file.folderId).join('/');
    byFolder.set(key, (byFolder.get(key) ?? 0) + 1);
  }

  return files
    .map((file) => {
      const folder = folderPath(data, file.folderId).join('/');
      const crowded = (byFolder.get(folder) ?? 0) > 1;
      const label = folder ? (crowded ? `${folder}/${file.name}` : folder) : file.name;
      return {
        fileId: file.id,
        label,
        folder,
        file: file.name,
        vars: data.vars.filter((v) => v.fileId === file.id).length,
        current: file.id === currentFileId,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function narrow(matches: Environment[], current: Environment | undefined): Environment[] {
  if (matches.length <= 1 || !current) return matches;
  const sameName = matches.filter((env) => env.file === current.file);
  return sameName.length === 1 ? sameName : matches;
}

function matchEnvironment(list: Environment[], query: string): Environment[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const current = list.find((env) => env.current);

  const exact = list.filter(
    (env) =>
      env.label.toLowerCase() === term ||
      env.folder.toLowerCase() === term ||
      env.file.toLowerCase() === term,
  );
  if (exact.length > 0) return narrow(exact, current);

  return narrow(
    list.filter(
      (env) =>
        env.label.toLowerCase().includes(term) ||
        env.folder.toLowerCase().includes(term) ||
        env.file.toLowerCase().includes(term),
    ),
    current,
  );
}

function printMappingTable(
  data: VaultData,
  found: { dir: string; link: LinkFile },
  maps: ResolvedMapping[],
): void {
  const focus = focusedMapping(data, found.link);
  table(
    ['', 'environment', 'vault file', 'local file', 'here'],
    maps.map((rm) => {
      const file = data.files.find((f) => f.id === rm.fileId);
      const local = mappingLocalName(data, rm);
      const exists = existsSync(path.join(found.dir, local));
      const current = rm.fileId === focus?.fileId;
      return [
        current ? c.green(symbols.tick) : ' ',
        current ? c.brightCyan(mappingLabel(data, rm)) : mappingLabel(data, rm),
        c.grey(file?.name ?? ''),
        local,
        exists ? '' : c.grey('not pulled yet'),
      ];
    }),
    [2, 22, 18, 22, 16],
  );
}

export async function switchFocus(args: ParsedArgs): Promise<number> {
  const cwd = process.cwd();
  const client = await connect({ preferDirect: flagBool(args, 'direct'), quiet: true });
  const data = client.data;

  const found = readLink(cwd);
  if (!found) {
    failure('This folder is not linked to anything');
    info('Link it first with', 'fuse link');
    return 1;
  }

  const maps = resolvedMappings(data, found.link);
  if (maps.length === 0) {
    failure('The link in this folder points at things that no longer exist');
    info('Repair it with', 'fuse link');
    return 1;
  }

  const current = focusedMapping(data, found.link);

  if (flagBool(args, 'list') || flagBool(args, 'json')) {
    if (flagBool(args, 'json')) {
      print(
        JSON.stringify(
          maps.map((rm) => ({
            environment: mappingLabel(data, rm),
            local: mappingLocalName(data, rm),
            focused: rm.fileId === current?.fileId,
          })),
          null,
          2,
        ),
      );
      return 0;
    }
    heading('Mapped here', found.link.project ?? '');
    printMappingTable(data, found, maps);
    print();
    info('Move the focus with', 'fuse switch <environment>');
    return 0;
  }

  if (maps.length === 1) {
    info(
      'Only one file is mapped here',
      `${mappingLocalName(data, maps[0])} ${symbols.arrow} ${mappingLabel(data, maps[0])}`,
    );
    info('Swap the environment inside it with', 'fuse use <environment>');
    return 0;
  }

  const query = args.positional[0];
  let target: ResolvedMapping | null = null;

  if (query) {
    const hits = matchMappings(data, maps, query);
    if (hits.length === 0) {
      failure(`No mapped environment here matched "${query}"`);
      maps.forEach((rm) => print(`    ${c.grey(mappingLabel(data, rm))}`));
      return 1;
    }
    if (hits.length > 1) {
      if (!isInteractive()) {
        failure(`"${query}" matched several mapped environments. Be more specific.`);
        hits.forEach((rm) => print(`    ${c.grey(mappingLabel(data, rm))}`));
        return 1;
      }
      const picked = await select<string>(
        `"${query}" matched several`,
        hits.map<Choice<string>>((rm) => ({
          value: rm.fileId,
          label: mappingLabel(data, rm),
          hint: mappingLocalName(data, rm),
        })),
      );
      target = hits.find((rm) => rm.fileId === picked) ?? null;
    } else {
      target = hits[0];
    }
  } else {
    if (!isInteractive()) {
      failure('Give an environment: fuse switch production');
      maps.forEach((rm) => print(`    ${c.grey(mappingLabel(data, rm))}`));
      return 1;
    }
    const picked = await select<string>(
      'Which file should the focus move to?',
      maps.map<Choice<string>>((rm) => ({
        value: rm.fileId,
        label:
          rm.fileId === current?.fileId
            ? `${mappingLabel(data, rm)} ${c.grey('(current)')}`
            : mappingLabel(data, rm),
        hint: mappingLocalName(data, rm),
      })),
      {
        initial: Math.max(
          0,
          maps.findIndex((rm) => rm.fileId === current?.fileId),
        ),
      },
    );
    target = maps.find((rm) => rm.fileId === picked) ?? null;
  }

  if (!target) return 1;

  if (target.fileId === current?.fileId) {
    info(`Already on ${mappingLabel(data, target)}`, mappingLocalName(data, target));
    return 0;
  }

  writeLink(found.dir, { ...found.link, focus: target.fileId });
  success(
    `Now on ${mappingLabel(data, target)}`,
    `${mappingLocalName(data, target)} — pull, push, use, get, set and run act on it`,
  );
  return 0;
}

export async function use(args: ParsedArgs): Promise<number> {
  const cwd = process.cwd();
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;

  const found = readLink(cwd);
  if (!found) {
    failure('This folder is not linked to anything');
    info('Link it first with', 'fuse link');
    return 1;
  }

  const currentFileId = resolveLinkedFile(data, found.link);
  const projectId =
    found.link.projectId && data.projects.some((p) => p.id === found.link.projectId)
      ? found.link.projectId
      : (data.files.find((f) => f.id === currentFileId)?.projectId ?? null);

  if (!projectId) {
    failure('The link in this folder points at a project that no longer exists');
    info('Link it again with', 'fuse link');
    return 1;
  }

  const environments = listEnvironments(data, projectId, currentFileId);
  const project = data.projects.find((p) => p.id === projectId);

  if (environments.length === 0) {
    failure(`${project?.name ?? 'That project'} has no env files yet`);
    return 1;
  }

  const useMaps = resolvedMappings(data, found.link);
  const useFocus = useMaps.length > 1 ? focusedMapping(data, found.link) : null;
  if (useMaps.length > 1 && (flagBool(args, 'list') || flagBool(args, 'json'))) {
    return switchFocus(args);
  }

  if (flagBool(args, 'list') || flagBool(args, 'json')) {
    if (flagBool(args, 'json')) {
      print(JSON.stringify(environments, null, 2));
      return 0;
    }
    heading('Environments', project?.name ?? '');
    table(
      ['', 'environment', 'file', 'variables'],
      environments.map((env) => [
        env.current ? c.green(symbols.tick) : ' ',
        env.current ? c.brightCyan(env.label) : env.label,
        c.grey(env.file),
        String(env.vars),
      ]),
      [2, 34, 24, 10],
    );
    print();
    info('Switch with', 'fuse use <environment>');
    return 0;
  }

  const query = args.positional[0];
  let target: Environment | null = null;

  if (query) {
    const matches = matchEnvironment(environments, query);
    if (matches.length === 0) {
      failure(`No environment in ${project?.name ?? 'this project'} matched "${query}"`);
      info('Available', environments.map((env) => env.label).join(', '));
      return 1;
    }
    if (matches.length > 1) {
      if (!isInteractive()) {
        failure(`"${query}" matched ${matches.length} environments. Be more specific.`);
        matches.forEach((env) => print(`    ${c.grey(env.label)}`));
        return 1;
      }
      const picked = await select<string>(
        `"${query}" matched several`,
        matches.map<Choice<string>>((env) => ({ value: env.fileId, label: env.label })),
      );
      target = matches.find((env) => env.fileId === picked) ?? null;
    } else {
      target = matches[0];
    }
  } else {
    if (!isInteractive()) {
      failure('Give an environment: fuse use production');
      info('Available', environments.map((env) => env.label).join(', '));
      return 1;
    }
    const picked = await select<string>(
      `Which environment for ${project?.name ?? 'this folder'}?`,
      environments.map<Choice<string>>((env) => ({
        value: env.fileId,
        label: env.current ? `${env.label} ${c.grey('(current)')}` : env.label,
        hint: `${env.file} · ${env.vars} vars`,
      })),
      {
        initial: Math.max(
          0,
          environments.findIndex((env) => env.current),
        ),
      },
    );
    target = environments.find((env) => env.fileId === picked) ?? null;
  }

  if (!target) return 1;

  const file = data.files.find((f) => f.id === target.fileId);
  if (!file) {
    failure('That env file no longer exists');
    return 1;
  }

  if (useFocus) {
    if (target.fileId === useFocus.fileId) {
      info(`${mappingLocalName(data, useFocus)} already holds ${mappingLabel(data, useFocus)}`);
      return 0;
    }
    const elsewhere = useMaps.find(
      (rm) => rm.fileId === target.fileId && rm.fileId !== useFocus.fileId,
    );
    if (elsewhere) {
      warn(`${target.label} already lives in ${mappingLocalName(data, elsewhere)} here`);
      info('Work on it with', `fuse switch ${target.label}`);
      return 1;
    }

    const localName = mappingLocalName(data, useFocus);
    const retargeted: LinkMapping = {
      environment: target.label,
      folder: folderPath(data, file.folderId).join('/') || undefined,
      file: file.name,
      local: localName,
      fileId: file.id,
      folderId: file.folderId ?? undefined,
    };
    const nextMappings = mappingsOf(found.link).map((m) =>
      m.fileId === useFocus.fileId ? retargeted : m,
    );
    writeLink(found.dir, { ...found.link, mappings: nextMappings, focus: file.id });
    success(`${localName} now holds ${target.label}`, 'the mapping moved with it');
    return pullMappings(data, [{ mapping: retargeted, fileId: file.id }], {
      ...args,
      positional: [],
      flags: { ...args.flags, yes: true },
    });
  }

  const workspace = data.workspaces.find((w) => w.id === project?.workspaceId);
  writeLink(found.dir, {
    version: 1,
    workspace: workspace?.name,
    project: project?.name,
    environment: target.label,
    folder: folderPath(data, file.folderId).join('/') || undefined,
    file: file.name,
    local: found.link.local,
    fileId: file.id,
    projectId: file.projectId,
    folderId: file.folderId ?? undefined,
  });

  const localName = found.link.local ?? file.name;

  return pull({
    ...args,
    positional: [],
    flags: { ...args.flags, file: filePath(data, file.id), as: localName },
  });
}

export async function link(args: ParsedArgs): Promise<number> {
  const cwd = process.cwd();
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;

  const existing = readLink(cwd);
  let addMode = flagBool(args, 'add');
  if (existing && !addMode && !flagBool(args, 'yes', 'y')) {
    const existingMaps = resolvedMappings(data, existing.link);
    if (existingMaps.length > 0 && isInteractive()) {
      const already = existingMaps.map((rm) => mappingLabel(data, rm)).join(', ');
      const what = await select<'add' | 'replace' | 'cancel'>(
        `This folder is already linked to ${already}`,
        [
          {
            value: 'add',
            label: 'Map another environment alongside it',
            hint: 'each gets its own local file',
          },
          { value: 'replace', label: 'Replace the link', hint: 'start over' },
          { value: 'cancel', label: 'Cancel' },
        ],
      );
      if (what === 'cancel') return 0;
      addMode = what === 'add';
    } else if (existingMaps.length > 0) {
      info('This folder is already linked', 'replacing it; pass --add to map another environment');
    }
  }

  let file: EnvFile | null = null;

  const fileSpec = flagString(args, 'file', 'f');
  if (fileSpec) {
    file = findFile(data, fileSpec) ?? findFiles(data, fileSpec)[0] ?? null;
    if (!file) {
      failure(`Nothing in the vault matched "${fileSpec}"`);
      return 1;
    }
  }

  let project = file ? (data.projects.find((p) => p.id === file?.projectId) ?? null) : null;

  if (!project) {
    const projectSpec = flagString(args, 'project') ?? args.positional[0];
    if (projectSpec) {
      project = findProject(data, projectSpec);
      if (!project) {
        failure(`No project matched "${projectSpec}"`);
        info('Available', data.projects.map((p) => p.name).join(', ') || 'none yet');
        return 1;
      }
    } else {
      if (!isInteractive()) {
        failure('Give a project: fuse link --project "Storefront API"');
        return 1;
      }
      const workspace = await pickWorkspace(data, 'Which workspace is this folder from?');
      if (!workspace) {
        failure('There are no workspaces yet');
        info('Create one with', 'fuse workspace add "Acme Studio"');
        return 1;
      }
      project = await pickProject(data, workspace.id, 'Which project is this folder?');
      if (!project) {
        failure(`${workspace.name} has no projects yet`);
        info('Create one with', 'fuse project add "Storefront API"');
        return 1;
      }
    }
  }

  const environments = listEnvironments(data, project.id, file?.id ?? null);
  if (environments.length === 0) {
    failure(`${project.name} has no env files yet`);
    info('Create one with', 'fuse file add .env');
    return 1;
  }

  if (!file) {
    if (environments.length === 1) {
      file = data.files.find((f) => f.id === environments[0].fileId) ?? null;
    } else if (isInteractive()) {
      const picked = await select<string>(
        `Which environment should this folder start on?`,
        environments.map<Choice<string>>((env) => ({
          value: env.fileId,
          label: env.label,
          hint: `${env.file} · ${env.vars} vars`,
        })),
      );
      file = data.files.find((f) => f.id === picked) ?? null;
    } else {
      failure(
        `${project.name} has several environments. Pick one with --file, or run this in a terminal.`,
      );
      environments.forEach((env) => print(`    ${c.grey(env.label)}`));
      return 1;
    }
  }

  if (!file) return 1;

  const chosen = file;
  const workspace = data.workspaces.find((w) => w.id === project?.workspaceId);
  const environment = environments.find((env) => env.fileId === chosen.id);

  const priorMappings = addMode && existing ? mappingsOf(existing.link) : [];
  if (priorMappings.some((m) => m.fileId === chosen.id)) {
    info('That environment is already mapped here', environment?.label ?? chosen.name);
    return 0;
  }

  const takenLocals = existing
    ? resolvedMappings(data, existing.link).map((rm) => mappingLocalName(data, rm))
    : [];
  const suggested =
    addMode && takenLocals.includes(chosen.name)
      ? `${(environment?.label ?? chosen.name).replace(/[^A-Za-z0-9.-]+/g, '-').toLowerCase()}.env`
      : null;

  let localName: string | null;
  if (addMode && suggested && !flagString(args, 'as')) {
    localName = isInteractive()
      ? await text(`Which local file should ${environment?.label ?? chosen.name} live in?`, {
          initial: suggested,
        })
      : suggested;
  } else {
    localName = await chooseLocalName(cwd, chosen.name, null, flagString(args, 'as'));
  }
  if (!localName) return 1;

  const newMapping: LinkMapping = {
    environment: environment?.label,
    folder: folderPath(data, chosen.folderId).join('/') || undefined,
    file: chosen.name,
    local: localName,
    fileId: chosen.id,
    folderId: chosen.folderId ?? undefined,
  };

  const target = writeMappings(
    cwd,
    {
      version: 1,
      workspace: workspace?.name,
      project: project.name,
      projectId: chosen.projectId,
    },
    [...priorMappings, newMapping],
  );

  if (!project.links.includes(cwd)) {
    const projectId = project.id;
    await client.save((draft) => {
      const found = draft.projects.find((p) => p.id === projectId);
      if (found && !found.links.includes(cwd)) found.links.push(cwd);
    });
  }

  success('Linked', path.basename(target));
  const allMappings = [...priorMappings, newMapping];
  keyValue([
    ['project', c.brightCyan(project.name)],
    ...allMappings.map((m): [string, string] => [
      m.fileId === chosen.id ? 'now mapped' : 'also mapped',
      `${c.bold(m.local ?? m.file ?? '')} ${c.grey(`${symbols.arrow} ${m.environment ?? m.file ?? ''}`)}`,
    ]),
    [
      'available',
      environments
        .map((env) =>
          allMappings.some((m) => m.fileId === env.fileId)
            ? c.brightCyan(env.label)
            : c.grey(env.label),
        )
        .join('  '),
    ],
  ]);
  print();
  box(
    [
      `${c.bold('fuse pull')}              ${c.grey('writes the current environment here')}`,
      `${c.bold('fuse use <environment>')} ${c.grey('switches this folder to another one')}`,
      `${c.bold('fuse push')}              ${c.grey('sends your local changes back')}`,
    ],
    'info',
  );
  return 0;
}

export async function unlink(args: ParsedArgs): Promise<number> {
  const cwd = process.cwd();
  const found = readLink(cwd);
  if (!found) {
    warn('This folder is not linked');
    return 0;
  }

  const name = args.positional[0];
  if (name) {
    const client = await connect({ preferDirect: flagBool(args, 'direct') }).catch(() => null);
    const data = client?.data;
    if (!data) {
      failure('The vault could not be opened');
      return 1;
    }
    const maps = resolvedMappings(data, found.link);
    const hits = matchMappings(data, maps, name);
    if (hits.length === 0) {
      failure(`No mapped environment here matched "${name}"`);
      maps.forEach((rm) => print(`    ${c.grey(mappingLabel(data, rm))}`));
      return 1;
    }
    if (hits.length > 1) {
      failure(`"${name}" matched several mapped environments. Be more specific.`);
      hits.forEach((rm) => print(`    ${c.grey(mappingLabel(data, rm))}`));
      return 1;
    }
    if (maps.length === 1) {
      info('That is the only mapping here', 'removing the whole link instead');
    } else {
      const keep = mappingsOf(found.link).filter((m) => m.fileId !== hits[0].fileId);
      writeMappings(found.dir, found.link, keep);
      success(
        `Unmapped ${mappingLabel(data, hits[0])}`,
        `${keep.length} mapping${keep.length === 1 ? '' : 's'} left`,
      );
      return 0;
    }
  }

  if (!flagBool(args, 'yes', 'y') && isInteractive()) {
    const ok = await confirm(`Remove the link in ${found.dir}?`, true);
    if (!ok) return 0;
  }
  const client = await connect({ preferDirect: flagBool(args, 'direct') }).catch(() => null);
  if (client) {
    await client.save((draft) => {
      for (const project of draft.projects) {
        project.links = project.links.filter((l) => path.resolve(l) !== path.resolve(found.dir));
      }
    });
  }
  const { removeLink } = await import('../core/link');
  removeLink(found.dir);
  success('Unlinked', found.dir);
  return 0;
}
