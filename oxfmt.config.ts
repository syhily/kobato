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
      ['value-builtin', 'value-external'],
      'type-internal',
      'value-internal',
      ['type-parent', 'type-sibling', 'type-index'],
      ['value-parent', 'value-sibling', 'value-index'],
      'unknown',
    ],
  },
  sortTailwindcss: {
    stylesheet: './src/styles/public.css',
    functions: ['cn'],
    preserveWhitespace: true,
  },
})
