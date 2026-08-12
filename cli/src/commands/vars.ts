import { spawn } from 'node:child_process';
import path from 'node:path';
import { DEFAULT_SERIALIZE_OPTIONS, serialize } from '@shared/codecs';
import { FORMATS, FORMAT_LABELS, VAR_TYPE_LABELS } from '@shared/env-types';
import { filePath, folderPath, searchVault, varsOf } from '@shared/tree';
import type { EnvFile, EnvFormat, VaultData } from '@shared/types';
import { connect } from '../core/client';
import { removeVars, upsertVars } from '../core/mutations';
import { readLink, resolveLinkedFile, projectForDirectory } from '../core/link';
import { findFile, findFiles, pickFileGuided } from '../core/resolve';
import { c, symbols, truncate } from '../ui/colors';
import { diffLine, failure, heading, info, maskSecret, print, success, table, warn } from '../ui/output';
import { confirm, isInteractive, select, type Choice } from '../ui/prompt';
import { flagBool, flagString, type ParsedArgs } from '../core/args';

export async function resolveFile(
  data: VaultData,
  args: ParsedArgs,
  message = 'Which env file?',
): Promise<EnvFile | null> {
  const spec = flagString(args, 'file', 'f');
  if (spec) {
    const found = findFile(data, spec);
    if (found) return found;
    const matches = findFiles(data, spec);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1 && isInteractive()) {
      const id = await select<string>(
        `"${spec}" matched several files`,
        matches.map<Choice<string>>((file) => ({ value: file.id, label: filePath(data, file.id) })),
      );
      return matches.find((f) => f.id === id) ?? null;
    }
    failure(`Nothing matched "${spec}"`);
    return null;
  }

  const link = readLink(process.cwd());
  if (link) {
    const fileId = resolveLinkedFile(data, link.link);
    if (fileId) return data.files.find((f) => f.id === fileId) ?? null;
  }

  const projectId = projectForDirectory(data, process.cwd());
  if (projectId) {
    const files = data.files.filter((f) => f.projectId === projectId);
    if (files.length === 1) return files[0];
    if (files.length > 1 && isInteractive()) {
      const id = await select<string>(
        message,
        files.map<Choice<string>>((file) => {
          const folder = folderPath(data, file.folderId).join(' / ');
          return { value: file.id, label: folder ? `${folder} / ${file.name}` : file.name };
        }),
      );
      return files.find((f) => f.id === id) ?? null;
    }
  }

  if (!isInteractive()) {
    failure('Pass --file "Workspace/Project/folder/.env"');
    return null;
  }
  return pickFileGuided(data);
}

export async function get(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct'), quiet: true });
  const data = client.data;
  const key = args.positional[0];

  const file = await resolveFile(data, args);
  if (!file) return 1;

  const list = varsOf(data, file.id);

  if (!key) {
    if (flagBool(args, 'json')) {
      const record: Record<string, string> = {};
      list.forEach((v) => {
        record[v.key] = v.value;
      });
      print(JSON.stringify(record, null, 2));
      return 0;
    }
    const format = (flagString(args, 'format') as EnvFormat | undefined) ?? file.format;
    print(
      serialize(
        list.map((v) => ({ key: v.key, value: v.value, note: v.note, enabled: v.enabled, secret: v.secret })),
        format,
        { ...DEFAULT_SERIALIZE_OPTIONS, quoteMode: data.settings.quoteMode },
      ).trimEnd(),
    );
    return 0;
  }

  const variable = list.find((v) => v.key === key || v.key.toLowerCase() === key.toLowerCase());
  if (!variable) {
    failure(`${key} is not in ${filePath(data, file.id)}`);
    const close = list.filter((v) => v.key.toLowerCase().includes(key.toLowerCase())).slice(0, 5);
    if (close.length > 0) info('Did you mean', close.map((v) => v.key).join(', '));
    return 1;
  }

  print(variable.value);
  return 0;
}

