/**
 * Package-boundary DAG guard — the physical successor of the pre-monorepo
 * `boundaries.test.ts` / `layer-constraints.test.ts` contracts.
 *
 * The workspace layout itself now enforces most of what those giant scanners
 * pinned textually: cross-package code physically lives in `packages/*` and
 * resolves through `@kobato/*` package specifiers, so the direction rules
 * collapse into five small checks over package.json manifests and import
 * specifiers:
 *
 *  a. every package's declared `@kobato/*` dependencies fit the allowed DAG;
 *  b. every `src/**` file imports `@kobato/*` only along the DAG (tests-only
 *     edges live in `tests/**`, never in `src/**`);
 *  c. no relative import escapes its package (`../../packages/…` shapes are
 *     how the pre-split layout leaked across layers);
 *  d. the `@/` app alias resolves to `apps/kobato/src` (root tsconfig), so it
 *     may appear only inside the app package itself;
 *  e. inkling is reached only through its three public entry specifiers;
 *  f. product source trees use package-root imports instead of relative traversal.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname as posixDirname, normalize as posixNormalize } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.turbo',
  'coverage',
  'build',
  'dist',
  '.next',
  '.react-router',
  '.source',
  '.vite',
  '.vite-hooks',
  '.idea',
  '.history',
  'tmp',
])

/**
 * The former `@kobato/shared` package: thirteen leaf packages under
 * `packages/shared/*`, each importable by name (`@kobato/utils`, …).
 */
const SHARED_SPLIT = [
  '@kobato/utils',
  '@kobato/i18n',
  '@kobato/cache',
  '@kobato/auth',
  '@kobato/catalog',
  '@kobato/distribution',
  '@kobato/telemetry',
  '@kobato/settings',
  '@kobato/assets',
  '@kobato/lexical',
  '@kobato/sanitize',
  '@kobato/contracts',
  '@kobato/seo',
] as const

/** The workspace's package roots (name = the package.json `name`). */
const REPO_PACKAGES = [
  { name: 'kobato', dir: 'apps/kobato' },
  { name: '@kobato/inkling', dir: 'packages/inkling' },
  { name: '@kobato/utils', dir: 'packages/shared/utils' },
  { name: '@kobato/auth', dir: 'packages/shared/auth' },
  { name: '@kobato/catalog', dir: 'packages/shared/catalog' },
  { name: '@kobato/distribution', dir: 'packages/shared/distribution' },
  { name: '@kobato/telemetry', dir: 'packages/shared/telemetry' },
  { name: '@kobato/i18n', dir: 'packages/shared/i18n' },
  { name: '@kobato/cache', dir: 'packages/shared/cache' },
  { name: '@kobato/settings', dir: 'packages/shared/settings' },
  { name: '@kobato/assets', dir: 'packages/shared/assets' },
  { name: '@kobato/lexical', dir: 'packages/shared/lexical' },
  { name: '@kobato/sanitize', dir: 'packages/shared/sanitize' },
  { name: '@kobato/contracts', dir: 'packages/shared/contracts' },
  { name: '@kobato/seo', dir: 'packages/shared/seo' },
  { name: '@kobato/api', dir: 'packages/api' },
  { name: '@kobato/db', dir: 'packages/db' },
  { name: '@kobato/server', dir: 'packages/server' },
  { name: '@kobato/ui', dir: 'packages/ui' },
  { name: '@kobato/web-admin', dir: 'packages/web/admin' },
  { name: '@kobato/web-tests', dir: 'packages/web/tests' },
  { name: '@kobato/web-client', dir: 'packages/web/client' },
  { name: '@kobato/web-public', dir: 'packages/web/public' },
  { name: '@kobato/toolchain', dir: 'tools/toolchain' },
  { name: '@kobato/test', dir: 'tools/test' },
  { name: '@kobato/trace', dir: 'tools/trace' },
  { name: '@kobato/email', dir: 'tools/email' },
  { name: '@kobato/i18n-tools', dir: 'tools/i18n' },
  { name: '@kobato/pack', dir: 'tools/pack' },
  { name: '@kobato/harness', dir: 'tools/harness' },
  { name: '@kobato/browser', dir: 'tools/browser' },
  { name: '@kobato/inkling-demo', dir: 'apps/inkling-demo' },
] as const

