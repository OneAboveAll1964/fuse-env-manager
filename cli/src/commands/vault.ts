import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { emptyVault } from '@shared/defaults';
import { passwordStrength } from '@shared/password';
import { defaultVaultDir, vaultPath } from '@shared/paths';
import { createVault, generateSecret } from '@shared/vault-crypto';
import { filePath } from '@shared/tree';
import { connect, unlockAndCache, vaultExists } from '../core/client';
import { readBridgeFile, bridgeAvailable } from '../core/bridge-client';
import { clearSession, parseDuration, sessionExpiry } from '../core/session';
import { projectForDirectory, readLink, resolveLinkedFile } from '../core/link';
import { createFile, createFolder, createProject, createWorkspace } from '../core/mutations';
import { c, symbols } from '../ui/colors';
import { box, failure, heading, info, keyValue, print, success, warn } from '../ui/output';
import { confirm, isInteractive, password as askPassword, text } from '../ui/prompt';
import { flagBool, flagString, type ParsedArgs } from '../core/args';

export async function init(args: ParsedArgs): Promise<number> {
  if (vaultExists()) {
    failure(`A vault already exists at ${vaultPath()}`);
    info('Open it with', 'fuse unlock');
    return 1;
  }

  heading('Create a vault', defaultVaultDir());
  print();
  box(
    [
      'The master password is the only way into this vault.',
      'It is never written to disk and there is no way to recover it.',
    ],
    'warn',
  );
  print();

  const unattended = flagBool(args, 'yes', 'y');
  let password = process.env.FUSE_MASTER_PASSWORD ?? '';

  if (!password) {
    if (!isInteractive()) {
      failure('Run this in a terminal, or set FUSE_MASTER_PASSWORD and pass --yes.');
      return 1;
    }
    password = await askPassword('Master password');
    const again = await askPassword('Confirm the master password');
    if (password !== again) {
      failure('The two passwords do not match');
      return 1;
    }
  }

  if (password.length < 8) {
    failure('Use at least 8 characters');
    return 1;
  }

  const strength = passwordStrength(password);
  if (strength.score <= 1 && !unattended && isInteractive()) {
    warn(`That password is ${strength.label.toLowerCase()}`, strength.suggestions[0]);
    const carryOn = await confirm('Use it anyway?', false);
    if (!carryOn) {
      info('Nothing was created');
      return 0;
    }
  }

  let hint = flagString(args, 'hint') ?? '';
  if (!hint && !unattended && isInteractive()) {
    hint = await text('Password hint, shown on the lock screen (optional)');
  }

  const seed = emptyVault();
  if (flagBool(args, 'sample')) {
    const workspace = createWorkspace(seed, 'My workspace');
    const project = createProject(seed, workspace.id, 'Example project');
    for (const name of ['development', 'staging', 'production']) {
      const folder = createFolder(seed, project.id, null, name);
      createFile(seed, project.id, folder.id, '.env');
    }
    seed.revisions = [];
  }

  mkdirSync(defaultVaultDir(), { recursive: true });
  writeFileSync(
    vaultPath(),
    createVault(password, Buffer.from(JSON.stringify(seed), 'utf8'), hint.trim()),
    { mode: 0o600 },
  );

  print();
  success('Vault created', vaultPath());
  keyValue([
    ['strength', strength.label],
    ['hint', hint.trim() || c.grey('none')],
    ['contents', flagBool(args, 'sample') ? 'one example project' : 'empty'],
  ]);
  print();
  box(
    [
      `${c.bold('fuse unlock')}                 ${c.grey('keep it open for this terminal')}`,
      `${c.bold('fuse workspace add "Acme"')}   ${c.grey('start from nothing')}`,
      `${c.bold('fuse push .env')}              ${c.grey('or bring an existing file in')}`,
    ],
    'info',
  );
  return 0;
}

