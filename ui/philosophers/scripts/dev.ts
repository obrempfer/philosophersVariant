import { context } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative } from 'node:path';

import { buildOptions, distDir, prepareDist } from './buildConfig';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

await prepareDist();
const build = await context(buildOptions);
await build.watch();

const server = createServer(async (request, response) => {
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Cache-Control', 'no-store');

  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const requestedPath = join(distDir, pathname === '/' ? 'index.html' : pathname);
    if (relative(distDir, requestedPath).startsWith('..'))
      throw new Error('Path outside distribution directory');
    const body = await readFile(requestedPath);
    response.statusCode = 200;
    response.setHeader('Content-Type', contentTypes[extname(requestedPath)] ?? 'application/octet-stream');
    response.end(body);
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
});

await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(4173, '127.0.0.1', resolve);
});

console.log("Philosophers' Chess is running at http://127.0.0.1:4173");

const shutdown = async (): Promise<void> => {
  server.close();
  await build.dispose();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
await new Promise(() => undefined);
