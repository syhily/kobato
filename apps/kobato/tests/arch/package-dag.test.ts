import { REPO_PACKAGES } from '@tests/arch/workspace-packages'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname as posixDirname, normalize as posixNormalize } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const CONFIG_PACKAGE = '@kobato/tsconfig'

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

const SHARED_SPLIT = [
  '@kobato/utils',
  '@kobato/i18n',
  '@kobato/cache',
  '@kobato/auth',
  '@kobato/catalog',
  '@kobato/distribution',
  '@kobato/settings',
  '@kobato/assets',
  '@kobato/sanitize',
] as const

// The shared leaves @kobato/api depends on (rpc procedures + contracts schemas) — every new edge changes exactly this
// list.
const API_SHARED_DEPS = [
  '@kobato/auth',
  '@kobato/catalog',
  '@kobato/settings',
  '@kobato/i18n',
  '@kobato/utils',
  '@kobato/inkling',
  '@kobato/assets',
  '@kobato/cache',
] as const

const INTERNAL_SCOPES = REPO_PACKAGES.map((pkg) => pkg.name)

const ALLOWED_DECLARED_INTERNAL_DEPS: Record<string, readonly string[]> = {
  '@kobato/tsconfig': [],
  '@kobato/inkling': [
    '@kobato/i18n',
    '@kobato/distribution',
    '@kobato/sanitize',
    '@kobato/assets',
    '@kobato/utils',
    '@kobato/ui',
    '@kobato/test',
  ],

  '@kobato/utils': ['@kobato/i18n', '@kobato/test'],
  '@kobato/auth': ['@kobato/i18n', '@kobato/test'],
  '@kobato/catalog': ['@kobato/inkling', '@kobato/settings', '@kobato/i18n', '@kobato/utils', '@kobato/test'],
  '@kobato/distribution': ['@kobato/test'],
  '@kobato/i18n': ['@kobato/test'],
  '@kobato/cache': ['@kobato/i18n', '@kobato/utils', '@kobato/test'],
  '@kobato/settings': ['@kobato/i18n', '@kobato/cache', '@kobato/assets', '@kobato/utils', '@kobato/test'],
  '@kobato/assets': ['@kobato/test'],

  '@kobato/sanitize': ['@kobato/test'],

  '@kobato/api': [...API_SHARED_DEPS, '@kobato/test'],
  '@kobato/db': ['@kobato/settings', '@kobato/inkling', '@kobato/test', '@kobato/utils'],

  '@kobato/server': [
    '@kobato/api',
    '@kobato/db',
    '@kobato/inkling',
    '@kobato/test',
    '@kobato/toolchain',
    '@kobato/harness',
    ...SHARED_SPLIT,
  ],
  '@kobato/ui': ['@kobato/settings', '@kobato/i18n', '@kobato/utils', '@kobato/test'],

  '@kobato/web-admin': [
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
    '@kobato/settings',
    '@kobato/assets',
    '@kobato/sanitize',
  ],

  '@kobato/web-client': [
    '@kobato/ui',
    '@kobato/inkling',
    '@kobato/api',
    '@kobato/utils',
    '@kobato/i18n',
    '@kobato/settings',
    '@kobato/distribution',
    '@kobato/test',
  ],
  '@kobato/web-public': [
    '@kobato/web-client',
    '@kobato/ui',
    '@kobato/inkling',
    '@kobato/api',
    '@kobato/utils',
    '@kobato/i18n',
    '@kobato/auth',
    '@kobato/catalog',
    '@kobato/settings',
    '@kobato/assets',
    '@kobato/sanitize',
    '@kobato/test',
  ],
  '@kobato/test': [],
  '@kobato/toolchain': ['@kobato/distribution', '@kobato/utils'],

  '@kobato/harness': ['@kobato/settings', '@kobato/utils'],

  kobato: INTERNAL_SCOPES,
  '@kobato/email': INTERNAL_SCOPES,
  '@kobato/i18n-tools': INTERNAL_SCOPES,
  '@kobato/pack': INTERNAL_SCOPES,
  '@kobato/trace': INTERNAL_SCOPES,
  '@kobato/browser': INTERNAL_SCOPES,
  '@kobato/inkling-demo': INTERNAL_SCOPES,
}

