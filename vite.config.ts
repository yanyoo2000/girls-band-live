/**
 * Vite 配置（tech-spec §10.1；集成层，tech-director 所有）。
 *
 * - `root: 'src'`：Vite 根入口是 `src/index.html`，仓库根 `index.html` 由构建脚本生成；
 * - `base: './'`：产物可 `file://` 直接打开；
 * - 单入口、CSS 不拆分、资源尽量内联，配合 `tools/build-single.mjs` 生成单文件。
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const entry = fileURLToPath(new URL('./src/index.html', import.meta.url));
const projectRoot = process.cwd();

export default defineConfig({
  root: 'src',
  base: './',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    sourcemap: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
    reportCompressedSize: false,
    rollupOptions: { input: entry },
  },
  test: {
    root: projectRoot,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
