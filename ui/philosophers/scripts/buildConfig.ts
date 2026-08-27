import type { BuildOptions } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageDir: string = dirname(dirname(fileURLToPath(import.meta.url)));
export const distDir: string = join(packageDir, 'dist');

export const prepareDist = async (): Promise<void> => {
  const engineDir = join(distDir, 'engine');
  const stockfishDir = join(packageDir, 'node_modules', '@lichess-org', 'stockfish-web');
  await mkdir(engineDir, { recursive: true });
  await copyFile(join(packageDir, 'src', 'index.html'), join(distDir, 'index.html'));
  await Promise.all([
    copyFile(join(stockfishDir, 'fsf_14.js'), join(engineDir, 'fsf_14.js')),
    copyFile(join(stockfishDir, 'fsf_14.wasm'), join(engineDir, 'fsf_14.wasm')),
    copyFile(join(stockfishDir, 'LICENSE'), join(engineDir, 'Stockfish-COPYING.txt')),
    copyFile(join(stockfishDir, 'README.md'), join(engineDir, 'Stockfish-SOURCE.md')),
  ]);
};

export const buildOptions: BuildOptions = {
  entryPoints: {
    app: join(packageDir, 'src', 'ui.ts'),
    philosopherWorker: join(packageDir, 'src', 'philosopherWorker.ts'),
  },
  bundle: true,
  entryNames: '[name]',
  format: 'esm',
  logLevel: 'info',
  outdir: distDir,
  sourcemap: true,
  target: 'es2021',
};