const SRC_TARGETS: Record<string, readonly string[]> = {
  '@kobato/inkling': [
    '@kobato/inkling',
    '@kobato/ui',
    '@kobato/distribution',
    '@kobato/sanitize',
    '@kobato/assets',
    '@kobato/utils',
  ],
  '@kobato/inkling-demo': ['@kobato/inkling-demo', '@kobato/inkling', '@kobato/ui', '@kobato/web-public'],
  '@kobato/utils': ['@kobato/utils', '@kobato/i18n'],
  '@kobato/auth': ['@kobato/auth', '@kobato/i18n'],
  '@kobato/catalog': ['@kobato/catalog', '@kobato/inkling', '@kobato/settings', '@kobato/i18n', '@kobato/utils'],
  '@kobato/distribution': ['@kobato/distribution'],
  '@kobato/i18n': ['@kobato/i18n'],
  '@kobato/cache': ['@kobato/cache', '@kobato/i18n', '@kobato/utils'],
  '@kobato/settings': ['@kobato/settings', '@kobato/i18n', '@kobato/cache', '@kobato/assets', '@kobato/utils'],
  '@kobato/assets': ['@kobato/assets'],
  '@kobato/sanitize': ['@kobato/sanitize'],

  '@kobato/api': ['@kobato/api', ...API_SHARED_DEPS],
  '@kobato/db': ['@kobato/db', '@kobato/settings', '@kobato/inkling', '@kobato/utils'],
  '@kobato/server': ['@kobato/server', '@kobato/api', '@kobato/db', '@kobato/inkling', ...SHARED_SPLIT],
  '@kobato/ui': ['@kobato/ui', '@kobato/settings', '@kobato/i18n', '@kobato/utils'],

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
    '@kobato/settings',
    '@kobato/assets',
    '@kobato/sanitize',
  ],

  '@kobato/web-client': [
    '@kobato/web-client',
    '@kobato/ui',
    '@kobato/inkling',
    '@kobato/api',
    '@kobato/utils',
    '@kobato/i18n',
    '@kobato/settings',
    '@kobato/distribution',
  ],

  '@kobato/web-public': [
    '@kobato/web-public',
    '@kobato/web-client',
    '@kobato/ui',
    '@kobato/inkling',
    '@kobato/api',
    '@kobato/utils',
    '@kobato/i18n',
    '@kobato/auth',
    '@kobato/catalog',
    '@kobato/settings',
    '@kobato/assets',
    '@kobato/sanitize',
  ],
  '@kobato/test': ['@kobato/test'],
  '@kobato/toolchain': ['@kobato/distribution', '@kobato/utils'],
  kobato: [
    'kobato',
    '@kobato/api',
    '@kobato/auth',
    '@kobato/catalog',
    '@kobato/i18n',
    '@kobato/inkling',
    '@kobato/server',
    '@kobato/settings',
    '@kobato/ui',
    '@kobato/utils',
    '@kobato/web-admin',
    '@kobato/web-client',
    '@kobato/web-public',
  ],
  '@kobato/harness': ['@kobato/harness', '@kobato/settings', '@kobato/utils'],

  '@kobato/pack': INTERNAL_SCOPES,
  '@kobato/trace': INTERNAL_SCOPES,
  '@kobato/browser': INTERNAL_SCOPES,
  '@kobato/email': INTERNAL_SCOPES,
  '@kobato/i18n-tools': INTERNAL_SCOPES,
}

const SRC_IMPORT_EXCEPTIONS: readonly { file: string; specifier: string }[] = []

const RELATIVE_ESCAPE_EXCEPTIONS = new Set([
  'tools/pack/src/sea/server-entry.ts:../../../../apps/kobato/build/server/index.js',

  'tools/pack/src/sea/vfs-capabilities.ts:./lib/greet.mjs',
])

const RELATIVE_IMPORT_FILE_EXCEPTIONS = new Set([
  'apps/kobato/tests/arch/client-bundle.test.ts',
  'packages/inkling/tests/unit/nodes/card-layering-imports.test.ts',
  'packages/inkling/tests/unit/utils/utils-import-guard.test.ts',
  'packages/ui/tests/unit/contract/dark-variant.test.ts',
])

