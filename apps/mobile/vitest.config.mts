import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Only the pure logic is tested here — session storage, token refresh and link
// parsing. Rendering React Native components needs a device or a simulator and
// belongs to the manual checks of this stage.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    restoreMocks: true,
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
