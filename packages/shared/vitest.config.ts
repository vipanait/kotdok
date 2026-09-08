import { defineConfig } from 'vitest/config'

// The client is transport for both apps, so its rules are tested here rather
// than from whichever app happened to notice them.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    restoreMocks: true,
    include: ['src/**/*.test.ts'],
  },
})
