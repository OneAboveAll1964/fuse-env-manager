import { filePath } from '@shared/tree';
import { connect } from '../core/client';
import { readLink } from '../core/link';
import { c, symbols } from '../ui/colors';
import { banner, info, keyValue, print } from '../ui/output';
import { PromptCancelled, isInteractive, select, type Choice } from '../ui/prompt';
import type { ParsedArgs } from '../core/args';
import * as transfer from './transfer';
import * as vars from './vars';
import * as tree from './tree';
import * as history from './history';
import * as archive from './archive';
import * as vault from './vault';

type Action =
  | 'pull'
  | 'push'
  | 'sync'
  | 'ls'
  | 'tree'
  | 'diff'
  | 'search'
  | 'set'
  | 'link'
  | 'history'
  | 'restore'
  | 'export'
  | 'import'
  | 'project'
  | 'status'
  | 'quit';

export async function menu(args: ParsedArgs): Promise<number> {
  if (!isInteractive()) {
    info('Run fuse --help to see every command');
    return 0;
  }

  banner();

  const cwd = process.cwd();
  const link = readLink(cwd);

  try {
    const client = await connect({ quiet: true });
    const data = client.data;
    keyValue([
      ['here', c.grey(cwd)],
      [
        'linked',
        link
          ? c.brightCyan(
              [link.link.project, link.link.folder, link.link.file].filter(Boolean).join(' / '),
            )
          : c.grey('this folder is not linked'),
      ],
      [
        'vault',
        `${data.projects.length} projects · ${data.files.length} files · ${data.vars.length} variables`,
      ],
      ['mode', client.mode === 'bridge' ? c.green('using the open app') : c.blue('direct')],
    ]);
    print();
  } catch (err) {
    info(err instanceof Error ? err.message : String(err));
    print();
  }

  for (;;) {
    let action: Action;
    try {
      action = await select<Action>('What would you like to do?', [
        {
          value: 'pull',
          label: 'Pull an env file into this folder',
          hint: 'fuse pull',
          group: 'Everyday',
        },
        {
          value: 'push',
          label: 'Push a local env file into the vault',
          hint: 'fuse push',
          group: 'Everyday',
        },
        {
          value: 'sync',
          label: 'Compare this folder with the vault',
          hint: 'fuse sync',
          group: 'Everyday',
        },
        {
          value: 'link',
          label: 'Link this folder to a file',
          hint: 'fuse link',
          group: 'Everyday',
        },
        { value: 'ls', label: 'List a file and its variables', hint: 'fuse ls', group: 'Browse' },
        { value: 'tree', label: 'Show the whole vault', hint: 'fuse tree', group: 'Browse' },
        { value: 'search', label: 'Search variables', hint: 'fuse search', group: 'Browse' },
        { value: 'diff', label: 'Compare two env files', hint: 'fuse diff', group: 'Browse' },
        { value: 'set', label: 'Set a variable', hint: 'fuse set KEY=VALUE', group: 'Edit' },
        { value: 'project', label: 'Manage projects', hint: 'fuse project', group: 'Edit' },
        { value: 'history', label: 'Show recent changes', hint: 'fuse history', group: 'History' },
        {
          value: 'restore',
          label: 'Put back a previous state',
          hint: 'fuse restore',
          group: 'History',
        },
        { value: 'export', label: 'Export a zip', hint: 'fuse export', group: 'Transfer' },
        { value: 'import', label: 'Import a zip', hint: 'fuse import', group: 'Transfer' },
        { value: 'status', label: 'Show status', hint: 'fuse status', group: 'Other' },
        { value: 'quit', label: c.grey('Quit'), group: 'Other' },
      ]);
    } catch (err) {
      if (err instanceof PromptCancelled) return 0;
      throw err;
    }

    if (action === 'quit') {
      print(c.grey(`  ${symbols.bullet} bye`));
      return 0;
    }

    print();
    try {
      switch (action) {
        case 'pull':
          await transfer.pull(args);
          break;
        case 'push':
          await transfer.push(args);
          break;
        case 'sync':
          await transfer.sync(args);
          break;
        case 'link':
          await transfer.link(args);
          break;
        case 'ls':
          await pickAndList(args);
          break;
        case 'tree':
          await tree.tree(args);
          break;
        case 'search':
          await searchInteractive(args);
          break;
        case 'diff':
          await vars.diff({ ...args, positional: [] });
          break;
        case 'set':
          await setInteractive(args);
          break;
        case 'project':
          await tree.projectCommand({ ...args, positional: ['ls'] });
          break;
        case 'history':
          await history.history(args);
          break;
        case 'restore':
          await history.restore({ ...args, positional: [] });
          break;
        case 'export':
          await archive.exportArchive(args);
          break;
        case 'import':
          await importInteractive(args);
          break;
        case 'status':
          await vault.status(args);
          break;
        default:
          break;
      }
    } catch (err) {
      if (err instanceof PromptCancelled) {
        print(c.grey('  cancelled'));
      } else {
        print(`  ${c.red(symbols.cross)} ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    print();
  }
}

async function pickAndList(args: ParsedArgs): Promise<void> {
  const client = await connect({ quiet: true });
  const data = client.data;
  if (data.files.length === 0) {
    info('There are no env files yet');
    return;
  }
  const id = await select<string>(
    'Which file?',
    data.files
      .map<Choice<string>>((file) => ({
        value: file.id,
        label: filePath(data, file.id),
        hint: `${data.vars.filter((v) => v.fileId === file.id).length} vars`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    { filterable: true },
  );
  await vars.list({ ...args, positional: [filePath(data, id)] });
}

async function searchInteractive(args: ParsedArgs): Promise<void> {
  const { text } = await import('../ui/prompt');
  const term = await text('Search for');
  if (!term) return;
  await vars.search({ ...args, positional: [term] });
}

async function setInteractive(args: ParsedArgs): Promise<void> {
  const { text } = await import('../ui/prompt');
  const pair = await text('KEY=VALUE', { placeholder: 'PORT=3000' });
  if (!pair.includes('=')) {
    info('Nothing was set');
    return;
  }
  await vars.set({ ...args, positional: [pair] });
}

async function importInteractive(args: ParsedArgs): Promise<void> {
  const { text } = await import('../ui/prompt');
  const file = await text('Path to the zip');
  if (!file) return;
  await archive.importArchive({ ...args, positional: [file] });
}