export async function set(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;

  const pairs = args.positional.filter((token) => token.includes('='));
  if (pairs.length === 0) {
    failure('Give at least one KEY=VALUE pair');
    info('For example', 'fuse set PORT=3000 LOG_LEVEL=debug');
    return 1;
  }

  const file = await resolveFile(data, args, 'Set them in which file?');
  if (!file) return 1;

  const entries = pairs.map((pair) => {
    const index = pair.indexOf('=');
    return { key: pair.slice(0, index).trim(), value: pair.slice(index + 1) };
  });

  const existing = varsOf(data, file.id);
  const changed = entries.filter((entry) => {
    const current = existing.find((v) => v.key === entry.key);
    return !current || current.value !== entry.value;
  });

  if (changed.length === 0) {
    success('Nothing changed', 'those values are already stored');
    return 0;
  }

  if (!flagBool(args, 'yes', 'y') && isInteractive()) {
    heading('Set', filePath(data, file.id));
    changed.forEach((entry) => {
      const current = existing.find((v) => v.key === entry.key);
      if (!current) diffLine('+', `${entry.key}=${entry.value}`);
      else
        diffLine(
          '~',
          `${entry.key}: ${current.secret ? maskSecret(current.value) : current.value} ${symbols.arrow} ${entry.value}`,
        );
    });
    print();
    const ok = await confirm('Apply these changes?', true);
    if (!ok) {
      info('Nothing changed');
      return 0;
    }
  }

  const fileId = file.id;
  let result = { added: 0, updated: 0, skipped: 0, removed: 0 };
  await client.save((draft) => {
    result = upsertVars(draft, fileId, entries, 'merge');
  });

  success(
    `Updated ${filePath(client.data, fileId)}`,
    `${result.added} added, ${result.updated} changed`,
  );
  return 0;
}

export async function unset(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;

  const keys = args.positional;
  if (keys.length === 0) {
    failure('Give at least one key to remove');
    return 1;
  }

  const file = await resolveFile(data, args, 'Remove them from which file?');
  if (!file) return 1;

  const list = varsOf(data, file.id);
  const targets = list.filter((v) => keys.includes(v.key));
  if (targets.length === 0) {
    failure(`None of those keys are in ${filePath(data, file.id)}`);
    return 1;
  }

  if (!flagBool(args, 'yes', 'y') && isInteractive()) {
    heading('Remove', filePath(data, file.id));
    targets.forEach((variable) =>
      diffLine('-', `${variable.key}=${variable.secret ? maskSecret(variable.value) : variable.value}`),
    );
    print();
    const ok = await confirm(`Remove ${targets.length} variables?`, false);
    if (!ok) {
      info('Nothing changed');
      return 0;
    }
  }

  const ids = targets.map((v) => v.id);
  let removed = 0;
  await client.save((draft) => {
    removed = removeVars(draft, ids);
  });
  success(`Removed ${removed} variables`, filePath(client.data, file.id));
  return 0;
}

export async function list(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct'), quiet: true });
  const data = client.data;
  const spec = args.positional[0];

  if (!spec) {
    heading('Vault');
    for (const workspace of data.workspaces) {
      print(`  ${c.bold(c.brightBlue(workspace.name))}`);
      const projects = data.projects.filter((p) => p.workspaceId === workspace.id);
      projects.forEach((project, index) => {
        const last = index === projects.length - 1;
        print(`  ${c.grey(last ? symbols.lastBranch : symbols.branch)} ${project.name}`);
        const files = data.files.filter((f) => f.projectId === project.id);
        files.forEach((file, fileIndex) => {
          const folder = folderPath(data, file.folderId).join('/');
          const lastFile = fileIndex === files.length - 1;
          print(
            `  ${c.grey(last ? ' ' : symbols.vertical)}  ${c.grey(lastFile ? symbols.lastBranch : symbols.branch)} ${
              folder ? c.grey(`${folder}/`) : ''
            }${file.name} ${c.grey(`(${data.vars.filter((v) => v.fileId === file.id).length})`)}`,
          );
        });
      });
      print();
    }
    return 0;
  }

  const matches = findFiles(data, spec);
  if (matches.length === 0) {
    failure(`Nothing matched "${spec}"`);
    return 1;
  }
  if (matches.length > 1) {
    heading('Matches', spec);
    matches.forEach((file) => print(`  ${filePath(data, file.id)}`));
    return 0;
  }

  const file = matches[0];
  const reveal = flagBool(args, 'reveal', 'values');
  heading(file.name, filePath(data, file.id));
  const rows = varsOf(data, file.id).map((v) => [
    v.enabled ? v.key : c.grey(`# ${v.key}`),
    v.secret && !reveal ? c.grey(maskSecret(v.value)) : truncate(v.value.replace(/\n/g, '\\n'), 48),
    c.grey(VAR_TYPE_LABELS[v.type]),
  ]);
  if (rows.length === 0) {
    info('This file has no variables yet');
    return 0;
  }
  table(['key', 'value', 'type'], rows, [34, 50, 18]);
  return 0;
}

export async function search(args: ParsedArgs): Promise<number> {
  const term = args.positional.join(' ');
  if (!term) {
    failure('Give something to search for');
    return 1;
  }
  const client = await connect({ preferDirect: flagBool(args, 'direct'), quiet: true });
  const hits = searchVault(client.data, term, 100);

  heading('Search', term);
  if (hits.length === 0) {
    info('Nothing matched', 'values of secrets are never searched');
    return 0;
  }
  table(
    ['key', 'where', 'matched'],
    hits.map((hit) => [
      hit.secret ? `${c.yellow('*')} ${hit.key}` : hit.key,
      c.grey(hit.path),
      c.grey(hit.matchedIn),
    ]),
    [30, 60, 10],
  );
  return 0;
}

