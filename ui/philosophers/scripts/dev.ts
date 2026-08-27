import { context } from 'esbuild';

import { buildOptions, distDir, prepareHtml } from './buildConfig';

await prepareHtml();
const build = await context(buildOptions);
await build.watch();
const server = await build.serve({ host: '127.0.0.1', port: 4173, servedir: distDir });

console.log(`Philosophers' Chess is running at http://${server.hosts[0]}:${server.port}`);

const shutdown = async (): Promise<void> => {
  await build.dispose();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
await new Promise(() => undefined);
