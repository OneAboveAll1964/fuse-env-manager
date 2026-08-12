import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

mkdirSync(resolve(root, 'dist-electron'), { recursive: true });

const watch = process.argv.includes('--watch');

const baseOptions = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

const targets = [
  {
    entryPoints: [resolve(root, 'electron/main.ts')],
    outfile: resolve(root, 'dist-electron/main.cjs'),
  },
  {
    entryPoints: [resolve(root, 'electron/preload.ts')],
    outfile: resolve(root, 'dist-electron/preload.cjs'),
  },
];

if (watch) {
  for (const t of targets) {
    const ctx = await context({ ...baseOptions, ...t });
    await ctx.watch();
  }
  console.log('[electron] esbuild watching electron/main.ts + preload.ts');
} else {
  for (const t of targets) {
    await build({ ...baseOptions, ...t });
  }
  console.log('[electron] build complete');
}