function isAllowedRelativeImport(file: string, specifier: string): boolean {
  if (specifier.startsWith('./+types/')) {
    return true
  }
  return RELATIVE_IMPORT_FILE_EXCEPTIONS.has(file) || RELATIVE_ESCAPE_EXCEPTIONS.has(`${file}:${specifier}`)
}
function collectTsconfigs(dir: string, out: string[]): void {
  if (!existsSync(dir)) {
    return
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue
    }
    const full = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      collectTsconfigs(full, out)
    } else if (/^tsconfig(?:\..+)?\.json$/.test(entry.name)) {
      out.push(full)
    }
  }
}

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

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

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
        if (dep === CONFIG_PACKAGE) {
          continue
        }
        if (dep === pkg.name) {
          offenders.push(`${pkg.dir}/package.json declares itself`)
        } else if (!allowed.includes(dep)) {
          offenders.push(`${pkg.dir}/package.json declares ${dep}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
  it('workspace links match each package’s actual source, test, and config imports', () => {
    const missing: string[] = []
    const unused: string[] = []

    for (const pkg of REPO_PACKAGES) {
      const declared = new Set(declaredInternalDeps(pkg.name))
      const actual = new Set<string>()
      for (const file of sourceFiles(pkg.dir)) {
        for (const specifier of importSpecifiers(readSource(file))) {
          const target = INTERNAL_SCOPES.find((scope) => specifier === scope || specifier.startsWith(`${scope}/`))
          if (target !== undefined) {
            actual.add(target)
          }
        }
      }

      const tsconfig = `${REPO_ROOT}/${pkg.dir}/tsconfig.json`
      if (existsSync(tsconfig) && readFileSync(tsconfig, 'utf8').includes(`${CONFIG_PACKAGE}/`)) {
        actual.add(CONFIG_PACKAGE)
      }

      for (const target of actual) {
        if (target !== pkg.name && !declared.has(target)) {
          missing.push(`${pkg.dir} imports ${target} without declaring it`)
        }
      }
      for (const dep of declared) {
        if (!actual.has(dep)) {
          unused.push(`${pkg.dir}/package.json declares unused ${dep}`)
        }
      }
    }

    expect(missing).toEqual([])
    expect(unused).toEqual([])
  })
  it('src trees import @kobato/* only along the DAG, only as declared targets', () => {
    const offenders: string[] = []
    const exceptionKeys = new Set(SRC_IMPORT_EXCEPTIONS.map((entry) => `${entry.file}:${entry.specifier}`))
    const srcTrees = REPO_PACKAGES.filter((pkg) => existsSync(`${REPO_ROOT}/${pkg.dir}/src`))

    for (const pkg of srcTrees) {
      const allowedTargets = SRC_TARGETS[pkg.name]!
      const declared = new Set([...declaredInternalDeps(pkg.name), pkg.name])
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

  it('the @tests alias appears only inside the app test tree', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('apps', 'packages', 'scripts', 'tools', 'demo')) {
      if (file.startsWith(`${APP_PACKAGE_DIR}/tests/`)) {
        continue
      }
      for (const specifier of importSpecifiers(readSource(file))) {
        if (specifier.startsWith('@tests/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('has exactly one shared import-path table', () => {
    const baseConfigPath = 'tools/tsconfig/tsconfig.base.json'
    const base = JSON.parse(readFileSync(`${REPO_ROOT}/${baseConfigPath}`, 'utf8')) as {
      compilerOptions: { paths?: Record<string, string[]> }
    }
    const paths = base.compilerOptions.paths
    expect(paths, `${baseConfigPath} owns the workspace path table`).toBeDefined()

    const required: Record<string, string[]> = {
      '@/*': ['../../apps/kobato/src/*'],
      '@tests/*': ['../../apps/kobato/tests/*'],
      '@kobato/inkling-demo/*': ['../../apps/inkling-demo/src/*'],
      '@kobato/inkling-internal/*': ['../../packages/inkling/src/*'],
      '@kobato/inkling/tests/*': ['../../packages/inkling/tests/*'],
    }
    for (const [alias, targets] of Object.entries(required)) {
      expect(paths![alias], `${baseConfigPath} must define ${alias}`).toEqual(targets)
    }

    for (const [alias, targets] of Object.entries(paths!)) {
      for (const target of targets) {
        const resolved = posixNormalize(`tools/tsconfig/${target.replace(/\*$/, '')}`)
        expect(existsSync(`${REPO_ROOT}/${resolved}`), `${alias} target must exist: ${target}`).toBe(true)
      }
    }

    const tsconfigs: string[] = []
    collectTsconfigs(REPO_ROOT, tsconfigs)
    const pathOwners = tsconfigs.filter((file) => /"paths"\s*:/.test(readFileSync(file, 'utf8')))
    expect(pathOwners.map((file) => file.slice(REPO_ROOT.length + 1))).toEqual([baseConfigPath])
  })

  it('source and test trees contain no unregistered relative module imports', () => {
    const governedRoots = ['apps/kobato/src', 'apps/kobato/tests', 'apps/inkling-demo', 'packages', 'tools'] as const

    const offenders: string[] = []
    for (const file of sourceFiles(...governedRoots)) {
      for (const specifier of importSpecifiers(readSource(file))) {
        if (specifier.startsWith('.') && !isAllowedRelativeImport(file, specifier)) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the demo alias stays in the playground', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('apps', 'packages', 'tools')) {
      if (file.startsWith('apps/inkling-demo/')) {
        continue
      }
      for (const specifier of importSpecifiers(readSource(file))) {
        if (specifier === '@kobato/inkling-demo' || specifier.startsWith('@kobato/inkling-demo/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('package test aliases stay in their own tree, or reach only cross-package tests/utils helpers', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('apps', 'packages', 'tools')) {
      const importingFromTestTree = file.includes('/tests/')
      for (const specifier of importSpecifiers(readSource(file))) {
        const match = /^@kobato\/([^/]+)\/tests(?:\/(.+))?$/.exec(specifier)
        if (!match) {
          continue
        }
        const pkg = REPO_PACKAGES.find((entry) => entry.name === `@kobato/${match[1]}`)
        if (!pkg) {
          offenders.push(`${file}: ${specifier}`)
          continue
        }
        if (file.startsWith(`${pkg.dir}/tests/`)) {
          continue
        }
        const sharedHelper = match[2] !== undefined && match[2].startsWith('utils/')
        if (!importingFromTestTree || !sharedHelper) {
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

  it('canonical test-helper owners expose their test trees through package exports', () => {
    for (const dir of [
      'packages/shared/settings',
      'packages/shared/i18n',
      'packages/api',
      'packages/server',
      'packages/ui',
      'packages/web/client',
      'packages/web/admin',
      'packages/inkling',
    ]) {
      const manifest = JSON.parse(readFileSync(`${REPO_ROOT}/${dir}/package.json`, 'utf8')) as {
        exports: Record<string, string>
      }
      expect(manifest.exports['./tests/*'], dir).toBe('./tests/*')
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
      '@kobato/inkling',
      '@kobato/test',
      '@kobato/pack',
      '@kobato/trace',
      '@kobato/browser',
      '@kobato/harness',
      '@kobato/email',
      '@kobato/i18n-tools',
    ])
    const offenders: string[] = []
    for (const pkg of REPO_PACKAGES.filter((entry) => rootAnchored.has(entry.name))) {
      for (const file of sourceFiles(`${pkg.dir}/src`)) {
        for (const specifier of importSpecifiers(readSource(file))) {
          if (!specifier.startsWith('.') || specifier.startsWith('./+types/')) {
            continue
          }
          const key = `${file}:${specifier}`
          if (!RELATIVE_ESCAPE_EXCEPTIONS.has(key)) {
            offenders.push(key)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the private inkling alias stays inside the editor package except its white-box host pin', () => {
    const whiteBoxHostPin = 'packages/web/admin/tests/unit/ui/editor/cards/host-cards.test.tsx'
    const offenders: string[] = []
    for (const file of sourceFiles('apps', 'packages', 'tools')) {
      if (file.startsWith('packages/inkling/') || file === whiteBoxHostPin) {
        continue
      }
      for (const specifier of importSpecifiers(readSource(file))) {
        if (specifier === '@kobato/inkling-internal' || specifier.startsWith('@kobato/inkling-internal/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('inkling is reached only through its barrel, headless, styles entries, or test-tree helper imports', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('apps', 'packages', 'scripts', 'tools')) {
      if (file.startsWith('apps/inkling-demo/') || file.startsWith('packages/inkling/')) {
        continue
      }
      for (const specifier of importSpecifiers(readSource(file))) {
        if (!specifier.startsWith('@kobato/inkling/')) {
          continue
        }
        if (specifier === '@kobato/inkling/types' && file.endsWith('.d.ts')) {
          continue
        }
        if (
          specifier !== '@kobato/inkling/headless' &&
          !specifier.startsWith('@kobato/inkling/headless/') &&
          specifier !== '@kobato/inkling/host-cards' &&
          !specifier.startsWith('@kobato/inkling/styles/')
        ) {
          if (specifier.startsWith('@kobato/inkling/tests/utils/') && file.includes('/tests/')) {
            continue
          }
          offenders.push(`${file}: ${specifier} (deep import past the entry surfaces)`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('server never reaches the React inkling barrel', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('packages/server/src')) {
      for (const specifier of importSpecifiers(readSource(file))) {
        if (specifier === '@kobato/inkling') {
          offenders.push(`${file}: ${specifier} (server must use @kobato/inkling/headless)`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
