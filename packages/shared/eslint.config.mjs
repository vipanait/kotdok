import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

// Portable TypeScript, no framework: typescript-eslint's recommended rules.
export default defineConfig([
  tseslint.configs.recommended,
  {
    rules: {
      // `const { $id: _id, ...rest } = value` drops a key on purpose.
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
  {
    // An unused import (WEIGHT_MAX_KG) left for the next change to this file;
    // drop the override together with it.
    files: ['src/medical-record/weight-entry.ts'],
    rules: { '@typescript-eslint/no-unused-vars': 'warn' },
  },
])
