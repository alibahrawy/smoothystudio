import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        // The background-removal worker is forked by path, so it needs to be a
        // sibling output at out/main/workers/bg-host.js rather than inlined.
        input: {
          index: resolve('src/main/index.ts'),
          'workers/bg-host': resolve('src/main/workers/bg-host.ts'),
        },
        output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js' },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5176, // 5175 is SmoothyDesktop — distinct so both can run side-by-side
    },
  },
})
