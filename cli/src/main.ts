import { parseArgs, flagBool, type ParsedArgs } from './core/args';
import { PromptCancelled } from './ui/prompt';
import { ansi, c, symbols } from './ui/colors';
import { failure, info, print } from './ui/output';
import { completion, help } from './commands/help';
import { menu } from './commands/menu';
import * as archive from './commands/archive';
import * as historyCommands from './commands/history';
import * as transfer from './commands/transfer';
import * as tree from './commands/tree';
import * as vars from './commands/vars';
import * as vault from './commands/vault';

const VERSION = '1.0.0';

const ALIASES: Record<string, string> = {
  ls: 'ls',
  list: 'ls',
  cat: 'get',
  show: 'get',
  exec: 'run',
  del: 'rm',
  remove: 'rm',
  delete: 'rm',
  ws: 'workspace',
  proj: 'project',
  dir: 'folder',
  env: 'use',
  checkout: 'switch',
  'export-zip': 'export-zip',
  zip: 'export-zip',
  unzip: 'import',
};

async function dispatch(args: ParsedArgs): Promise<number> {
  const command = ALIASES[args.command] ?? args.command;

  switch (command) {
    case '':
      return menu(args);
    case 'help':
      return help();
    case 'version':
      return vault.version(VERSION);

    case 'pull':
      return transfer.pull(args);
    case 'put':
      return transfer.put(args);
    case 'push':
      return transfer.push(args);
    case 'sync':
      return transfer.sync(args);
    case 'use':
      return transfer.use(args);
    case 'switch':
      return transfer.switchFocus(args);
    case 'link':
      return transfer.link(args);
    case 'unlink':
      return transfer.unlink(args);

    case 'ls':
      return vars.list(args);
    case 'tree':
      return tree.tree(args);
    case 'get':
      return vars.get(args);
    case 'set':
      return vars.set(args);
    case 'unset':
      return vars.unset(args);
    case 'search':
      return vars.search(args);
    case 'diff':
      return vars.diff(args);
    case 'run':
      return vars.run(args);
    case 'export':
      return vars.exportEnvFormat(args);

    case 'cp':
      return tree.copy(args, false);
    case 'mv':
      return tree.copy(args, true);
    case 'rm':
      return tree.remove(args);
    case 'workspace':
      return tree.workspaceCommand(args);
    case 'project':
      return tree.projectCommand(args);
    case 'folder':
      return tree.folderCommand(args);
    case 'file':
      return tree.fileCommand(args);

    case 'history':
      return historyCommands.history(args);
    case 'restore':
      return historyCommands.restore(args);

    case 'export-zip':
      return archive.exportArchive(args);
    case 'import':
      return archive.importArchive(args);

    case 'init':
      return vault.init(args);
    case 'status':
      return vault.status(args);
    case 'unlock':
      return vault.unlock(args);
    case 'lock':
      return Promise.resolve(vault.lock());
    case 'doctor':
      return vault.doctor(args);
    case 'gen':
      return Promise.resolve(vault.gen(args));
    case 'completion':
      return Promise.resolve(completion(args.positional[0] ?? 'zsh'));

    default:
      failure(`Unknown command "${args.command}"`);
      info('Run', 'fuse --help');
      return 1;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (flagBool(args, 'no-color')) process.env.NO_COLOR = '1';
  if (flagBool(args, 'help', 'h') && args.command !== 'completion') {
    process.exitCode = help();
    return;
  }
  if (flagBool(args, 'version', 'v') && !args.command) {
    process.exitCode = vault.version(VERSION);
    return;
  }

  try {
    process.exitCode = await dispatch(args);
  } catch (err) {
    if (err instanceof PromptCancelled) {
      print();
      print(`  ${c.grey(`${symbols.bullet} cancelled`)}`);
      process.exitCode = 130;
      return;
    }
    failure(err instanceof Error ? err.message : String(err));
    if (process.env.FUSE_DEBUG === '1' && err instanceof Error && err.stack) {
      print(c.grey(err.stack));
    }
    process.exitCode = 1;
  }
}

function restoreTerminal(): void {
  if (process.stdout.isTTY) process.stdout.write(ansi.showCursor);
  if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(false);
}

process.on('exit', restoreTerminal);
process.on('SIGINT', () => {
  restoreTerminal();
  print();
  process.exit(130);
});

void main().finally(() => {
  restoreTerminal();
});