const INTERNAL_SCOPES = REPO_PACKAGES.map((pkg) => pkg.name)

/**
 * Declared-dependency DAG (package.json `@kobato/*` entries, dev or not —
 * the workspace is private, so everything is a devDependency). Entries beyond
 * the runtime DAG exist for a package's TEST tree only; `src/**` is held to
 * the stricter SRC_TARGETS map.
 */
const ALLOWED_DECLARED_INTERNAL_DEPS: Record<string, readonly string[]> = {
  // inkling is a host-agnostic island: tests borrow lexical fixtures + test-helpers.
  // `@kobato/lexical` is a tests-only edge (its fixtures pin the storage format).
  '@kobato/inkling': ['@kobato/inkling', '@kobato/lexical', '@kobato/test'],
  // The split leaf packages. `@kobato/test` is the suite-utility convention;
  // the remaining edges mirror SRC_TARGETS below, except the tests-only ones:
  // settings → contracts (contract-pinning fixtures),
  // i18n → inkling (the label-table suite pins the barrel's DEFAULT_LABELS).
  '@kobato/utils': ['@kobato/utils', '@kobato/i18n', '@kobato/test'],
  '@kobato/auth': ['@kobato/auth', '@kobato/i18n', '@kobato/test'],
  '@kobato/catalog': ['@kobato/catalog', '@kobato/lexical', '@kobato/test'],
  '@kobato/distribution': ['@kobato/distribution', '@kobato/test'],
  '@kobato/telemetry': ['@kobato/telemetry', '@kobato/settings', '@kobato/test'],
  '@kobato/i18n': ['@kobato/i18n', '@kobato/inkling', '@kobato/test'],
  '@kobato/cache': ['@kobato/cache', '@kobato/i18n', '@kobato/utils', '@kobato/test'],
  '@kobato/settings': [
    '@kobato/settings',
    '@kobato/i18n',
    '@kobato/cache',
    '@kobato/assets',
    '@kobato/utils',
    '@kobato/contracts',
    '@kobato/test',
  ],
  '@kobato/assets': ['@kobato/assets', '@kobato/test'],
  // lexical → inkling is a real src edge (the heading-slug save pipeline composes
  // inkling's own `slugify`/tracker through `@kobato/inkling/headless`).
  '@kobato/lexical': [
    '@kobato/lexical',
    '@kobato/inkling',
    '@kobato/sanitize',
    '@kobato/assets',
    '@kobato/utils',
    '@kobato/test',
  ],
  '@kobato/sanitize': ['@kobato/sanitize', '@kobato/test'],
  '@kobato/contracts': [
    '@kobato/contracts',
    '@kobato/auth',
    '@kobato/catalog',
    '@kobato/settings',
    '@kobato/i18n',
    '@kobato/utils',
    '@kobato/lexical',
    '@kobato/assets',
    '@kobato/cache',
    '@kobato/test',
  ],
  '@kobato/seo': ['@kobato/seo', '@kobato/settings', '@kobato/i18n', '@kobato/utils', '@kobato/test'],
  // The oRPC contract-first layer: Zod wire schemas from contracts, nothing else.
  '@kobato/api': ['@kobato/api', '@kobato/contracts', '@kobato/test'],
  '@kobato/db': ['@kobato/db', '@kobato/settings', '@kobato/lexical', '@kobato/test', '@kobato/utils'],
  // server's web-admin entry exists only for its test fixtures; the api entry is the
  // contract-first surface its controllers implement.
  '@kobato/server': [
    '@kobato/server',
    '@kobato/api',
    '@kobato/db',
    '@kobato/inkling',
    '@kobato/web-admin',
    '@kobato/test',
    ...SHARED_SPLIT,
  ],
  '@kobato/ui': [
    '@kobato/ui',
    '@kobato/settings',
    '@kobato/i18n',
    '@kobato/utils',
    '@kobato/web-admin',
    '@kobato/test',
  ],
  // web-admin consumes the public oRPC contract; server is a tests-only fixture
  // edge; web-client is the browser platform leaf and web-public the
  // public-frontend leaf whose audited modules admin reuses as long-term
  // seams.
  '@kobato/web-admin': [
    '@kobato/web-admin',
    '@kobato/web-client',
    '@kobato/web-public',
    '@kobato/ui',
    '@kobato/inkling',
    '@kobato/api',
    '@kobato/server',
    '@kobato/test',
    '@kobato/utils',
    '@kobato/i18n',
    '@kobato/cache',
    '@kobato/auth',
    '@kobato/catalog',
    '@kobato/distribution',
    '@kobato/telemetry',
    '@kobato/settings',
    '@kobato/assets',
    '@kobato/lexical',
    '@kobato/sanitize',
    '@kobato/contracts',
  ],
  // The browser platform leaf (hooks, oRPC client, editor platform). `@kobato/lexical`
  // is a tests-only edge (editor fixtures pin the storage schemas); production never
  // reaches back into `@kobato/web-admin` — the product leaves compose this
  // package, never the reverse.
  '@kobato/web-client': [
    '@kobato/web-client',
    '@kobato/ui',
    '@kobato/inkling',
    '@kobato/api',
    '@kobato/utils',
    '@kobato/i18n',
    '@kobato/settings',
    '@kobato/telemetry',
    '@kobato/distribution',
    '@kobato/contracts',
    '@kobato/lexical',
    '@kobato/test',
  ],
  // The public-frontend leaf (public chrome/comments/widgets plus the
  // cross-surface shared/lib tiers). Composes web-client; never imports back
  // into `@kobato/web-admin` (admin reuses audited modules of THIS package,
  // never the reverse) and never `@kobato/server`.
  '@kobato/web-public': [
    '@kobato/web-public',
    '@kobato/web-client',
    '@kobato/ui',
    '@kobato/inkling',
    '@kobato/utils',
    '@kobato/i18n',
    '@kobato/auth',
    '@kobato/catalog',
    '@kobato/settings',
    '@kobato/assets',
    '@kobato/lexical',
    '@kobato/sanitize',
    '@kobato/contracts',
    '@kobato/test',
  ],
  // Cross-leaf contract/snapshot tests have no production src tree.
  '@kobato/web-tests': [
    '@kobato/catalog',
    '@kobato/inkling',
    '@kobato/lexical',
    '@kobato/test',
    '@kobato/ui',
    '@kobato/utils',
    '@kobato/web-admin',
    '@kobato/web-client',
    '@kobato/web-public',
  ],
  // test-helpers fixtures touch every layer.
  '@kobato/test': [
    '@kobato/test',
    '@kobato/db',
    '@kobato/inkling',
    '@kobato/server',
    '@kobato/ui',
    '@kobato/web-admin',
    '@kobato/web-client',
    '@kobato/web-public',
    ...SHARED_SPLIT,
  ],
  '@kobato/toolchain': [],
  // The out-of-process instance harness: drives built artifacts, not source
  // graphs — its internal surface is deliberately narrow (see its AGENTS.md).
  '@kobato/harness': ['@kobato/harness', '@kobato/settings', '@kobato/utils'],
  // Orchestration and tooling layers may depend on anything internal.
  kobato: INTERNAL_SCOPES,
  '@kobato/email': INTERNAL_SCOPES,
  '@kobato/i18n-tools': INTERNAL_SCOPES,
  '@kobato/pack': INTERNAL_SCOPES,
  '@kobato/trace': INTERNAL_SCOPES,
  '@kobato/browser': INTERNAL_SCOPES,
  '@kobato/inkling-demo': INTERNAL_SCOPES,
}

