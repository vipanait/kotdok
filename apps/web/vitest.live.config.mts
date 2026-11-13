import { defineConfig } from 'vitest/config'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

// Runs against the real model, on purpose and by hand only: `npm run live:check-questions`.
// The key comes from the environment, or from .env.staging.local (the secret
// half of `dev:staging`, never committed); it stays in this process and is
// never printed. .env.staging itself holds only a placeholder.
if (!process.env.OPENAI_API_KEY && existsSync(`${root}.env.staging.local`)) {
  for (const line of readFileSync(`${root}.env.staging.local`, 'utf8').split('\n')) {
    const match = /^OPENAI_API_KEY=(.*)$/.exec(line.trim())
    if (match) process.env.OPENAI_API_KEY = match[1]
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.live.ts'],
    testTimeout: 600_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/mocks/server-only.ts', import.meta.url)),
    },
  },
  cacheDir: `${root}node_modules/.vitest-live`,
})
