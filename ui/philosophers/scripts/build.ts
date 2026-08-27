import { build } from 'esbuild';

import { buildOptions, prepareDist } from './buildConfig';

await prepareDist();
await build(buildOptions);
