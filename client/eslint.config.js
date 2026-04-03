import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // shadcn/ui components and utility exports legitimately mix exports — not a real error
      'react-refresh/only-export-components': 'warn',
      // API responses and dynamic data commonly require any — treat as warning
      '@typescript-eslint/no-explicit-any': 'warn',
      // Form state sync via useEffect is a legitimate pattern
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
