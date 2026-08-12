import {
  filePath,
  folderFullPath,
  folderPath,
  projectsOf,
  varsOf,
  workspacesOf,
} from '@shared/tree';
import type { EnvFile, Id, VaultData } from '@shared/types';
import { connect } from '../core/client';
import {
  copyFile,
  createFile,
  createFolder,
  createProject,
  createWorkspace,
  removeFile,
  removeFolder,
  removeProject,
} from '../core/mutations';
import {
  findFile,
  findFiles,
  findProject,
  pickFolder,
  pickProject,
  pickWorkspace,
} from '../core/resolve';
import { c, symbols } from '../ui/colors';
import { failure, heading, info, print, success, table, warn } from '../ui/output';
import { confirm, isInteractive, select, text, type Choice } from '../ui/prompt';
import { flagBool, flagString, type ParsedArgs } from '../core/args';

type Target =
  | { kind: 'file'; id: Id; label: string }
  | { kind: 'folder'; id: Id; label: string }
  | { kind: 'project'; id: Id; label: string };

function resolveTarget(data: VaultData, spec: string): Target | null {
  const file = findFile(data, spec) ?? findFiles(data, spec)[0];
  if (file) return { kind: 'file', id: file.id, label: filePath(data, file.id) };

  const parts = spec
    .split(/[/\\]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const last = parts[parts.length - 1]?.toLowerCase();

  const folder = data.folders.find((f) => f.name.toLowerCase() === last);
  if (folder) return { kind: 'folder', id: folder.id, label: folderFullPath(data, folder.id) };

  const project = findProject(data, spec);
  if (project) return { kind: 'project', id: project.id, label: project.name };

  return null;
}

export async function workspaceCommand(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const action = args.positional[0] ?? 'ls';

  if (action === 'ls') {
    heading('Workspaces');
    const rows = workspacesOf(client.data).map((workspace) => [
      workspace.name,
      String(client.data.projects.filter((p) => p.workspaceId === workspace.id).length),
      workspace.description || c.grey('—'),
    ]);
    if (rows.length === 0) {
      info('There are no workspaces yet', 'fuse workspace add "Acme Studio"');
      return 0;
    }
    table(['name', 'projects', 'description'], rows, [30, 10, 50]);
    return 0;
  }

  if (action === 'add') {
    const name = args.positional[1] ?? (isInteractive() ? await text('Name the workspace') : '');
    if (!name) {
      failure('Give a name: fuse workspace add "Acme Studio"');
      return 1;
    }
    await client.save((draft) => {
      createWorkspace(draft, name);
    });
    success('Workspace created', name);
    return 0;
  }

  failure(`Unknown action "${action}"`);
  info('Try', 'fuse workspace ls | add <name>');
  return 1;
}

export async function projectCommand(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;
  const action = args.positional[0] ?? 'ls';

  if (action === 'ls') {
    heading('Projects');
    const rows = data.projects.map((project) => [
      project.name,
      data.workspaces.find((w) => w.id === project.workspaceId)?.name ?? c.grey('—'),
      String(data.files.filter((f) => f.projectId === project.id).length),
      project.links[0] ? c.grey(project.links[0]) : c.grey('not linked'),
    ]);
    if (rows.length === 0) {
      info('There are no projects yet', 'fuse project add "Storefront API"');
      return 0;
    }
    table(['name', 'workspace', 'files', 'linked folder'], rows, [28, 22, 8, 44]);
    return 0;
  }

  if (action === 'add') {
    const workspace = await pickWorkspace(data, 'Which workspace?');
    if (!workspace) {
      failure('Create a workspace first: fuse workspace add "Acme Studio"');
      return 1;
    }
    const name = args.positional[1] ?? (isInteractive() ? await text('Name the project') : '');
    if (!name) {
      failure('Give a name: fuse project add "Storefront API"');
      return 1;
    }
    const withFolders =
      flagBool(args, 'yes', 'y') || !isInteractive()
        ? true
        : await confirm('Create development, staging and production folders?', true);

    await client.save((draft) => {
      const project = createProject(draft, workspace.id, name);
      if (withFolders) {
        for (const folderName of ['development', 'staging', 'production']) {
          const folder = createFolder(draft, project.id, null, folderName);
          createFile(draft, project.id, folder.id, '.env');
        }
      }
    });
    success('Project created', name);
    return 0;
  }

  if (action === 'rm') {
    const spec = args.positional[1];
    const project = spec ? findProject(data, spec) : null;
    if (!project) {
      failure('Give a project name: fuse project rm "Storefront API"');
      return 1;
    }
    if (!flagBool(args, 'yes', 'y') && isInteractive()) {
      const ok = await confirm(`Delete ${project.name} and everything inside it?`, false);
      if (!ok) return 0;
    }
    await client.save((draft) => {
      removeProject(draft, project.id);
    });
    success('Project deleted', `${project.name} can be restored with fuse history`);
    return 0;
  }

  failure(`Unknown action "${action}"`);
  info('Try', 'fuse project ls | add <name> | rm <name>');
  return 1;
}

export async function folderCommand(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;
  const action = args.positional[0] ?? 'ls';

  if (action === 'ls') {
    heading('Folders');
    const rows = data.folders.map((folder) => [
      folderFullPath(data, folder.id),
      String(data.files.filter((f) => f.folderId === folder.id).length),
    ]);
    if (rows.length === 0) {
      info('There are no folders yet');
      return 0;
    }
    table(['path', 'files'], rows, [70, 8]);
    return 0;
  }

  if (action === 'add') {
    const workspace = await pickWorkspace(data);
    if (!workspace) {
      failure('Create a workspace first');
      return 1;
    }
    const project = await pickProject(data, workspace.id);
    if (!project) {
      failure('Create a project first');
      return 1;
    }
    const parent = await pickFolder(data, project.id, 'Put it inside which folder?', true);
    const name = args.positional[1] ?? (isInteractive() ? await text('Name the folder') : '');
    if (!name) {
      failure('Give a name');
      return 1;
    }
    await client.save((draft) => {
      createFolder(draft, project.id, parent?.id ?? null, name);
    });
    success('Folder created', name);
    return 0;
  }

  if (action === 'rm') {
    const spec = args.positional[1];
    if (!spec) {
      failure('Give a folder: fuse folder rm production');
      return 1;
    }
    const target = resolveTarget(data, spec);
    if (!target || target.kind !== 'folder') {
      failure(`No folder matched "${spec}"`);
      return 1;
    }
    if (!flagBool(args, 'yes', 'y') && isInteractive()) {
      const ok = await confirm(`Delete ${target.label} and everything inside it?`, false);
      if (!ok) return 0;
    }
    await client.save((draft) => {
      removeFolder(draft, target.id);
    });
    success('Folder deleted', target.label);
    return 0;
  }

  failure(`Unknown action "${action}"`);
  return 1;
}

export async function fileCommand(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;
  const action = args.positional[0] ?? 'ls';

  if (action === 'ls') {
    heading('Env files');
    const rows = data.files.map((file) => [
      filePath(data, file.id),
      String(varsOf(data, file.id).length),
      file.format,
    ]);
    if (rows.length === 0) {
      info('There are no env files yet');
      return 0;
    }
    table(['path', 'vars', 'format'], rows, [66, 6, 16]);
    return 0;
  }

  if (action === 'add') {
    const workspace = await pickWorkspace(data);
    if (!workspace) {
      failure('Create a workspace first');
      return 1;
    }
    const project = await pickProject(data, workspace.id);
    if (!project) {
      failure('Create a project first');
      return 1;
    }
    const folder = await pickFolder(data, project.id);
    const name =
      args.positional[1] ??
      (isInteractive() ? await text('Name the file', { initial: '.env' }) : '.env');
    await client.save((draft) => {
      createFile(draft, project.id, folder?.id ?? null, name);
    });
    success('File created', name);
    return 0;
  }

  if (action === 'rm') {
    const spec = args.positional[1];
    if (!spec) {
      failure('Give a file: fuse file rm "Storefront API/production/.env"');
      return 1;
    }
    const file = findFile(data, spec) ?? findFiles(data, spec)[0];
    if (!file) {
      failure(`No file matched "${spec}"`);
      return 1;
    }
    if (!flagBool(args, 'yes', 'y') && isInteractive()) {
      const ok = await confirm(`Delete ${filePath(data, file.id)}?`, false);
      if (!ok) return 0;
    }
    await client.save((draft) => {
      removeFile(draft, file.id);
    });
    success('File deleted', 'restore it with fuse history');
    return 0;
  }

  failure(`Unknown action "${action}"`);
  return 1;
}

async function pickDestination(
  data: VaultData,
  message: string,
): Promise<{ projectId: Id; folderId: Id | null } | null> {
  const workspace = await pickWorkspace(data, 'Into which workspace?');
  if (!workspace) return null;
  const project = await pickProject(data, workspace.id, message);
  if (!project) return null;
  const folder = await pickFolder(data, project.id, 'Into which folder?');
  return { projectId: project.id, folderId: folder?.id ?? null };
}

export async function copy(args: ParsedArgs, move: boolean): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;

  const sourceSpec = args.positional[0];
  let source: EnvFile | null = sourceSpec
    ? (findFile(data, sourceSpec) ?? findFiles(data, sourceSpec)[0] ?? null)
    : null;

  if (!source) {
    if (!isInteractive()) {
      failure(
        `Give a source file: fuse ${move ? 'mv' : 'cp'} "Project/development/.env" "Project/staging"`,
      );
      return 1;
    }
    const id = await select<string>(
      move ? 'Move which file?' : 'Copy which file?',
      data.files
        .map<Choice<string>>((file) => ({ value: file.id, label: filePath(data, file.id) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      { filterable: true },
    );
    source = data.files.find((f) => f.id === id) ?? null;
  }
  if (!source) return 1;

  const destinationSpec = args.positional[1];
  let destination: { projectId: Id; folderId: Id | null } | null = null;

  if (destinationSpec) {
    const target = resolveTarget(data, destinationSpec);
    if (target?.kind === 'folder') {
      const folder = data.folders.find((f) => f.id === target.id);
      if (folder) destination = { projectId: folder.projectId, folderId: folder.id };
    } else if (target?.kind === 'project') {
      destination = { projectId: target.id, folderId: null };
    }
    if (!destination) {
      failure(`No folder or project matched "${destinationSpec}"`);
      return 1;
    }
  } else {
    destination = await pickDestination(
      data,
      move ? 'Move it into which project?' : 'Copy it into which project?',
    );
  }
  if (!destination) return 1;

  const name = flagString(args, 'as') ?? source.name;
  const sourceId = source.id;
  const place = destination;

  await client.save((draft) => {
    copyFile(draft, sourceId, place.folderId, place.projectId, name);
    if (move) removeFile(draft, sourceId);
  });

  success(
    move ? 'File moved' : 'File copied',
    `${name} ${symbols.arrow} ${
      place.folderId
        ? folderFullPath(client.data, place.folderId)
        : (client.data.projects.find((p) => p.id === place.projectId)?.name ?? '')
    }`,
  );
  return 0;
}

export async function remove(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct') });
  const data = client.data;
  const spec = args.positional[0];
  if (!spec) {
    failure('Give something to remove: fuse rm "Project/staging/.env"');
    return 1;
  }

  const target = resolveTarget(data, spec);
  if (!target) {
    failure(`Nothing matched "${spec}"`);
    return 1;
  }

  if (!flagBool(args, 'yes', 'y') && isInteractive()) {
    const ok = await confirm(
      `Delete the ${target.kind} ${target.label}${target.kind === 'file' ? '' : ' and everything inside it'}?`,
      false,
    );
    if (!ok) return 0;
  }

  await client.save((draft) => {
    if (target.kind === 'file') removeFile(draft, target.id);
    else if (target.kind === 'folder') removeFolder(draft, target.id);
    else removeProject(draft, target.id);
  });

  success(`${target.kind} deleted`, `${target.label} — restore it with fuse history`);
  return 0;
}

export async function tree(args: ParsedArgs): Promise<number> {
  const client = await connect({ preferDirect: flagBool(args, 'direct'), quiet: true });
  const data = client.data;

  heading('Vault tree', `${data.files.length} files, ${data.vars.length} variables`);

  for (const workspace of workspacesOf(data)) {
    print(`  ${c.bold(c.brightCyan(workspace.name))}`);
    const projects = projectsOf(data, workspace.id);
    projects.forEach((project) => {
      print(`  ${c.grey(symbols.branch)} ${c.bold(project.name)}`);
      const files = data.files.filter((f) => f.projectId === project.id);
      const grouped = new Map<string, EnvFile[]>();
      files.forEach((file) => {
        const key = folderPath(data, file.folderId).join('/') || '';
        const bucket = grouped.get(key) ?? [];
        bucket.push(file);
        grouped.set(key, bucket);
      });
      [...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([folder, bucket]) => {
          if (folder)
            print(`  ${c.grey(symbols.vertical)}  ${c.grey(symbols.branch)} ${c.cyan(folder)}`);
          bucket.forEach((file) => {
            const count = varsOf(data, file.id).length;
            const secrets = varsOf(data, file.id).filter((v) => v.secret).length;
            print(
              `  ${c.grey(symbols.vertical)}  ${folder ? c.grey(symbols.vertical) + '  ' : ''}${c.grey(symbols.lastBranch)} ${file.name} ${c.grey(`${count} vars${secrets ? `, ${secrets} secret` : ''}`)}`,
            );
          });
        });
    });
    print();
  }

  if (data.workspaces.length === 0) warn('The vault is empty', 'fuse workspace add "Acme Studio"');
  return 0;
}
