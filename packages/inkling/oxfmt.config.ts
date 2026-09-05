import { defineConfig } from 'oxfmt'

// Aligned to /Users/Yufan/Developer/Business/syhily/kobato/oxfmt.config.ts.
// Adaptations: Inkling has no `cn` wrapper (uses `clsx` directly), its tailwind
// directive file is src/styles/index.css, and ignorePatterns cover the
// pnpm/Inkling build outputs. All other style knobs mirror kobato exactly.
export default defineConfig({
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  endOfLine: 'lf',
  insertFinalNewline: true,
  ignorePatterns: [
    'node_modules/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.pnpm/**',
    '**/*.min.js',
    'pnpm-lock.yaml',
    '**/*.html',
    'storybook-static/**',
  ],
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
    stylesheet: 'src/styles/index.css',
    functions: ['clsx'],
    preserveWhitespace: true,
  },
})
