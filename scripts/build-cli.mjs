import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const out = resolve(root, 'dist-cli');

mkdirSync(out, { recursive: true });

await build({
  entryPoints: [resolve(root, 'cli/src/main.ts')],
  outfile: resolve(out, 'fuse.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  alias: { '@shared': resolve(root, 'shared') },
  sourcemap: false,
  minify: true,
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});

chmodSync(resolve(out, 'fuse.cjs'), 0o755);

writeFileSync(
  resolve(out, 'fuse.cmd'),
  ['@echo off', 'setlocal', 'node "%~dp0fuse.cjs" %*', 'endlocal'].join('\r\n'),
  'utf8',
);

console.log('[cli] build complete');