/**
 * Runtime DAG: which internal packages a package's `src/**` may import. This
 * is stricter than the declared set — the tests-only edges stop at `tests/**`.
 */
const SRC_TARGETS: Record<string, readonly string[]> = {
  // The editor island imports no @kobato/* package at all.
  '@kobato/inkling': [],
  '@kobato/utils': ['@kobato/utils', '@kobato/i18n'],
  '@kobato/auth': ['@kobato/auth', '@kobato/i18n'],
  '@kobato/catalog': ['@kobato/catalog', '@kobato/lexical'],
  '@kobato/distribution': ['@kobato/distribution'],
  '@kobato/telemetry': ['@kobato/telemetry', '@kobato/settings'],
  '@kobato/i18n': ['@kobato/i18n'],
  '@kobato/cache': ['@kobato/cache', '@kobato/i18n', '@kobato/utils'],
  '@kobato/settings': ['@kobato/settings', '@kobato/i18n', '@kobato/cache', '@kobato/assets', '@kobato/utils'],
  '@kobato/assets': ['@kobato/assets'],
  '@kobato/lexical': ['@kobato/lexical', '@kobato/inkling', '@kobato/sanitize', '@kobato/assets', '@kobato/utils'],
  '@kobato/sanitize': ['@kobato/sanitize'],
  '@kobato/contracts': [
    '@kobato/contracts',
    '@kobato/auth',
    '@kobato/catalog',
    '@kobato/settings',
    '@kobato/i18n',
    '@kobato/utils',
    '@kobato/lexical',
    '@kobato/assets',
    '@kobato/cache',
  ],
  '@kobato/seo': ['@kobato/seo', '@kobato/settings', '@kobato/i18n', '@kobato/utils'],
  // Contract procedures compose contracts schemas; the server implements them.
  '@kobato/api': ['@kobato/api', '@kobato/contracts'],
  '@kobato/db': ['@kobato/db', '@kobato/settings', '@kobato/lexical', '@kobato/utils'],
  '@kobato/server': ['@kobato/server', '@kobato/api', '@kobato/db', '@kobato/inkling', ...SHARED_SPLIT],
  '@kobato/ui': ['@kobato/ui', '@kobato/settings', '@kobato/i18n', '@kobato/utils'],
  // web-admin consumes the public oRPC contract, never the server
  // implementation; it composes the browser platform leaf (web-client) and
  // reuses the audited modules of the public-frontend leaf (web-public).
  '@kobato/web-admin': [
    '@kobato/web-admin',
    '@kobato/web-client',
    '@kobato/web-public',
    '@kobato/ui',
    '@kobato/inkling',
    '@kobato/api',
    '@kobato/utils',
    '@kobato/i18n',
    '@kobato/cache',
    '@kobato/auth',
    '@kobato/catalog',
    '@kobato/distribution',
    '@kobato/telemetry',
    '@kobato/settings',
    '@kobato/assets',
    '@kobato/lexical',
    '@kobato/sanitize',
    '@kobato/contracts',
  ],
  // The browser platform leaf: hooks, the oRPC client, and the editor platform.
  // Never `@kobato/web-admin` (product leaves compose client, never the
  // reverse) and never
  // `@kobato/server` — the oRPC client is typed through `@kobato/api` only.
  '@kobato/web-client': [
    '@kobato/web-client',
    '@kobato/ui',
    '@kobato/inkling',
    '@kobato/api',
    '@kobato/utils',
    '@kobato/i18n',
    '@kobato/settings',
    '@kobato/telemetry',
    '@kobato/distribution',
    '@kobato/contracts',
  ],
  // The public-frontend leaf: public chrome/comments/widgets plus the
  // cross-surface shared/lib tiers. Composes web-client; never
  // `@kobato/web-admin` (admin reuses this package, never the reverse) and
  // never `@kobato/server`.
  '@kobato/web-public': [
    '@kobato/web-public',
    '@kobato/web-client',
    '@kobato/ui',
    '@kobato/inkling',
    '@kobato/utils',
    '@kobato/i18n',
    '@kobato/auth',
    '@kobato/catalog',
    '@kobato/settings',
    '@kobato/assets',
    '@kobato/lexical',
    '@kobato/sanitize',
    '@kobato/contracts',
  ],
  '@kobato/test': [
    '@kobato/test',
    '@kobato/db',
    '@kobato/inkling',
    '@kobato/server',
    '@kobato/ui',
    '@kobato/web-admin',
    '@kobato/web-client',
    '@kobato/web-public',
    ...SHARED_SPLIT,
  ],
  '@kobato/toolchain': [],
  kobato: INTERNAL_SCOPES,
  // The instance harness keeps the same narrow src DAG as its declarations.
  '@kobato/harness': ['@kobato/harness', '@kobato/settings', '@kobato/utils'],
  // Tooling packages (SEA pipeline, OpenObserve DEV container, journey
  // runner, preview/report generators) may reach any internal package from
  // their src trees.
  '@kobato/pack': INTERNAL_SCOPES,
  '@kobato/trace': INTERNAL_SCOPES,
  '@kobato/browser': INTERNAL_SCOPES,
  '@kobato/email': INTERNAL_SCOPES,
  '@kobato/i18n-tools': INTERNAL_SCOPES,
}

