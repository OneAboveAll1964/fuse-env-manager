export type CommandExample = {
  title: string;
  code: string;
  note?: string;
};

export type CommandDoc = {
  name: string;
  usage: string;
  group: string;
  summary: string;
  detail: string;
  examples: CommandExample[];
  flags?: Array<[string, string]>;
};

export const COMMAND_GROUPS = [
  'Everyday',
  'Browse',
  'Edit',
  'Run and generate',
  'History and archives',
  'Session',
] as const;

export const COMMANDS: CommandDoc[] = [
  {
    name: 'fuse',
    usage: 'fuse',
    group: 'Everyday',
    summary: 'Open the interactive menu',
    detail:
      'Run fuse on its own and it shows where you are, what this folder is linked to and a menu covering every other command. Everything below can be reached from it, so you never have to remember a flag.',
    examples: [{ title: 'Open the menu', code: 'cd ~/code/my-service\nfuse' }],
  },
  {
    name: 'pull',
    usage: 'fuse pull [file]',
    group: 'Everyday',
    summary: 'Write an env file from the vault into this folder',
    detail:
      "Picks a file from the vault and writes it here. With no arguments it uses this folder's link if there is one, then the project this folder belongs to, and only asks you to choose when it cannot work it out. If a file of the same name already exists you get a diff first and a choice: overwrite, merge, keep a backup, or cancel.",
    examples: [
      {
        title: 'Interactive, in a new project folder',
        code: 'cd ~/code/my-new-service\nfuse pull',
        note: 'Walks you through workspace, project and file.',
      },
      {
        title: 'Straight at one file',
        code: 'fuse pull --file "Acme Studio/Storefront API/production/.env"',
      },
      {
        title: 'Write it somewhere else, under another name',
        code: 'fuse pull --file "Acme/API/production/.env" --as .env.production',
      },
      {
        title: 'Render it as something other than dotenv',
        code: 'fuse pull --format docker --as app.env',
      },
      {
        title: 'In a script, overwriting without asking',
        code: 'fuse pull --file "Acme/API/production/.env" --yes',
      },
      {
        title: 'A repo that keeps every environment checked in',
        code: 'fuse link --file "Acme/API/development/.env" --as dev.env\nfuse link --add --file "Acme/API/production/.env" --as prod.env\nfuse pull --all',
        note: 'Both files are written, each from its own environment.',
      },
      {
        title: 'Refresh what you are working on',
        code: 'fuse switch prod\nfuse pull',
      },
    ],
    flags: [
      ['--file, -f', 'The file in the vault, as "Workspace/Project/folder/name"'],
      ['--as, -o', 'Write under a different name'],
      ['--dir', 'Write into a different folder'],
      ['--format', 'Render in any supported format instead of the file default'],
      ['--link', 'Link this folder to the file afterwards'],
      ['--all', 'Refresh every file this folder maps, each from its own environment'],
      ['--env', 'Pick a mapped environment by name instead of the focused one'],
      ['--yes, -y', 'Overwrite an existing file without asking'],
    ],
  },
  {
    name: 'put',
    usage: 'fuse put',
    group: 'Everyday',
    summary: 'Shorthand for pull',
    detail:
      'The same as pull, kept because it reads better when you just want a file dropped into the folder you are standing in.',
    examples: [{ title: 'Drop a file here', code: 'cd ~/code/my-service\nfuse put' }],
  },
  {
    name: 'push',
    usage: 'fuse push [file]',
    group: 'Everyday',
    summary: 'Send a local env file into the vault',
    detail:
      'Reads a local file, works out its format, and stores it. In a folder mapped to several environments a bare push sends the focused file to its own environment; --all scans every mapped file instead. Conflicting keys are shown before anything is written, and you choose whether the local file wins, the vault wins, or the whole file is replaced. Pushing a file the folder does not map yet never lands in the linked environment by accident: you are asked where in the project it should live, it is created there, and the folder maps it from then on.',
    examples: [
      { title: "Send this folder's .env", code: 'cd ~/code/my-service\nfuse push .env' },
      {
        title: 'Let it find the local env files for you',
        code: 'fuse push',
        note: 'Lists .env, .env.local and friends from this folder.',
      },
      {
        title: 'Straight at a destination',
        code: 'fuse push .env --file "Acme Studio/Storefront API/development/.env"',
      },
      {
        title: 'By environment name, in a linked folder',
        code: 'fuse push production',
        note: 'Pushes whichever local file production is mapped to here.',
      },
      {
        title: 'Every mapped file at once',
        code: 'fuse push --all',
      },
      {
        title: 'A second file the folder does not map yet',
        code: 'fuse push .env.example',
        note: 'Asks where in the linked project it should live, creates it there, and maps it.',
      },
      {
        title: 'In CI, never touching what is already stored',
        code: 'fuse push .env --yes --mode skip',
      },
    ],
    flags: [
      ['--file, -f', 'The destination in the vault'],
      ['--all', 'Push every file this folder maps, each to its own environment'],
      ['--no-link', 'Do not map a newly placed file on the link'],
      ['--format', 'Force the input format instead of detecting it'],
      ['--mode', 'merge to let the local file win, skip to keep the vault, replace to clear first'],
      ['--link', 'Link this folder to the destination afterwards'],
      ['--yes, -y', 'Do not ask about conflicts'],
    ],
  },
  {
    name: 'sync',
    usage: 'fuse sync',
    group: 'Everyday',
    summary: 'Compare this folder with the vault and pick a direction',
    detail:
      'Shows a table of what only exists locally, what only exists in the vault and what differs, then asks which side should win. Nothing is written until you choose. In a folder mapped to several environments it compares the focused file; --all walks the whole set.',
    examples: [
      { title: 'Have a look before deciding', code: 'fuse sync' },
      { title: 'Every mapped file in this folder', code: 'fuse sync --all' },
      { title: 'Take the vault version without asking', code: 'fuse sync --yes --direction pull' },
      { title: 'Take the local version without asking', code: 'fuse sync --yes --direction push' },
    ],
    flags: [
      ['--direction', 'pull to take the vault version, push to take the local one'],
      ['--as', 'Compare against a different local file name'],
      ['--all', 'Compare every file this folder maps'],
    ],
  },
  {
    name: 'switch',
    usage: 'fuse switch [environment]',
    group: 'Everyday',
    summary: 'Move the focus between the files mapped in this folder',
    detail:
      'A folder mapped to several environments has one focused file at a time, and the bare commands — pull, push, sync, use, get, set, run — all act on it. switch moves that focus and writes nothing else. Explicit names and --env always bypass the focus, and --all hits the whole set.',
    examples: [
      {
        title: 'Work on production for a while',
        code: 'fuse switch prod\nfuse pull\nfuse set LOG_LEVEL=warn --yes\nfuse push',
      },
      { title: 'Back to development', code: 'fuse switch dev' },
      { title: 'Where am I?', code: 'fuse switch --list' },
      { title: 'checkout works too', code: 'fuse checkout prod' },
    ],
  },
  {
    name: 'use',
    usage: 'fuse use [environment]',
    group: 'Everyday',
    summary: 'Swap which environment lives inside the focused file',
    detail:
      'Rewrites the focused local file with another environment and moves its mapping with it, so pushes keep going to the right place. In a single-file folder that is the whole switching workflow. In a multi-file folder it acts on whichever file fuse switch focused, and naming an environment that already lives in another file here is fine — both hold it, with a note, until one is pointed somewhere else.',
    examples: [
      { title: 'Point the file at production', code: 'fuse use production' },
      { title: 'Pick from a list', code: 'fuse use' },
      { title: 'See what is mapped here', code: 'fuse use --list' },
      { title: 'env works too', code: 'fuse env production' },
    ],
  },
  {
    name: 'link',
    usage: 'fuse link',
    group: 'Everyday',
    summary: 'Tie this folder to one file so pulls stop asking',
    detail:
      'Writes a small .fuse.json here recording which environments this folder maps, which local file each one lives in, and which of them is focused. One mapping gives you the single-file workflow with fuse use; add more with --add and every environment gets its own local file, with fuse switch moving between them. It holds no secrets, only names and ids, so it is safe to commit for the whole team.',
    examples: [
      { title: 'Link, then pull silently forever after', code: 'fuse link\nfuse pull --yes' },
      {
        title: 'Map a second environment alongside',
        code: 'fuse link --add --file "Acme/API/production/.env" --as prod.env',
      },
      { title: 'Map a second environment without questions', code: 'fuse link --add' },
    ],
  },
  {
    name: 'unlink',
    usage: 'fuse unlink [environment]',
    group: 'Everyday',
    summary: 'Remove the link, or just one mapped environment',
    detail:
      'With a name it unmaps that one environment and leaves the rest of the link alone, moving the focus if the focused file was the one removed. With no arguments it removes the whole .fuse.json. Nothing in the vault or on disk is touched either way.',
    examples: [
      { title: 'Unmap one environment', code: 'fuse unlink production' },
      { title: 'Remove the whole link', code: 'fuse unlink' },
    ],
  },
  {
    name: 'ls',
    usage: 'fuse ls [path]',
    group: 'Browse',
    summary: 'List the vault, or one file and its variables',
    detail:
      'With no argument it prints the whole structure. Give it a path and it prints that file with its keys, types and values. Secrets stay masked unless you ask for them.',
    examples: [
      { title: 'Everything', code: 'fuse ls' },
      { title: 'One file', code: 'fuse ls "Storefront API/production/.env"' },
      { title: 'Including the secret values', code: 'fuse ls "API/production/.env" --reveal' },
    ],
    flags: [['--reveal', 'Show secret values instead of masking them']],
  },
  {
    name: 'tree',
    usage: 'fuse tree',
    group: 'Browse',
    summary: 'Show the whole structure',
    detail:
      'A compact view of every workspace, project, folder and file with variable and secret counts.',
    examples: [{ title: 'Print the tree', code: 'fuse tree' }],
  },
  {
    name: 'get',
    usage: 'fuse get [KEY]',
    group: 'Browse',
    summary: 'Print one value, or the whole file',
    detail:
      'With a key it prints just that value and nothing else, which makes it easy to use in scripts. Without one it prints the whole file in its own format.',
    examples: [
      { title: 'One value into a shell variable', code: 'DB=$(fuse get DATABASE_URL)' },
      { title: 'The whole file', code: 'fuse get --file "API/production/.env"' },
      { title: 'As JSON, for another tool to read', code: 'fuse get --json' },
    ],
    flags: [
      ['--file, -f', 'Which file to read'],
      ['--env', 'Pick a mapped environment by name instead of the focused one'],
      ['--json', 'Print the whole file as a JSON object'],
      ['--format', 'Print the whole file in a specific format'],
    ],
  },
  {
    name: 'search',
    usage: 'fuse search <term>',
    group: 'Browse',
    summary: 'Search keys, notes and non-secret values',
    detail:
      'Looks across every workspace. Values of variables marked as secret are never searched, so search their key or note instead.',
    examples: [
      { title: 'Find every database URL', code: 'fuse search DATABASE' },
      { title: 'Find where a host is used', code: 'fuse search db.internal' },
    ],
  },
  {
    name: 'diff',
    usage: 'fuse diff <a> <b>',
    group: 'Browse',
    summary: 'Compare two env files key by key',
    detail:
      'Prints added, removed and changed keys between two files in the vault. Useful before promoting a change from staging to production.',
    examples: [
      {
        title: 'Development against production',
        code: 'fuse diff "API/development/.env" "API/production/.env"',
      },
      { title: 'Pick both from a list', code: 'fuse diff' },
    ],
  },
  {
    name: 'status',
    usage: 'fuse status',
    group: 'Browse',
    summary: 'Vault, bridge and link state for this folder',
    detail:
      'Where the vault is, whether the desktop app is open and reachable, whether a session is cached, and what this folder resolves to. In a linked folder it lists every mapping and marks the focused one. The first thing to run when something is not behaving.',
    examples: [
      { title: 'Full status', code: 'fuse status' },
      { title: 'Just the header, no vault contents', code: 'fuse status --quiet' },
    ],
  },
  {
    name: 'set',
    usage: 'fuse set KEY=VALUE...',
    group: 'Edit',
    summary: 'Add or change variables',
    detail:
      'Takes any number of KEY=VALUE pairs. Existing keys are shown as a before and after and you confirm once. Types are worked out from the value, and keys that look like secrets are marked as secrets automatically.',
    examples: [
      { title: 'Two at once', code: 'fuse set PORT=3000 LOG_LEVEL=debug' },
      {
        title: 'Into a specific file, no prompt',
        code: 'fuse set REDIS_URL=redis://localhost:6379 \\\n  --file "API/development/.env" --yes',
      },
      {
        title: 'A generated secret',
        code: 'fuse set JWT_SECRET=$(fuse gen jwt-secret) --yes',
      },
    ],
    flags: [
      ['--file, -f', 'Which file to write to'],
      ['--env', 'Pick a mapped environment by name instead of the focused one'],
      ['--yes, -y', 'Do not show the confirmation'],
    ],
  },
  {
    name: 'unset',
    usage: 'fuse unset KEY...',
    group: 'Edit',
    summary: 'Remove variables',
    detail:
      'Removes one or more keys. Everything removed is recorded in the history first, so fuse restore can bring it back.',
    examples: [
      { title: 'Remove one', code: 'fuse unset OLD_FLAG' },
      { title: 'Remove several without asking', code: 'fuse unset A B C --yes' },
    ],
  },
  {
    name: 'cp',
    usage: 'fuse cp <src> <dst>',
    group: 'Edit',
    summary: 'Copy a whole env file somewhere else',
    detail:
      'Copies a file and every variable in it into another folder or project. Handy for seeding a new environment from an existing one.',
    examples: [
      {
        title: 'Seed staging from development',
        code: 'fuse cp "API/development/.env" "API/staging"',
      },
      {
        title: 'Copy under a new name',
        code: 'fuse cp "API/development/.env" "API/staging" --as .env.staging',
      },
    ],
  },
  {
    name: 'mv',
    usage: 'fuse mv <src> <dst>',
    group: 'Edit',
    summary: 'Move a whole env file',
    detail: 'The same as cp, and then removes the original.',
    examples: [
      {
        title: 'Move a file between projects',
        code: 'fuse mv "Old API/production/.env" "New API/production"',
      },
    ],
  },
  {
    name: 'rm',
    usage: 'fuse rm <path>',
    group: 'Edit',
    summary: 'Delete a file, folder or project',
    detail:
      'Works out from the path whether you mean a file, a folder or a project, and asks before deleting. Everything is recorded in the history first.',
    examples: [
      { title: 'One file', code: 'fuse rm "API/staging/.env"' },
      { title: 'A whole folder', code: 'fuse rm staging --yes' },
    ],
  },
  {
    name: 'workspace',
    usage: 'fuse workspace ls|add',
    group: 'Edit',
    summary: 'Manage workspaces',
    detail:
      'Workspaces keep different companies and clients apart. Nothing is shared between them.',
    examples: [
      { title: 'List them', code: 'fuse workspace ls' },
      { title: 'Add one', code: 'fuse workspace add "Acme Studio"' },
    ],
  },
  {
    name: 'project',
    usage: 'fuse project ls|add|rm',
    group: 'Edit',
    summary: 'Manage projects',
    detail:
      'Adding a project offers to create development, staging and production folders with an empty .env in each.',
    examples: [
      { title: 'List them', code: 'fuse project ls' },
      { title: 'Add one with the usual folders', code: 'fuse project add "Storefront API" --yes' },
      { title: 'Remove one', code: 'fuse project rm "Old Service"' },
    ],
  },
  {
    name: 'folder',
    usage: 'fuse folder ls|add|rm',
    group: 'Edit',
    summary: 'Manage folders',
    detail: 'Folders group env files, usually one per environment, and can be nested.',
    examples: [
      { title: 'List them', code: 'fuse folder ls' },
      { title: 'Add one', code: 'fuse folder add preview' },
    ],
  },
  {
    name: 'file',
    usage: 'fuse file ls|add|rm',
    group: 'Edit',
    summary: 'Manage env files',
    detail: 'Creates and removes the files themselves without touching their contents.',
    examples: [
      { title: 'List them', code: 'fuse file ls' },
      { title: 'Add one', code: 'fuse file add .env.test' },
    ],
  },
  {
    name: 'run',
    usage: 'fuse run -- <command>',
    group: 'Run and generate',
    summary: 'Run a command with the variables injected',
    detail:
      'Loads a file from the vault into the environment and runs your command with it. Nothing is written to disk, so secrets never land in a file. Everything after -- is the command.',
    examples: [
      { title: 'Start a server', code: 'fuse run -- npm start' },
      {
        title: 'Against production, explicitly',
        code: 'fuse run --file "API/production/.env" -- node server.js',
      },
      { title: 'A one-off script', code: 'fuse run -- psql "$DATABASE_URL"' },
      { title: 'A mapped environment by name', code: 'fuse run --env production -- npm start' },
    ],
    flags: [
      ['--file, -f', 'Which file to inject'],
      ['--env', 'Pick a mapped environment by name instead of the focused one'],
    ],
  },
  {
    name: 'export',
    usage: 'fuse export --format <fmt>',
    group: 'Run and generate',
    summary: 'Print one file in any supported format, to the terminal',
    detail:
      'Writes the rendered file to standard output and nothing else, so you decide where it goes: pipe it, redirect it into a file, or feed it to another tool. It never writes to disk by itself. For a zip of the whole vault use export-zip instead.',
    examples: [
      {
        title: 'Look at it first',
        code: 'fuse export --format yaml --file "API/production/.env"',
      },
      {
        title: 'Redirect it into a file yourself',
        code: 'fuse export --format k8s-secret > secret.yaml',
      },
      {
        title: 'Load it into the current shell',
        code: 'eval "$(fuse export --format shell)"',
      },
      {
        title: 'Feed it to another tool',
        code: 'fuse export --format json | jq .DATABASE_URL',
      },
    ],
    flags: [
      ['--file, -f', 'Which file to render'],
      ['--env', 'Pick a mapped environment by name instead of the focused one'],
      ['--format', 'dotenv, json, yaml, toml, shell, docker, k8s-secret and more'],
    ],
  },
  {
    name: 'gen',
    usage: 'fuse gen <kind>',
    group: 'Run and generate',
    summary: 'Generate a password, key, token or UUID',
    detail:
      'Prints a freshly generated value using the system random source. Kinds: password, hex, base64, uuid, jwt-secret, api-key and pin.',
    examples: [
      { title: 'A strong password', code: 'fuse gen password' },
      { title: 'A signing secret', code: 'fuse gen jwt-secret' },
      { title: 'Ten API keys at once', code: 'fuse gen api-key --count 10' },
      { title: 'Straight into a variable', code: 'fuse set SESSION_SECRET=$(fuse gen hex) --yes' },
    ],
    flags: [
      ['--length, -n', 'How long the value should be'],
      ['--count', 'Generate several at once'],
    ],
  },
  {
    name: 'history',
    usage: 'fuse history [term]',
    group: 'History and archives',
    summary: 'Show recent changes',
    detail:
      'Every create, edit and delete, newest first, with a short id you can hand to restore. Give it a term to filter by name or path.',
    examples: [
      { title: 'The last thirty', code: 'fuse history' },
      { title: 'Only one file', code: 'fuse history production' },
      { title: 'More of them', code: 'fuse history --limit 100' },
    ],
  },
  {
    name: 'restore',
    usage: 'fuse restore <id>',
    group: 'History and archives',
    summary: 'Put back a previous state',
    detail:
      'Takes the id from fuse history and puts that state back. Restoring a delete brings back everything that went with it, including a whole folder and its files. The current state is recorded first, so a restore can itself be undone.',
    examples: [
      { title: 'Pick from a list', code: 'fuse restore' },
      { title: 'By id', code: 'fuse restore 3f2a91c4' },
    ],
  },
  {
    name: 'export-zip',
    usage: 'fuse export-zip',
    group: 'History and archives',
    summary: 'Write a zip archive of part or all of the vault',
    detail:
      'Writes a zip into the folder you are standing in, named fuse-export-<date>.zip unless you say otherwise, and prints the full path when it is done. The archive holds a machine readable copy Fuse can import back, and when it is not encrypted it also holds plain rendered copies you can read outside Fuse. If it will contain secrets it is encrypted by default with its own password, separate from your master password.',
    examples: [
      { title: 'Everything, encrypted, into this folder', code: 'fuse export-zip' },
      {
        title: 'Somewhere specific',
        code: 'fuse export-zip --out ~/Backups/fuse-2026-08.zip --password "a long passphrase"',
      },
      { title: 'One project only', code: 'fuse export-zip "Storefront API"' },
      { title: 'One workspace only', code: 'fuse export-zip --workspace "Acme Studio"' },
      {
        title: 'Structure only, no secrets, readable',
        code: 'fuse export-zip --no-secrets --plain',
      },
    ],
    flags: [
      ['--out, -o', 'Where to write it, defaults to this folder'],
      ['--workspace', 'Limit it to one workspace'],
      ['--password', 'The archive password, asked for if missing'],
      ['--no-secrets', 'Export the structure with secret values left blank'],
      ['--plain', 'Do not encrypt, and include readable rendered copies'],
    ],
  },
  {
    name: 'import',
    usage: 'fuse import <zip>',
    group: 'History and archives',
    summary: 'Read a Fuse archive back in',
    detail:
      'Shows what is inside the archive first, then asks what should happen where something already exists. Works with archives made by the app or by export-zip, on any machine, whatever the master password there is.',
    examples: [
      { title: 'Have a look, then decide', code: 'fuse import fuse-export-2026-08-12.zip' },
      {
        title: 'In a script',
        code: 'fuse import backup.zip --password "a long passphrase" --yes --mode merge',
      },
    ],
    flags: [
      ['--password', 'The archive password'],
      ['--mode', 'merge, skip or replace when something already exists'],
      ['--yes, -y', 'Do not ask'],
    ],
  },
  {
    name: 'init',
    usage: 'fuse init',
    group: 'Session',
    summary: 'Create a vault on this machine',
    detail:
      'For a machine with no desktop app. Asks for a master password twice and an optional hint, then writes the encrypted vault. Everything else works the same afterwards, and the app will pick up the same vault if you ever install it.',
    examples: [
      { title: 'Create one', code: 'fuse init' },
      { title: 'With some example data to look at', code: 'fuse init --sample' },
      {
        title: 'Unattended, for a container image',
        code: 'FUSE_MASTER_PASSWORD="a long passphrase" fuse init --yes',
      },
    ],
    flags: [
      ['--sample', 'Fill it with two example workspaces'],
      ['--hint', 'Set the password hint without being asked'],
      ['--yes, -y', 'Take the password from FUSE_MASTER_PASSWORD and do not ask'],
    ],
  },
  {
    name: 'unlock',
    usage: 'fuse unlock --ttl 15m',
    group: 'Session',
    summary: 'Cache an unlocked session on this machine',
    detail:
      'Asks for the master password once and keeps the key available for a while so later commands do not ask again. The cached key is sealed against this machine and the file is readable only by you.',
    examples: [
      { title: 'The default fifteen minutes', code: 'fuse unlock' },
      { title: 'A working day', code: 'fuse unlock --ttl 8h' },
    ],
    flags: [['--ttl', 'How long to keep the session, like 15m or 8h']],
  },
  {
    name: 'lock',
    usage: 'fuse lock',
    group: 'Session',
    summary: 'Drop the cached session',
    detail:
      'Removes the session fuse unlock cached, so the next command asks for the master password again. Locking when there is no session is fine and does nothing.',
    examples: [{ title: 'Lock it now', code: 'fuse lock' }],
  },
  {
    name: 'doctor',
    usage: 'fuse doctor',
    group: 'Session',
    summary: 'Check the install, the vault and the bridge',
    detail:
      'Walks through the runtime, the vault file and its permissions, whether the app is reachable, whether a session is cached and whether fuse is on your PATH, then tries to open the vault.',
    examples: [{ title: 'Run the checks', code: 'fuse doctor' }],
  },
  {
    name: 'completion',
    usage: 'fuse completion <shell>',
    group: 'Session',
    summary: 'Print a completion script',
    detail: 'Supports bash, zsh, fish and powershell. Print it and add it to your shell profile.',
    examples: [
      { title: 'zsh', code: 'fuse completion zsh > ~/.zsh/completions/_fuse' },
      { title: 'bash', code: 'fuse completion bash >> ~/.bashrc' },
      { title: 'fish', code: 'fuse completion fish > ~/.config/fish/completions/fuse.fish' },
    ],
  },
];

export const ENVIRONMENT_VARIABLES: Array<[string, string]> = [
  ['FUSE_HOME', 'Use a different vault folder'],
  ['FUSE_MASTER_PASSWORD', 'Unlock without a prompt, for scripts and CI'],
  ['FUSE_NO_BRIDGE=1', 'Never talk to the running app'],
  ['FUSE_DEBUG=1', 'Print stack traces on failure'],
  ['NO_COLOR', 'Turn colour off'],
];
