import { resolve } from 'node:path'

// NOTE: paths are computed from process.cwd() (the repo root), NOT
// import.meta.dirname — rolldown bundles this module into each project
// config, and import.meta points at the bundle's temp location then.
// Every test command runs from the repo root (pnpm scripts), same
// convention as the arch tests' PROJECT_ROOT = process.cwd().

// Shared alias tables for the per-tier project configs under
// `tests/{unit,it,snaps}/`. Stage 1 of the workspace split moved the tests
// with their packages/apps; Vite's native tsconfig paths resolution only
// applies to files under a config file's directory, so every project
// carries explicit `resolve.alias` entries.
//
// `@/` is app-scoped: core tests resolve `@/*` to the core app's src,
// public tests to the public app's — which is why the apps get their own
// project config files per tier. The `@/styles/public.css` fallback serves
// `packages/ui/src/public/chrome/BaseLayout.tsx`, the one package source
// that still imports the app-owned stylesheet through the historical `@/`
// alias (resolved per app build; under tests it must land in the public
// app, the owner of public.css).

const repoRoot = resolve(process.cwd())
const coreSrc = resolve(repoRoot, 'apps/core/src')
const publicSrc = resolve(repoRoot, 'apps/public/src')
const sharedSrc = resolve(repoRoot, 'packages/shared/src')
const serverSrc = resolve(repoRoot, 'packages/server/src')
const uiSrc = resolve(repoRoot, 'packages/ui/src')
const clientSrc = resolve(repoRoot, 'packages/client/src')
const editorSrc = resolve(repoRoot, 'packages/editor/src')
const sdkSrc = resolve(repoRoot, 'packages/sdk/src')
const testsDir = resolve(repoRoot, 'tests')

export interface AliasEntry {
  find: string | RegExp
  replacement: string
}

export const PKG_ALIASES: AliasEntry[] = [
  { find: '@kobato/shared', replacement: sharedSrc },
  { find: '@kobato/server', replacement: serverSrc },
  { find: '@kobato/ui', replacement: uiSrc },
  { find: '@kobato/client', replacement: clientSrc },
  { find: '@kobato/editor', replacement: editorSrc },
  { find: '@kobato/sdk', replacement: sdkSrc },
  { find: '#/', replacement: testsDir + '/' },
  // `@/styles/public.css` — the one package source (`packages/ui/src/
  // public/chrome/BaseLayout.tsx`) that still imports the app-owned
  // stylesheet through the historical `@/` alias (resolved per app build;
  // under tests it must land in the public app, the owner of public.css).
  { find: /^@\/styles\/public\.css/, replacement: publicSrc + '/styles/public.css' },
  // Generic `@/` fallback for package tests that render core-app routes
  // (e.g. `packages/ui/tests/snaps/routes/*` render the admin/editor/auth
  // route modules). App projects list their own `@/` entries FIRST so the
  // per-app mapping wins the lookup.
  { find: '@/', replacement: coreSrc + '/' },
]

// Core-app tests: `@/` resolves to the core app. `@/routes/public/*` is the
// one prefix that only exists in the public app — a core-side test importing
// a public route (editor preview / SEO checks) falls through to it.
export const CORE_ALIASES: AliasEntry[] = [
  { find: /^@\/routes\/public(?=\/|$)/, replacement: publicSrc + '/routes/public' },
  { find: /^@\/styles\/public\.css/, replacement: publicSrc + '/styles/public.css' },
  { find: '@/', replacement: coreSrc + '/' },
]

// Public-app tests: `@/` resolves to the public app (its route modules
// internally import `@/root`, `@/entry.server` etc.).
export const PUBLIC_ALIASES: AliasEntry[] = [{ find: '@/', replacement: publicSrc + '/' }]