/**
 * Documented src-tree exceptions to SRC_TARGETS — every one type-only, so no
 * runtime graph ever crosses the DAG backwards:
 *  · web's api client needs the router type to build the typed RouterClient —
 *    the single sanctioned web→server channel.
 */
const SRC_IMPORT_EXCEPTIONS: readonly { file: string; specifier: string }[] = []

/**
 * Relative imports that cross a package boundary. Every entry is a TEST
 * reaching into a sibling tree without going through its package surface —
 * `tools/pack/**` (SEA tooling: no exports map, not a declared dependency
 * of any package) or `apps/inkling-demo/**` (inkling's playground host) —
 * plus the one web→inkling case: the host-card parity test reaches two
 * internals the inkling exports map deliberately does not expose (inkling's
 * public surface is kept closed; the test walks the source relatively until
 * those pins move behind the barrel). Production `src/**` trees have exactly
 * ONE entry: the SEA server entry imports the app's built bundle, which is
 * a build output without a package specifier.
 */
const RELATIVE_ESCAPE_EXCEPTIONS = new Set([
  'packages/web/admin/tests/unit/ui/editor/cards/host-cards.test.tsx:../../../../../../../inkling/src/labels/inkling-labels.ts',
  'packages/web/admin/tests/unit/ui/editor/cards/host-cards.test.tsx:../../../../../../../inkling/src/nodes/cards/host-card-registry.ts',
  // Contract tests pinning the SEA tooling sources textually.
  'packages/shared/distribution/tests/unit/sea/inline-package-data.test.ts:../../../../../../tools/pack/src/sea/inline-package-data.ts',
  'packages/shared/distribution/tests/unit/sea/native-specifiers.test.ts:../../../../../../tools/pack/src/sea/redirect-native-requires.ts',
  'packages/shared/distribution/tests/unit/sea/bundle-globals.test.ts:../../../../../../tools/pack/src/sea/check-bundle.ts',
  'packages/server/tests/unit/server/infra/sea-compression.test.ts:../../../../../../tools/pack/src/sea/assets.ts',
  // The SEA server entry pulls the app's built bundle into the single-file
  // vite build; a build output has no package specifier to import by.
  'tools/pack/src/sea/server-entry.ts:../../../../apps/kobato/build/server/index.js',
  // The demo playground is inkling's host app; its glue implements the
  // host contract inkling's suite type-checks and tests against.
  'packages/inkling/tests/typecheck/demo-host-contracts.ts:../../../../apps/inkling-demo/utils/fetchEmbed',
  'packages/inkling/tests/typecheck/demo-host-contracts.ts:../../../../apps/inkling-demo/utils/useSnippets',
  'packages/inkling/tests/unit/demo/useSnippets.test.tsx:../../../../../apps/inkling-demo/utils/useSnippets',
  'packages/inkling/tests/utils/gen-demo-content.test.ts:../../../../apps/inkling-demo/components/MusicPlayerCard',
])

