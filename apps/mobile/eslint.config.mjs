import { defineConfig, globalIgnores } from 'eslint/config'
import expoConfig from 'eslint-config-expo/flat.js'
import globals from 'globals'

// Expo's own flat config for SDK 57: React, hooks, import and the Expo rules,
// with TypeScript through typescript-eslint.
export default defineConfig([
  expoConfig,
  {
    rules: {
      // The React Compiler rules of eslint-plugin-react-hooks 7 find refs read
      // during render, setState inside effects and a computed memo dependency
      // list in code written before lint existed here. None of it is a
      // mechanical fix, so they report as warnings until the screens are
      // reworked; the list is in the pull request that added this file.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/use-memo': 'warn',
      // The code base writes Array<T> and ReadonlyArray<T>, as apps/web does.
      '@typescript-eslint/array-type': 'off',
    },
  },
  {
    // Build scripts and config plugins run in Node, not in the app.
    files: ['scripts/**/*.mjs', 'plugins/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  // ESLint does not read .gitignore: build output and generated native
  // projects are listed here again.
  globalIgnores(['dist/**', '.expo/**', 'android/**', 'ios/**']),
])
