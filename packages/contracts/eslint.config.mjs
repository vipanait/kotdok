import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

// Portable TypeScript, no framework: typescript-eslint's recommended rules.
export default defineConfig([
  tseslint.configs.recommended,
  {
    rules: {
      // `const { $id: _id, ...rest } = schema` drops a key on purpose.
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
])