/** The `@/` alias resolves to `apps/kobato/src` — app-package internal shorthand. */
const APP_PACKAGE_DIR = 'apps/kobato'

function walk(root: string, out: string[]): void {
  if (!existsSync(root)) {
    return
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue
    }
    const full = `${root}/${entry.name}`
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && /\.(?:ts|tsx|mts)$/.test(entry.name)) {
      out.push(full)
    }
  }
}

function sourceFiles(...roots: string[]): string[] {
  const files: string[] = []
  for (const root of roots) {
    walk(root, files)
  }
  return files.sort()
}

// Comments may quote specifiers; only real import statements count.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// Whole-file match: static `from`, side-effect/dynamic `import`, and vi.mock
// module paths — the shapes a bundler or test runner would resolve.
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const specifierRe = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(specifierRe)) {
    specifiers.push(match[1])
  }
  return specifiers
}

function readSource(file: string): string {
  return stripComments(readFileSync(`${REPO_ROOT}/${file}`, 'utf8'))
}

/** `import type … from '<specifier>'` (whole clause type-only). */
function isTypeOnlyImport(source: string, specifier: string): boolean {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`import\\s+type\\s+[\\s\\S]{0,400}?from\\s+['"]${escaped}['"]`).test(source)
}

function packageDirOf(file: string): string | null {
  return REPO_PACKAGES.find((pkg) => file === pkg.dir || file.startsWith(`${pkg.dir}/`))?.dir ?? null
}

