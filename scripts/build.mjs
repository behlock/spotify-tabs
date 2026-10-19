import { build } from 'esbuild';
import { BUNDLE_PATH, PROJECT_ROOT } from './lib/config.mjs';

await build({
  absWorkingDir: PROJECT_ROOT,
  entryPoints: ['src/index.ts'],
  outfile: BUNDLE_PATH,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  loader: { '.css': 'text' },
});
console.log('Built dist/spotify-tabs.js');
