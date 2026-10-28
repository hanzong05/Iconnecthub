import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

/** The embed script may be served without a charset, so keep the bundle pure ASCII (symbols and emoji become \\u escapes). */
function asciiOnly(): Plugin {
  return {
    name: 'ascii-only',
    generateBundle(_o, bundle) {
      for (const f of Object.values(bundle)) {
        if (f.type === 'chunk') f.code = f.code.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
      }
    },
  }
}

const root = fileURLToPath(new URL('..', import.meta.url))
// One self-contained script for the GoHighLevel embed: React, the app and its styles in a single file.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { '@': root } },
  esbuild: { jsx: 'automatic' },
  plugins: [asciiOnly()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2019',
    cssCodeSplit: false,
    lib: { entry: 'src/main.tsx', formats: ['iife'], name: 'BlueSpotHub', fileName: () => 'bluespot-hub.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