function declaredInternalDeps(pkgName: string): string[] {
  const dir = REPO_PACKAGES.find((pkg) => pkg.name === pkgName)!.dir
  const manifest = JSON.parse(readFileSync(`${REPO_ROOT}/${dir}/package.json`, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter((dep) =>
    dep.startsWith('@kobato/'),
  )
}

describe('package DAG', () => {
  it('every package declares only DAG-allowed @kobato/* dependencies', () => {
    const offenders: string[] = []
    for (const pkg of REPO_PACKAGES) {
      const allowed = ALLOWED_DECLARED_INTERNAL_DEPS[pkg.name]!
      for (const dep of declaredInternalDeps(pkg.name)) {
        if (!allowed.includes(dep)) {
          offenders.push(`${pkg.dir}/package.json declares ${dep}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('src trees import @kobato/* only along the DAG, only as declared targets', () => {
    const offenders: string[] = []
    const exceptionKeys = new Set(SRC_IMPORT_EXCEPTIONS.map((entry) => `${entry.file}:${entry.specifier}`))
    const srcTrees = REPO_PACKAGES.filter((pkg) => existsSync(`${REPO_ROOT}/${pkg.dir}/src`))

    for (const pkg of srcTrees) {
      const allowedTargets = SRC_TARGETS[pkg.name]!
      const declared = new Set(declaredInternalDeps(pkg.name))
      for (const file of sourceFiles(`${pkg.dir}/src`)) {
        for (const specifier of importSpecifiers(readSource(file))) {
          const target = INTERNAL_SCOPES.find((scope) => specifier === scope || specifier.startsWith(`${scope}/`))
          if (target === undefined) {
            continue
          }
          if (exceptionKeys.has(`${file}:${specifier}`)) {
            continue
          }
          if (!allowedTargets.includes(target)) {
            offenders.push(`${file}: ${specifier} (outside the ${pkg.name} src DAG)`)
          } else if (!declared.has(target)) {
            offenders.push(`${file}: ${specifier} (target not declared in ${pkg.dir}/package.json)`)
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('the documented src-import exceptions are exactly the pinned list, each type-only', () => {
    for (const { file, specifier } of SRC_IMPORT_EXCEPTIONS) {
      expect(existsSync(`${REPO_ROOT}/${file}`), `${file} no longer exists`).toBe(true)
      const source = readSource(file)
      expect(importSpecifiers(source), `${file} no longer imports ${specifier}`).toContain(specifier)
      expect(isTypeOnlyImport(source, specifier), `${file}: ${specifier} must stay type-only`).toBe(true)
    }

    // Nothing else in any src tree reaches across the DAG: the exceptions
    // above are the complete backward-edge set.
    const exceptionFiles = new Set(SRC_IMPORT_EXCEPTIONS.map((entry) => entry.file))
    const strays: string[] = []
    for (const pkg of REPO_PACKAGES.filter((p) => existsSync(`${REPO_ROOT}/${p.dir}/src`))) {
      const allowedTargets = SRC_TARGETS[pkg.name]!
      for (const file of sourceFiles(`${pkg.dir}/src`)) {
        if (exceptionFiles.has(file)) {
          continue
        }
        for (const specifier of importSpecifiers(readSource(file))) {
          const target = INTERNAL_SCOPES.find((scope) => specifier === scope || specifier.startsWith(`${scope}/`))
          if (target !== undefined && !allowedTargets.includes(target)) {
            strays.push(`${file}: ${specifier}`)
          }
        }
      }
    }
    expect(strays).toEqual([])
  })

  it('no relative import escapes its package boundary', () => {
    const offenders: string[] = []
    const trees = REPO_PACKAGES.flatMap((pkg) =>
      (['src', 'tests'] as const)
        .filter((tree) => existsSync(`${REPO_ROOT}/${pkg.dir}/${tree}`))
        .map((tree) => `${pkg.dir}/${tree}`),
    )

    for (const file of sourceFiles(...trees)) {
      const pkgDir = packageDirOf(file)
      if (pkgDir === null) {
        continue
      }
      for (const specifier of importSpecifiers(readSource(file))) {
        if (!specifier.startsWith('.')) {
          continue
        }
        const resolved = posixNormalize(`${posixDirname(file)}/${specifier}`)
        if (resolved !== pkgDir && !resolved.startsWith(`${pkgDir}/`)) {
          const key = `${file}:${specifier}`
          if (!RELATIVE_ESCAPE_EXCEPTIONS.has(key)) {
            offenders.push(`${file}: ${specifier} escapes ${pkgDir}`)
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('the @/ app alias appears only inside the app package', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('apps', 'packages', 'scripts', 'tools', 'demo')) {
      if (file.startsWith(`${APP_PACKAGE_DIR}/`)) {
        continue
      }
      for (const specifier of importSpecifiers(readSource(file))) {
        if (specifier.startsWith('@/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('workspace package versions stay synchronized', () => {
    const source = JSON.parse(readFileSync(`${REPO_ROOT}/apps/kobato/package.json`, 'utf8')) as { version: string }
    for (const pkg of REPO_PACKAGES) {
      const manifest = JSON.parse(readFileSync(`${REPO_ROOT}/${pkg.dir}/package.json`, 'utf8')) as { version: string }
      expect(manifest.version, `${pkg.dir}/package.json version`).toBe(source.version)
    }
  })

  it('db and ui expose bounded package surfaces', () => {
    for (const dir of ['packages/db', 'packages/ui']) {
      const manifest = JSON.parse(readFileSync(`${REPO_ROOT}/${dir}/package.json`, 'utf8')) as {
        exports: Record<string, string>
      }
      expect(manifest.exports, `${dir} must not expose every source file`).not.toHaveProperty('./*')
    }
  })

  it('product source trees use package-root imports', () => {
    const rootAnchored = new Set([
      'kobato',
      ...SHARED_SPLIT,
      '@kobato/api',
      '@kobato/db',
      '@kobato/server',
      '@kobato/ui',
      '@kobato/web-admin',
      '@kobato/web-client',
      '@kobato/web-public',
    ])
    const offenders: string[] = []
    for (const pkg of REPO_PACKAGES.filter((entry) => rootAnchored.has(entry.name))) {
      for (const file of sourceFiles(`${pkg.dir}/src`)) {
        for (const specifier of importSpecifiers(readSource(file))) {
          if (specifier.startsWith('.') && !specifier.startsWith('./+types/')) {
            offenders.push(`${file}: ${specifier}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('inkling is reached only through its barrel, headless, or styles entries', () => {
    // The demo playground is out of scope: its vite config aliases
    // @kobato/inkling straight at the package source and deliberately reaches
    // internals (apps/inkling-demo/vite.config.ts).
    const offenders: string[] = []
    for (const file of sourceFiles('apps', 'packages', 'scripts', 'tools')) {
      if (file.startsWith('apps/inkling-demo/')) {
        continue
      }
      for (const specifier of importSpecifiers(readSource(file))) {
        if (!specifier.startsWith('@kobato/inkling/')) {
          continue
        }
        if (specifier !== '@kobato/inkling/headless' && !specifier.startsWith('@kobato/inkling/styles/')) {
          offenders.push(`${file}: ${specifier} (deep import past the entry surfaces)`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('server and lexical never reach the React inkling barrel', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('packages/server/src', 'packages/shared/lexical/src')) {
      for (const specifier of importSpecifiers(readSource(file))) {
        if (specifier === '@kobato/inkling') {
          offenders.push(`${file}: ${specifier} (server/lexical must use @kobato/inkling/headless)`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
