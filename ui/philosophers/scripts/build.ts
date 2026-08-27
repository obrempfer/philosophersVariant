import { build } from 'esbuild';

import { buildOptions, prepareHtml } from './buildConfig';

await prepareHtml();
await build(buildOptions);