export async function diff(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct'), quiet: true });
  const data = client.data;

  const leftSpec = args.positional[0];
  const rightSpec = args.positional[1];

  const pick = async (spec: string | undefined, message: string): Promise<EnvFile | null> => {
    if (spec) {
      const found = findFile(data, spec) ?? findFiles(data, spec)[0];
      if (!found) {
        failure(`Nothing matched "${spec}"`);
        return null;
      }
      return found;
    }
    if (!isInteractive()) {
      failure('Give two files: fuse diff "Project/development/.env" "Project/production/.env"');
      return null;
    }
    const id = await select<string>(
      message,
      data.files
        .map<Choice<string>>((file) => ({ value: file.id, label: filePath(data, file.id) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      { filterable: true },
    );
    return data.files.find((f) => f.id === id) ?? null;
  };

  const left = await pick(leftSpec, 'Compare which file?');
  if (!left) return 1;
  const right = await pick(rightSpec, 'Against which file?');
  if (!right) return 1;

  const leftVars = varsOf(data, left.id);
  const rightVars = varsOf(data, right.id);
  const keys = [...new Set([...leftVars.map((v) => v.key), ...rightVars.map((v) => v.key)])].sort();

  heading('Diff', `${filePath(data, left.id)}  vs  ${filePath(data, right.id)}`);

  const show = (value: string): string => value.replace(/\n/g, '\\n');

  let same = 0;
  for (const key of keys) {
    const l = leftVars.find((v) => v.key === key);
    const r = rightVars.find((v) => v.key === key);
    const lv = l ? (l.secret ? maskSecret(l.value) : show(l.value)) : null;
    const rv = r ? (r.secret ? maskSecret(r.value) : show(r.value)) : null;
    if (l && r && l.value === r.value) {
      same += 1;
      continue;
    }
    if (l && !r) diffLine('-', `${key}=${lv}`);
    else if (!l && r) diffLine('+', `${key}=${rv}`);
    else diffLine('~', `${key}: ${lv} ${symbols.arrow} ${rv}`);
  }

  print();
  info(`${keys.length} keys compared`, `${same} identical, ${keys.length - same} different`);
  return 0;
}

export async function run(args: ParsedArgs): Promise<number> {
  if (args.passthrough.length === 0) {
    failure('Put the command after --');
    info('For example', 'fuse run -- node server.js');
    return 1;
  }

  const client = await connect({ preferDirect: flagBool(args, 'direct'), quiet: true });
  const data = client.data;
  const file = await resolveFile(data, args, 'Which env file should be injected?');
  if (!file) return 1;

  const env: NodeJS.ProcessEnv = { ...process.env };
  const list = varsOf(data, file.id).filter((v) => v.enabled);
  list.forEach((v) => {
    env[v.key] = v.value;
  });

  info(
    `Running with ${list.length} variables`,
    `${filePath(data, file.id)} ${symbols.arrow} ${args.passthrough.join(' ')}`,
  );

  const [command, ...rest] = args.passthrough;
  return new Promise<number>((resolve) => {
    const child = spawn(command, rest, {
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      cwd: process.cwd(),
    });
    child.on('error', (err) => {
      failure(`Could not run ${command}`, err.message);
      resolve(1);
    });
    child.on('exit', (code) => resolve(code ?? 0));
  });
}

export async function exportEnvFormat(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct'), quiet: true });
  const data = client.data;
  const file = await resolveFile(data, args);
  if (!file) return 1;

  const format = (flagString(args, 'format') as EnvFormat | undefined) ?? 'shell';
  if (!FORMATS.includes(format)) {
    failure(`Unknown format "${format}"`);
    info('Available', FORMATS.map((f) => `${f} (${FORMAT_LABELS[f]})`).join(', '));
    return 1;
  }

  print(
    serialize(
      varsOf(data, file.id).map((v) => ({
        key: v.key,
        value: v.value,
        note: v.note,
        enabled: v.enabled,
        secret: v.secret,
      })),
      format,
      { ...DEFAULT_SERIALIZE_OPTIONS, quoteMode: data.settings.quoteMode, includeNotes: false },
    ).trimEnd(),
  );
  return 0;
}

export function shellHint(): void {
  warn(
    'To load these into your current shell',
    `eval "$(fuse export --format shell --file ${path.basename(process.cwd())})"`,
  );
}
