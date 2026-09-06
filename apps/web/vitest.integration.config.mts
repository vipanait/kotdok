import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

// Only .env.integration, read directly.
//
// Vite's loadEnv would also pull in .env.local, which on a developer's machine
// holds production credentials. The integration suite must be reproducible and
// must not quietly inherit them: CI has no .env.local, so a test that passes
// only because of one passes nowhere else.
for (const line of readFileSync(`${root}.env.integration`, 'utf8').split('\n')) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (match) process.env[match[1]] = match[2]
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
