import { defineConfig } from 'oxfmt'

export default defineConfig({
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  endOfLine: 'lf',
  insertFinalNewline: true,
  ignorePatterns: ['.agents/skills/*', 'drizzle/**/*'],
  jsxSingleQuote: false,
  objectWrap: 'preserve',
  printWidth: 120,
  quoteProps: 'as-needed',
  tabWidth: 2,
  useTabs: false,
  singleQuote: true,
  semi: false,
  trailingComma: 'all',
  sortPackageJson: {
    sortScripts: true,
  },
  sortImports: {
    groups: [
      'type-import',
      // `#/_helpers/*` MUST evaluate before any module that transitively
      // pulls in @tanstack/react-query: mock-react-query.ts registers its
      // vi.mock at module scope, and vitest only applies it if the mock is
      // registered before the real module is first imported. Custom groups
      // beat the predefined ones, so these helpers always lead the
      // value-import blocks in test files.
      'test-helpers',
      ['value-builtin', 'value-external'],
      'type-internal',
      'value-internal',
      ['type-parent', 'type-sibling', 'type-index'],
      ['value-parent', 'value-sibling', 'value-index'],
      'unknown',
    ],
    customGroups: [{ groupName: 'test-helpers', elementNamePattern: ['#/_helpers/*'] }],
  },
  sortTailwindcss: {
    // The design-token stylesheet moved with the core app in the split.
    stylesheet: './apps/core/src/styles/tailwind.css',
    functions: ['cn'],
    preserveWhitespace: true,
  },
})
