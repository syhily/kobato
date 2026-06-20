import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

// unit-ui: React component tests using @testing-library/react + happy-dom.
//
// This project is deliberately separate from `tests/unit` (which is SSR-only,
// `environment: 'node'`). The inkling editor mounts a live LexicalComposer,
// which needs a DOM + React reconciler — neither of which the SSR harness
// provides. happy-dom is already a devDependency (used by some headless
// Lexical tests via per-file `@vitest-environment happy-dom` directives).
//
// Scope: pure UI/component behaviour for `src/ui/inkling/editor/**`. Server
// modules (which need DB/Redis) are out of scope here — mock them at the
// boundary (oRPC client, fetch) rather than wiring real connections.
const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DESCRIPTION__: JSON.stringify(pkg.description),
    __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
    __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
    __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
  },
  test: {
    globals: false,
    silent: 'passed-only',
    environment: 'happy-dom',
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.ts'],
    testTimeout: 10_000,
  },
})
