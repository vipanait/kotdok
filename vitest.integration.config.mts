import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

// `integration` mode loads .env.integration: the disposable local stack only.
for (const [key, value] of Object.entries(loadEnv('integration', root, ''))) {
  process.env[key] = value
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    restoreMocks: true,
    include: ['tests/integration/**/*.test.ts'],
    // One live database, shared fixtures: no parallel files.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/mocks/server-only.ts', import.meta.url)),
    },
  },
  cacheDir: `${root}node_modules/.vitest-integration`,
})
