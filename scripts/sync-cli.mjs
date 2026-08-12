import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET =
  process.argv[2] ?? path.resolve(ROOT, '..', 'fuse-env-manager-cli');

if (!existsSync(TARGET)) {
  console.error(`The CLI repository was not found at ${TARGET}`);
  console.error('Pass its path: node scripts/sync-cli.mjs /path/to/fuse-env-manager-cli');
  process.exit(1);
}

const copies = [
  ['cli/src', 'src'],
  ['shared', 'shared'],
];

for (const [from, to] of copies) {
  const source = path.join(ROOT, from);
  const destination = path.join(TARGET, to);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
  console.log(`copied ${from} -> ${path.relative(ROOT, destination)}`);
}

const appPkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const cliPkgPath = path.join(TARGET, 'package.json');
const cliPkg = JSON.parse(readFileSync(cliPkgPath, 'utf8'));
cliPkg.version = appPkg.version;
writeFileSync(cliPkgPath, `${JSON.stringify(cliPkg, null, 2)}\n`);

writeFileSync(
  path.join(TARGET, 'SOURCE.md'),
  [
    '# Where this code comes from',
    '',
    '`src/` and `shared/` are generated from the desktop app repository so that the',
    'command line tool and the app always speak the same vault format.',
    '',
    'To update them, run this in the app repository:',
    '',
    '```bash',
    'yarn sync:cli',
    '```',
    '',
    'Edit the sources in the app repository under `cli/src` and `shared`, then sync.',
    '',
  ].join('\n'),
);

console.log(`\nSynced into ${TARGET}. Run "yarn build" there to produce dist/fuse.cjs.`);
