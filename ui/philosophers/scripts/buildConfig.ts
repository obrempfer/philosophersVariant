import type { BuildOptions } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageDir: string = dirname(dirname(fileURLToPath(import.meta.url)));
export const distDir: string = join(packageDir, 'dist');

export const prepareHtml = async (): Promise<void> => {
  await mkdir(distDir, { recursive: true });
  await copyFile(join(packageDir, 'src', 'index.html'), join(distDir, 'index.html'));
};

export const buildOptions: BuildOptions = {
  entryPoints: [join(packageDir, 'src', 'ui.ts')],
  bundle: true,
  entryNames: 'app',
  format: 'esm',
  logLevel: 'info',
  outdir: distDir,
  sourcemap: true,
  target: 'es2021',
};
