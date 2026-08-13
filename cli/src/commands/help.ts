import { c, pad, symbols } from '../ui/colors';
import { print } from '../ui/output';

type Entry = { command: string; summary: string; example?: string };

const GROUPS: Array<{ title: string; entries: Entry[] }> = [
  {
    title: 'Everyday',
    entries: [
      {
        command: 'pull [file]',
        summary: 'Write the linked env files into this folder, or one of them by name',
        example: 'fuse pull --file "Acme/Storefront API/production/.env"',
      },
      { command: 'put', summary: 'Same as pull, kept as a shorthand' },
      {
        command: 'push [file]',
        summary: 'Send a local env file into the vault',
        example: 'fuse push .env',
      },
      { command: 'sync', summary: 'Compare every linked file with the vault and pick a direction' },
      {
        command: 'use [environment]',
        summary: 'Switch a linked folder between development, staging and production',
        example: 'fuse use production',
      },
      {
        command: 'link',
        summary: 'Tie this folder to a project; --add maps more environments alongside',
        example: 'fuse link --project "Storefront API"',
      },
      { command: 'unlink [env]', summary: 'Remove the link, or just one mapped environment' },
    ],
  },
  {
    title: 'Browse',
    entries: [
      { command: 'ls [path]', summary: 'List the vault, or one file and its variables' },
      { command: 'tree', summary: 'Show the whole structure' },
      { command: 'get [KEY]', summary: 'Print one value, or the whole file' },
      { command: 'search <term>', summary: 'Search keys, notes and non-secret values' },
      { command: 'diff <a> <b>', summary: 'Compare two env files key by key' },
      { command: 'status', summary: 'Vault, bridge and link state for this folder' },
    ],
  },
  {
    title: 'Edit',
    entries: [
      { command: 'set KEY=VALUE...', summary: 'Add or change variables' },
      { command: 'unset KEY...', summary: 'Remove variables' },
      { command: 'cp <src> <dst>', summary: 'Copy a whole env file somewhere else' },
      { command: 'mv <src> <dst>', summary: 'Move a whole env file' },
      { command: 'rm <path>', summary: 'Delete a file, folder or project' },
      { command: 'workspace ls|add', summary: 'Manage workspaces' },
      {
        command: 'project ls|add|rm',
        summary: 'Manage projects, --bare to skip the usual folders',
        example: 'fuse project add "Storefront API"',
      },
      { command: 'folder ls|add|rm', summary: 'Manage folders' },
      { command: 'file ls|add|rm', summary: 'Manage env files' },
    ],
  },
  {
    title: 'Run and generate',
    entries: [
      {
        command: 'run -- <command>',
        summary: 'Run a command with the variables injected',
        example: 'fuse run -- npm start',
      },
      {
        command: 'export --format shell',
        summary: 'Print one file in any format, to the terminal',
        example: 'fuse export --format k8s-secret > secret.yaml',
      },
      {
        command: 'gen <kind>',
        summary: 'Generate a password, hex, base64, uuid, jwt-secret, api-key or pin',
      },
    ],
  },
  {
    title: 'History and archives',
    entries: [
      { command: 'history [term]', summary: 'Show recent changes' },
      { command: 'restore <id>', summary: 'Put back a previous state' },
      {
        command: 'export-zip',
        summary: 'Write a zip archive into this folder',
        example: 'fuse export-zip --out ~/Backups/fuse.zip',
      },
      { command: 'import <zip>', summary: 'Read a Fuse archive back in' },
    ],
  },
  {
    title: 'Session',
    entries: [
      {
        command: 'init',
        summary: 'Create a vault on this machine, for use without the desktop app',
        example: 'fuse init --sample',
      },
      { command: 'unlock --ttl 15m', summary: 'Cache an unlocked session for this machine' },
      { command: 'lock', summary: 'Drop the cached session' },
      { command: 'doctor', summary: 'Check the install, the vault and the bridge' },
      {
        command: 'completion <shell>',
        summary: 'Print a completion script for bash, zsh, fish or powershell',
      },
    ],
  },
];

const FLAGS: Entry[] = [
  { command: '--file, -f', summary: 'Point at a file: "Workspace/Project/folder/.env"' },
  { command: '--yes, -y', summary: 'Do not ask, take the safe default' },
  { command: '--format', summary: 'dotenv, json, yaml, toml, shell, docker, k8s-secret and more' },
  { command: '--mode', summary: 'merge, skip or replace when keys collide' },
  { command: '--direct', summary: 'Ignore the running app and open the vault file directly' },
  { command: '--json', summary: 'Machine readable output where it makes sense' },
  { command: '--no-color', summary: 'Turn colour off (NO_COLOR is honoured too)' },
];

const ENV_VARS: Entry[] = [
  { command: 'FUSE_HOME', summary: 'Use a different vault folder' },
  { command: 'FUSE_MASTER_PASSWORD', summary: 'Unlock without a prompt, for scripts and CI' },
  { command: 'FUSE_NO_BRIDGE=1', summary: 'Never talk to the running app' },
];

export function help(): number {
  print();
  print(
    `  ${c.bold(c.brightCyan('fuse'))} ${c.grey('— encrypted environment variables, everywhere you work')}`,
  );
  print();
  print(`  ${c.bold('Usage')}  ${c.grey('fuse <command> [options]')}`);
  print(`         ${c.grey('fuse            open the interactive menu')}`);
  print();

  const width = 26;
  for (const group of GROUPS) {
    print(`  ${c.bold(group.title)}`);
    for (const entry of group.entries) {
      print(`    ${c.brightCyan(pad(entry.command, width))}${c.grey(entry.summary)}`);
      if (entry.example)
        print(`    ${' '.repeat(width)}${c.grey(`${symbols.arrow} ${entry.example}`)}`);
    }
    print();
  }

  print(`  ${c.bold('Common options')}`);
  FLAGS.forEach((entry) =>
    print(`    ${c.yellow(pad(entry.command, width))}${c.grey(entry.summary)}`),
  );
  print();

  print(`  ${c.bold('Environment')}`);
  ENV_VARS.forEach((entry) =>
    print(`    ${c.magenta(pad(entry.command, width))}${c.grey(entry.summary)}`),
  );
  print();
  return 0;
}

const COMMANDS = GROUPS.flatMap((group) =>
  group.entries.map((entry) => entry.command.split(' ')[0]),
);

export function completion(shell: string): number {
  const list = COMMANDS.join(' ');
  switch (shell) {
    case 'zsh':
      print(`#compdef fuse
_fuse() {
  local -a commands
  commands=(${COMMANDS.map((cmd) => `'${cmd}'`).join(' ')})
  _arguments '1: :->command' '*: :->args'
  case $state in
    command) _describe 'command' commands ;;
    *) _files ;;
  esac
}
compdef _fuse fuse`);
      return 0;
    case 'bash':
      print(`_fuse_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${list}" -- "$cur") )
  else
    COMPREPLY=( $(compgen -f -- "$cur") )
  fi
}
complete -F _fuse_completions fuse`);
      return 0;
    case 'fish':
      print(
        COMMANDS.map((cmd) => `complete -c fuse -n "__fish_use_subcommand" -a "${cmd}"`).join('\n'),
      );
      return 0;
    case 'powershell':
    case 'pwsh':
      print(`Register-ArgumentCompleter -Native -CommandName fuse -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  @(${COMMANDS.map((cmd) => `'${cmd}'`).join(',')}) |
    Where-Object { $_ -like "$wordToComplete*" } |
    ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}`);
      return 0;
    default:
      print(`Supported shells: bash, zsh, fish, powershell`);
      return 1;
  }
}