export async function status(args: ParsedArgs): Promise<number> {
  const cwd = process.cwd();
  heading('Fuse status');

  const bridge = readBridgeFile();
  const bridgeUp = bridge ? await bridgeAvailable(bridge) : false;
  const expiry = sessionExpiry();

  keyValue([
    ['vault', vaultExists() ? c.green(vaultPath()) : c.red(`missing at ${vaultPath()}`)],
    ['folder', c.grey(defaultVaultDir())],
    [
      'app bridge',
      bridgeUp
        ? c.green(`running on 127.0.0.1:${bridge?.port ?? '?'}`)
        : c.grey('not running (the CLI will open the vault itself)'),
    ],
    [
      'session',
      expiry && expiry.getTime() > Date.now()
        ? c.green(`cached until ${expiry.toLocaleTimeString()}`)
        : c.grey('none'),
    ],
    ['folder here', c.grey(cwd)],
  ]);

  if (!vaultExists()) {
    print();
    warn(
      'There is no vault here yet',
      'run fuse init, open the Fuse app, or point FUSE_HOME at an existing one',
    );
    return 1;
  }

  const link = readLink(cwd);
  if (link) {
    print();
    keyValue([
      [
        'linked to',
        c.brightCyan(
          [link.link.project, link.link.folder, link.link.file].filter(Boolean).join(' / '),
        ),
      ],
      ['link file', c.grey(path.join(link.dir, '.fuse.json'))],
    ]);
  }

  if (flagBool(args, 'quiet', 'q')) return 0;

  try {
    const client = await connect({ preferDirect: flagBool(args, 'direct'), quiet: true });
    const data = client.data;
    print();
    keyValue([
      [
        'mode',
        client.mode === 'bridge'
          ? c.green('using the open app')
          : c.blue('reading the vault directly'),
      ],
      ['workspaces', String(data.workspaces.length)],
      ['projects', String(data.projects.length)],
      ['env files', String(data.files.length)],
      ['variables', `${data.vars.length} (${data.vars.filter((v) => v.secret).length} secret)`],
    ]);

    if (link) {
      const fileId = resolveLinkedFile(data, link.link);
      if (fileId) {
        print();
        success('This folder resolves to', filePath(data, fileId));
      } else {
        print();
        warn('The link in this folder points at something that no longer exists');
      }
    } else {
      const projectId = projectForDirectory(data, cwd);
      if (projectId) {
        print();
        info(
          'This folder belongs to',
          data.projects.find((p) => p.id === projectId)?.name ?? 'a project',
        );
      }
    }
  } catch (err) {
    print();
    warn(err instanceof Error ? err.message : String(err));
  }

  return 0;
}

export async function unlock(args: ParsedArgs): Promise<number> {
  const ttl = parseDuration(flagString(args, 'ttl') ?? '15m') || 900;
  await unlockAndCache(ttl);
  const expiry = sessionExpiry();
  success(
    'Unlocked',
    expiry ? `this terminal stays unlocked until ${expiry.toLocaleTimeString()}` : undefined,
  );
  return 0;
}

export function lock(): number {
  clearSession();
  success('Locked', 'the cached session was cleared');
  return 0;
}

export async function doctor(args: ParsedArgs): Promise<number> {
  heading('Fuse doctor');
  const checks: Array<[string, boolean, string]> = [];

  checks.push(['node runtime', true, `${process.version} on ${process.platform}/${process.arch}`]);
  checks.push(['vault folder', existsSync(defaultVaultDir()), defaultVaultDir()]);
  checks.push(['vault file', vaultExists(), vaultPath()]);

  if (vaultExists()) {
    const stat = statSync(vaultPath());
    const mode = (stat.mode & 0o777).toString(8);
    checks.push([
      'vault permissions',
      process.platform === 'win32' || mode === '600',
      process.platform === 'win32' ? 'managed by Windows' : `0${mode}`,
    ]);
  }

  const bridge = readBridgeFile();
  const bridgeUp = bridge ? await bridgeAvailable(bridge) : false;
  checks.push([
    'app bridge',
    true,
    bridgeUp
      ? `reachable on 127.0.0.1:${bridge?.port ?? '?'}`
      : 'not running, direct access will be used',
  ]);

  const expiry = sessionExpiry();
  checks.push([
    'cached session',
    true,
    expiry && expiry.getTime() > Date.now() ? `valid until ${expiry.toLocaleTimeString()}` : 'none',
  ]);

  const onPath = (process.env.PATH ?? '').split(path.delimiter);
  const installed = onPath.some((dir) =>
    existsSync(path.join(dir, process.platform === 'win32' ? 'fuse.cmd' : 'fuse')),
  );
  checks.push([
    'fuse on PATH',
    installed,
    installed ? 'found' : 'install it from the app, CLI page',
  ]);

  print();
  for (const [label, ok, detail] of checks) {
    const mark = ok ? c.green(symbols.tick) : c.yellow(symbols.warn);
    print(`  ${mark} ${label.padEnd(20)} ${c.grey(detail)}`);
  }

  if (vaultExists()) {
    try {
      const client = await connect({ preferDirect: flagBool(args, 'direct'), quiet: true });
      print();
      success('The vault opened cleanly', `${client.data.vars.length} variables readable`);
    } catch (err) {
      print();
      failure('The vault could not be opened', err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  return 0;
}

export function gen(args: ParsedArgs): number {
  const kind = args.positional[0] ?? 'password';
  const length = Number(flagString(args, 'length', 'n') ?? 32);
  const count = Number(flagString(args, 'count') ?? 1);
  const known = ['password', 'hex', 'base64', 'uuid', 'jwt-secret', 'api-key', 'pin'];

  if (!known.includes(kind)) {
    failure(`Unknown kind "${kind}"`);
    info('Try one of', known.join(', '));
    return 1;
  }

  for (let i = 0; i < Math.max(1, Math.min(50, count)); i += 1) {
    print(generateSecret(kind, Number.isFinite(length) ? length : 32));
  }
  return 0;
}

export function version(pkgVersion: string): number {
  box(
    [
      `${c.bold('fuse')} ${c.brightCyan(pkgVersion)}`,
      c.grey(`vault: ${vaultPath()}`),
      c.grey(`node:  ${process.version}`),
    ],
    'info',
  );
  return 0;
}
