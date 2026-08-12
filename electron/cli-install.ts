import { app } from 'electron';
import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CliInstallResult } from '../shared/types';

const UNIX_TARGETS = ['/usr/local/bin', path.join(os.homedir(), '.local', 'bin')];

export function bundledCliPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'cli', 'fuse.cjs'),
    path.join(app.getAppPath(), '..', 'cli', 'fuse.cjs'),
    path.join(app.getAppPath(), 'dist-cli', 'fuse.cjs'),
    path.join(process.cwd(), 'dist-cli', 'fuse.cjs'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function windowsBinDir(): string {
  return path.join(
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
    'Fuse',
    'bin',
  );
}

export function installedCliPath(): string | null {
  if (process.platform === 'win32') {
    const target = path.join(windowsBinDir(), 'fuse.cmd');
    return existsSync(target) ? target : null;
  }
  for (const dir of UNIX_TARGETS) {
    const target = path.join(dir, 'fuse');
    if (existsSync(target)) return target;
  }
  return null;
}

function writeUnixLauncher(target: string, cliPath: string): void {
  const node = process.execPath;
  const script = [
    '#!/bin/sh',
    '# Fuse CLI launcher, written by the Fuse desktop app',
    `ELECTRON_RUN_AS_NODE=1 exec "${node}" "${cliPath}" "$@"`,
    '',
  ].join('\n');
  writeFileSync(target, script, { mode: 0o755 });
  chmodSync(target, 0o755);
}

function writeWindowsLauncher(target: string, cliPath: string): void {
  const node = process.execPath;
  const script = [
    '@echo off',
    'setlocal',
    'set ELECTRON_RUN_AS_NODE=1',
    `"${node}" "${cliPath}" %*`,
    'endlocal',
    '',
  ].join('\r\n');
  writeFileSync(target, script, 'utf8');
}

export function installCli(): CliInstallResult {
  const cliPath = bundledCliPath();
  if (!cliPath) {
    return {
      installed: false,
      path: null,
      message: 'The bundled CLI could not be found. Run "yarn build:cli" first.',
      needsPathEntry: null,
    };
  }

  if (process.platform === 'win32') {
    const dir = windowsBinDir();
    mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'fuse.cmd');
    writeWindowsLauncher(target, cliPath);
    const onPath = (process.env.PATH ?? '').split(path.delimiter).includes(dir);
    return {
      installed: true,
      path: target,
      message: onPath
        ? 'The fuse command is ready. Open a new terminal to use it.'
        : 'The fuse command was installed. Add its folder to your PATH, then open a new terminal.',
      needsPathEntry: onPath ? null : dir,
    };
  }

  const errors: string[] = [];
  for (const dir of UNIX_TARGETS) {
    try {
      mkdirSync(dir, { recursive: true });
      const target = path.join(dir, 'fuse');
      if (existsSync(target)) unlinkSync(target);
      writeUnixLauncher(target, cliPath);
      const onPath = (process.env.PATH ?? '').split(path.delimiter).includes(dir);
      return {
        installed: true,
        path: target,
        message: onPath
          ? 'The fuse command is ready. Open a new terminal to use it.'
          : `The fuse command was installed in ${dir}. Add that folder to your PATH.`,
        needsPathEntry: onPath ? null : dir,
      };
    } catch (err) {
      errors.push(`${dir}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    installed: false,
    path: null,
    message: `The CLI could not be installed. ${errors.join(' — ')}`,
    needsPathEntry: null,
  };
}

export function uninstallCli(): CliInstallResult {
  const target = installedCliPath();
  if (!target) {
    return {
      installed: false,
      path: null,
      message: 'The CLI is not installed.',
      needsPathEntry: null,
    };
  }
  try {
    unlinkSync(target);
    return {
      installed: false,
      path: null,
      message: 'The fuse command was removed.',
      needsPathEntry: null,
    };
  } catch (err) {
    return {
      installed: true,
      path: target,
      message: `The CLI could not be removed: ${err instanceof Error ? err.message : String(err)}`,
      needsPathEntry: null,
    };
  }
}
