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
  projectForDirectory,
  readLink,
  resolveLinkedFile,
  writeLink,
  type LinkFile,
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
  link: { dir: string; link: LinkFile } | null,
  explicit: string | undefined,
): Promise<string | null> {
  if (explicit) return explicit;
  if (link?.link.local) return link.link.local;
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
  if (!link || link.link.fileId !== fileId) return;
  if (link.link.local === localName) return;
  writeLink(link.dir, { ...link.link, local: localName });
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
    const fileId = resolveLinkedFile(data, linked.link);
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

export async function pull(args: ParsedArgs): Promise<number> {
  const cwd = process.cwd();
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;

  const bare = args.positional[0];
  if (bare && !flagString(args, 'file', 'f')) {
    const found = readLink(cwd);
    const projectId = found?.link.projectId;
    if (projectId && data.projects.some((p) => p.id === projectId)) {
      const named = listEnvironments(data, projectId, resolveLinkedFile(data, found.link)).some(
        (env) =>
          env.label.toLowerCase() === bare.toLowerCase() ||
          env.folder.toLowerCase() === bare.toLowerCase() ||
          env.file.toLowerCase() === bare.toLowerCase(),
      );
      if (named) return use(args);
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
  const outName = await chooseLocalName(cwd, file.name, linkForNames, flagString(args, 'as', 'o'));
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

export async function push(args: ParsedArgs): Promise<number> {
  const cwd = process.cwd();
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  let data = client.data;

  const linkForNames = readLink(cwd);
  let source = args.positional[0] ?? flagString(args, 'source');

  if (!source && linkForNames?.link.local && existsSync(path.join(cwd, linkForNames.link.local))) {
    source = linkForNames.link.local;
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

export async function sync(args: ParsedArgs): Promise<number> {
  const cwd = process.cwd();
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;

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

  const localName = await chooseLocalName(cwd, chosen.name, null, flagString(args, 'as'));
  if (!localName) return 1;

  const target = writeLink(cwd, {
    version: 1,
    workspace: workspace?.name,
    project: project.name,
    environment: environment?.label,
    folder: folderPath(data, chosen.folderId).join('/') || undefined,
    file: chosen.name,
    local: localName,
    fileId: chosen.id,
    projectId: chosen.projectId,
    folderId: chosen.folderId ?? undefined,
  });

  if (!project.links.includes(cwd)) {
    const projectId = project.id;
    await client.save((draft) => {
      const found = draft.projects.find((p) => p.id === projectId);
      if (found && !found.links.includes(cwd)) found.links.push(cwd);
    });
  }

  success('Linked', path.basename(target));
  keyValue([
    ['project', c.brightCyan(project.name)],
    ['on', c.bold(environment?.label ?? chosen.name)],
    [
      'local file',
      `${c.bold(localName)} ${c.grey(`${symbols.arrow} ${chosen.name} in the vault`)}`,
    ],
    [
      'available',
      environments
        .map((env) => (env.fileId === chosen.id ? c.brightCyan(env.label) : c.grey(env.label)))
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
