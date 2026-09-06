import { configDefaults, defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const testEnv = loadEnv('test', root, '')

for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] = value
}

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests need the live local stack; they run via
    // vitest.integration.config.mts, not in the default suite.
    exclude: [...configDefaults.exclude, '.orch/**', 'tests/integration/**'],
    globals: false,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/mocks/server-only.ts', import.meta.url)),
    },
  },
  cacheDir: `${root}node_modules/.vitest`,
})
