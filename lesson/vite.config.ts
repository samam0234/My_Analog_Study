import { defineConfig } from 'vitest/config';
import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import nitro from '@analogjs/vite-plugin-nitro';

export default defineConfig({
  build: { target: ['es2020'] },
  resolve: { mainFields: ['module'] },
  server: { port: 5173, strictPort: true, hmr: { port: 5174 } },
  plugins: [
    analog({ content: { highlighter: 'prism' } }),
    angular(),
    nitro({
      preset: 'node-server',
      experimental: { websocket: true },
      prerender: { routes: ['/blog/welcome'], crawlLinks: false },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/*.spec.ts'],
  },
});
