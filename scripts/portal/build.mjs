import { build } from 'esbuild';

await build({
  entryPoints: ['node_modules/@supabase/supabase-js/dist/module/index.js'],
  outfile: 'scripts/portal/vendor/supabase.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'eof',
});
