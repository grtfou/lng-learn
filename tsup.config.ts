import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['apps/server/src/index.ts'], outDir: 'dist/server',
  format: ['esm'], target: 'node24', platform: 'node',
  removeNodeProtocol: false,
  sourcemap: true, clean: true,
});
