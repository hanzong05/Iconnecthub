import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  resolve: { alias: { '@': root, 'server-only': `${root}node_modules/server-only/empty.js` } },
  test: { include: ['lib/**/*.test.ts', 'app/**/*.test.ts'], environment: 'node' },
})
