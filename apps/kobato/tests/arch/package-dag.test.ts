import { REPO_PACKAGES } from '@tests/arch/workspace-packages'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname as posixDirname, normalize as posixNormalize } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const CONFIG_PACKAGE = '@kobato/tsconfig'
const PATH_TABLE = 'tools/tsconfig/tsconfig.base.json'

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.worktrees',
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

const SHARED_SPLIT = ['@kobato/base', '@kobato/catalog', '@kobato/i18n', '@kobato/settings'] as const

const API_SHARED_DEPS = [
  '@kobato/base',
  '@kobato/catalog',
  '@kobato/settings',
  '@kobato/i18n',
  '@kobato/inkling',
] as const

const BASE_TREES = [
  ['src', 'shared/base/src'],
  ['tests', 'shared/base/tests'],
] as const
const BASE_DIRECTORY_TARGETS: Record<string, readonly string[]> = {
  auth: ['@kobato/i18n'],
  assets: [],
  distribution: [],
  sanitize: [],
  utils: ['@kobato/i18n'],
}

const INTERNAL_SCOPES = REPO_PACKAGES.map((pkg) => pkg.name)

const PACK_INTERNAL_SCOPES = INTERNAL_SCOPES.filter((scope) => scope !== 'sayaka')

const ALLOWED_DECLARED_INTERNAL_DEPS: Record<string, readonly string[]> = {
  '@kobato/tsconfig': [],
  '@kobato/inkling': ['@kobato/base', '@kobato/i18n', '@kobato/ui', '@kobato/test'],

  '@kobato/base': ['@kobato/i18n', '@kobato/test'],
  '@kobato/catalog': ['@kobato/inkling', '@kobato/settings', '@kobato/i18n', '@kobato/base', '@kobato/test'],
  '@kobato/i18n': ['@kobato/test'],
  '@kobato/settings': ['@kobato/i18n', '@kobato/base', '@kobato/test'],

  '@kobato/api': [...API_SHARED_DEPS, '@kobato/test'],
  '@kobato/db': ['@kobato/settings', '@kobato/inkling', '@kobato/test', '@kobato/base'],

  '@kobato/server': ['@kobato/api', '@kobato/db', '@kobato/inkling', '@kobato/test', ...SHARED_SPLIT],
  '@kobato/ui': ['@kobato/base', '@kobato/settings', '@kobato/i18n', '@kobato/test'],

  '@kobato/web-kit': ['@kobato/ui', '@kobato/api', '@kobato/base', '@kobato/i18n', '@kobato/settings', '@kobato/test'],
  '@kobato/test': [],
  '@kobato/instance': ['@kobato/settings', '@kobato/base', '@kobato/test'],

  kobato: INTERNAL_SCOPES,
  sayaka: [
    '@kobato/api',
    '@kobato/base',
    '@kobato/catalog',
    '@kobato/i18n',
    '@kobato/inkling',
    '@kobato/instance',
    '@kobato/pack',
    '@kobato/settings',
    '@kobato/test',
    '@kobato/ui',
    '@kobato/web-kit',
  ],
  '@kobato/pack': PACK_INTERNAL_SCOPES,
  '@kobato/trace': INTERNAL_SCOPES,
  '@kobato/inkling-demo': INTERNAL_SCOPES,
  '@kobato/font-split': ['@kobato/test', '@kobato/base'],
}

const SRC_TARGETS: Record<string, readonly string[]> = {
  '@kobato/inkling': ['@kobato/inkling', '@kobato/ui', '@kobato/i18n', '@kobato/base'],
  '@kobato/inkling-demo': ['@kobato/inkling-demo', '@kobato/inkling', '@kobato/ui'],
  '@kobato/base': ['@kobato/base', '@kobato/i18n'],
  '@kobato/catalog': ['@kobato/catalog', '@kobato/inkling', '@kobato/settings', '@kobato/i18n', '@kobato/base'],
  '@kobato/i18n': ['@kobato/i18n'],
  '@kobato/settings': ['@kobato/settings', '@kobato/i18n', '@kobato/base'],

  '@kobato/api': ['@kobato/api', ...API_SHARED_DEPS],
  '@kobato/db': ['@kobato/db', '@kobato/settings', '@kobato/inkling', '@kobato/base'],
  '@kobato/server': ['@kobato/server', '@kobato/api', '@kobato/db', '@kobato/inkling', ...SHARED_SPLIT],
  '@kobato/ui': ['@kobato/ui', '@kobato/base', '@kobato/settings', '@kobato/i18n'],

  '@kobato/web-kit': [
    '@kobato/web-kit',
    '@kobato/ui',
    '@kobato/api',
    '@kobato/base',
    '@kobato/i18n',
    '@kobato/settings',
  ],
  '@kobato/test': ['@kobato/test'],
  '@kobato/instance': ['@kobato/instance', '@kobato/settings', '@kobato/base', '@kobato/test'],
  kobato: [
    'kobato',
    '@kobato/api',
    '@kobato/base',
    '@kobato/catalog',
    '@kobato/i18n',
    '@kobato/inkling',
    '@kobato/server',
    '@kobato/settings',
    '@kobato/ui',
    '@kobato/web-kit',
  ],
  sayaka: [
    'sayaka',
    '@kobato/api',
    '@kobato/base',
    '@kobato/catalog',
    '@kobato/i18n',
    '@kobato/inkling',
    '@kobato/settings',
    '@kobato/ui',
    '@kobato/web-kit',
  ],

  '@kobato/pack': PACK_INTERNAL_SCOPES,
  '@kobato/trace': INTERNAL_SCOPES,
  '@kobato/font-split': ['@kobato/font-split'],
}

const SRC_IMPORT_EXCEPTIONS: readonly { file: string; specifier: string }[] = []

const RELATIVE_ESCAPE_EXCEPTIONS = new Set([
  'tools/pack/src/sea/server-entry.ts:../../../../apps/kobato/build/server/index.js',
  'tools/pack/src/sea/sayaka-entry.ts:./sayaka-sea-cli',
  'tools/pack/src/sea/sayaka-entry.ts:../../../../apps/sayaka/build/server/index.js',

  'tools/pack/src/sea/vfs-capabilities.ts:./lib/greet.mjs',
])

const RELATIVE_IMPORT_FILE_EXCEPTIONS = new Set([
  'apps/kobato/tests/arch/client-bundle.test.ts',
  'apps/kobato/tests/arch/module-cycles.test.ts',
  'packages/inkling/tests/unit/nodes/card-layering-imports.test.ts',
  'packages/inkling/tests/unit/utils/utils-import-guard.test.ts',
  'packages/web/ui/tests/unit/contract/dark-variant.test.ts',
])

function resolveInternalScope(specifier: string): string | undefined {
  const scoped = INTERNAL_SCOPES.find((scope) => specifier === scope || specifier.startsWith(`${scope}/`))
  if (scoped !== undefined) {
    return scoped
  }
  return specifier.startsWith('@sayaka/') ? 'sayaka' : undefined
}

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

function stylesheetFiles(...roots: string[]): string[] {
  const files: string[] = []
  const visit = (dir: string): void => {
    if (!existsSync(dir)) {
      return
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(entry.name)) {
        continue
      }
      const full = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        visit(full)
      } else if (entry.isFile() && entry.name.endsWith('.css')) {
        files.push(full)
      }
    }
  }
  for (const root of roots) {
    visit(root)
  }
  return files.sort()
}

function cssImportSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  for (const match of source.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
    specifiers.push(match[1]!)
  }
  return specifiers
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

const DEPENDENCY_KINDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const

type DependencyKinds = Record<(typeof DEPENDENCY_KINDS)[number], Record<string, string> | undefined>

function readManifest(pkgName: string): DependencyKinds {
  const dir = REPO_PACKAGES.find((pkg) => pkg.name === pkgName)!.dir
  return JSON.parse(readFileSync(`${REPO_ROOT}/${dir}/package.json`, 'utf8')) as DependencyKinds
}

function declaredInternalDeps(pkgName: string): string[] {
  const manifest = readManifest(pkgName)
  const declared = new Set<string>()
  for (const kind of DEPENDENCY_KINDS) {
    for (const dep of Object.keys(manifest[kind] ?? {})) {
      declared.add(dep)
    }
  }
  return [...declared].filter((dep) => dep.startsWith('@kobato/') || INTERNAL_SCOPES.includes(dep))
}

function workspaceEdges(pkgName: string): string[] {
  const edges = new Set<string>()
  for (const kind of DEPENDENCY_KINDS) {
    for (const dep of Object.keys(readManifest(pkgName)[kind] ?? {})) {
      if (dep !== pkgName && INTERNAL_SCOPES.includes(dep)) {
        edges.add(dep)
      }
    }
  }
  return [...edges].sort()
}

const DRIVER_FILES = sourceFiles('tools/instance/src').filter((file) => !file.startsWith('tools/instance/src/browser/'))
const DRIVER_BROWSER_SPECIFIER = /^@kobato\/instance\/browser\//

function workspaceTargetsOf(file: string): Array<readonly [string, string | undefined]> {
  return importSpecifiers(readSource(file)).map((specifier) => [
    specifier,
    INTERNAL_SCOPES.find((scope) => specifier === scope || specifier.startsWith(`${scope}/`)),
  ])
}

function canonicalCycle(loop: string[]): string[] {
  const start = loop.indexOf([...loop].sort()[0]!)
  const rotated = loop.slice(start).concat(loop.slice(0, start))
  rotated.push(rotated[0]!)
  return rotated
}

function workspaceDependencyCycles(): string[][] {
  const state = new Map<string, 'visiting' | 'done'>()
  const cycles: string[][] = []
  const visit = (pkg: string, path: string[]): void => {
    const current = state.get(pkg)
    if (current === 'visiting') {
      cycles.push(canonicalCycle(path.slice(path.indexOf(pkg))))
      return
    }
    if (current === 'done') {
      return
    }
    state.set(pkg, 'visiting')
    const deeper = path.concat(pkg)
    for (const dep of workspaceEdges(pkg)) {
      visit(dep, deeper)
    }
    state.set(pkg, 'done')
  }
  for (const pkg of REPO_PACKAGES) {
    visit(pkg.name, [])
  }
  return cycles
}

describe('package DAG', () => {
  it('the workspace dependency graph has no cycle of any kind', () => {
    const cycles = workspaceDependencyCycles()
    expect(
      cycles,
      `workspace dependency cycles found (${DEPENDENCY_KINDS.join(', ')} edges together) — a cycle is always solvable; ` +
        `move the shared piece into a package both sides can depend on:\n${cycles.map((cycle) => cycle.join(' -> ')).join('\n')}`,
    ).toEqual([])
  })

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
          const target = resolveInternalScope(specifier)
          if (target !== undefined) {
            actual.add(target)
          }
        }
      }
      for (const file of stylesheetFiles(pkg.dir)) {
        for (const specifier of cssImportSpecifiers(readFileSync(`${REPO_ROOT}/${file}`, 'utf8'))) {
          const target = resolveInternalScope(specifier)
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

  it('the directories inside base import workspace packages only along the pinned direction', () => {
    const offenders: string[] = []
    for (const [tree, root] of BASE_TREES) {
      const seen = new Set<string>()
      for (const file of sourceFiles(root)) {
        const directory = file.slice(root.length + 1).split('/')[0]!
        seen.add(directory)
        const allowed = BASE_DIRECTORY_TARGETS[directory]
        if (allowed === undefined) {
          offenders.push(`${file}: not under a pinned base directory`)
          continue
        }
        for (const specifier of importSpecifiers(readSource(file))) {
          if (specifier === `@kobato/base/${directory}` || specifier.startsWith(`@kobato/base/${directory}/`)) {
            continue
          }
          const target = INTERNAL_SCOPES.find((scope) => specifier === scope || specifier.startsWith(`${scope}/`))
          if (target !== undefined && !allowed.includes(target)) {
            offenders.push(
              `${file}: ${specifier} (base/${directory} may import only ${allowed.length > 0 ? allowed.join(', ') : 'its own modules'})`,
            )
          }
        }
      }
      expect([...seen].sort(), `every pinned base directory has a ${tree} tree`).toEqual(
        Object.keys(BASE_DIRECTORY_TARGETS).sort(),
      )
    }
    expect(
      offenders,
      'base holds five directories that keep their names: auth and utils reach only i18n, assets, distribution, and ' +
        'sanitize reach no workspace package, and none of them, in src or tests, reaches another directory of base, ' +
        'settings, catalog, the api, or anything above the floor',
    ).toEqual([])
  })

  it('the instance driver and process primitives stay product-light and off the build pipeline', () => {
    const offenders: string[] = []
    for (const file of DRIVER_FILES) {
      for (const [specifier, target] of workspaceTargetsOf(file)) {
        if (target === undefined || target === '@kobato/settings') {
          continue
        }
        if (target === '@kobato/base' && /^@kobato\/base\/utils(?:\/|$)/.test(specifier)) {
          continue
        }
        if (target === '@kobato/instance' && !DRIVER_BROWSER_SPECIFIER.test(specifier)) {
          continue
        }
        if (target === '@kobato/test' && specifier === '@kobato/test/repo-root') {
          continue
        }
        offenders.push(`${file}: ${specifier}`)
      }
    }
    expect(
      offenders,
      'tools/instance/src/*.ts (the lifecycle half and client/ with process.ts) drive running processes: they import only ' +
        '@kobato/settings, @kobato/base/utils, @kobato/test/repo-root, and their own modules',
    ).toEqual([])
  })

  it('the instance driver never reaches the browser support, and the browser support reaches only the driver client', () => {
    const driverOffenders: string[] = []
    for (const file of DRIVER_FILES) {
      for (const specifier of workspaceTargetsOf(file).map(([specifier]) => specifier)) {
        if (DRIVER_BROWSER_SPECIFIER.test(specifier)) {
          driverOffenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(
      driverOffenders,
      'the driver never imports the Playwright journey support under @kobato/instance/browser',
    ).toEqual([])

    const browserOffenders: string[] = []
    for (const file of sourceFiles('tools/instance/src/browser')) {
      for (const [specifier, target] of workspaceTargetsOf(file)) {
        const driverClient = /^@kobato\/instance\/client\/(?:browser-env|http|rpc)$/
        if (
          target === undefined ||
          (target === '@kobato/instance' &&
            (driverClient.test(specifier) || specifier.startsWith('@kobato/instance/browser/')))
        ) {
          continue
        }
        if (target === '@kobato/base' && /^@kobato\/base\/utils(?:\/|$)/.test(specifier)) {
          continue
        }
        browserOffenders.push(`${file}: ${specifier}`)
      }
    }
    expect(
      browserOffenders,
      'tools/instance/src/browser/ runs under Playwright: it imports @playwright/test, @kobato/base/utils, the driver client ' +
        '(@kobato/instance/client/*), and its own modules',
    ).toEqual([])
  })

  it('pack → instance → test is the only direction between the three tooling packages', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('tools/test', 'tools/instance')) {
      for (const specifier of importSpecifiers(readSource(file))) {
        if (specifier === '@kobato/pack' || specifier.startsWith('@kobato/pack/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    for (const file of sourceFiles('tools/test')) {
      for (const specifier of importSpecifiers(readSource(file))) {
        if (specifier === '@kobato/instance' || specifier.startsWith('@kobato/instance/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(
      offenders,
      'nothing under tools/test or tools/instance imports @kobato/pack, and nothing under tools/test imports @kobato/instance',
    ).toEqual([])
  })

  it('@kobato/test is product-free', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('tools/test')) {
      for (const [specifier, target] of workspaceTargetsOf(file)) {
        if (target !== undefined && target !== '@kobato/test') {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(
      offenders,
      'fixtures, doubles, setups, and the project table import no @kobato/* product package — the live-instance driver ' +
        'and the browser support live in @kobato/instance',
    ).toEqual([])
  })

  it('no source tree imports the font-split addon package', () => {
    const offenders: string[] = []
    for (const pkg of REPO_PACKAGES) {
      if (pkg.name === '@kobato/font-split') {
        continue
      }
      for (const file of sourceFiles(`${pkg.dir}/src`)) {
        for (const specifier of importSpecifiers(readSource(file))) {
          if (specifier === '@kobato/font-split' || specifier.startsWith('@kobato/font-split/')) {
            offenders.push(`${file}: ${specifier}`)
          }
        }
      }
    }
    expect(
      offenders,
      'the addon is reached only through nativeRequire(FONT_SPLIT_ADDON_SPEC), never an import',
    ).toEqual([])
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
    for (const file of sourceFiles('apps', 'packages', 'shared', 'tools', 'demo')) {
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

  it('the @sayaka/ app alias appears only inside the sayaka package', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('apps', 'packages', 'shared', 'tools', 'demo')) {
      if (file.startsWith('apps/sayaka/')) {
        continue
      }
      for (const specifier of importSpecifiers(readSource(file))) {
        if (specifier.startsWith('@sayaka/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the @tests alias appears only inside the app test tree', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('apps', 'packages', 'shared', 'tools', 'demo')) {
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
    const base = JSON.parse(readFileSync(`${REPO_ROOT}/${PATH_TABLE}`, 'utf8')) as {
      compilerOptions: { paths?: Record<string, string[]> }
    }
    const paths = base.compilerOptions.paths
    expect(paths, `${PATH_TABLE} owns the workspace path table`).toBeDefined()

    const required: Record<string, string[]> = {
      '@/*': ['../../apps/kobato/src/*'],
      '@tests/*': ['../../apps/kobato/tests/*'],
      '@sayaka/*': ['../../apps/sayaka/src/*'],
      '@sayaka/tests/*': ['../../apps/sayaka/tests/*'],
      '@kobato/inkling-demo/*': ['../../apps/inkling-demo/src/*'],
      '@kobato/inkling-internal/*': ['../../packages/inkling/src/*'],
      '@kobato/inkling/tests/*': ['../../packages/inkling/tests/*'],
    }
    for (const [alias, targets] of Object.entries(required)) {
      expect(paths![alias], `${PATH_TABLE} must define ${alias}`).toEqual(targets)
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
    expect(pathOwners.map((file) => file.slice(REPO_ROOT.length + 1))).toEqual([PATH_TABLE])
  })

  it('every per-file inkling entry resolves to the same file as the private alias', () => {
    const paths = (
      JSON.parse(readFileSync(`${REPO_ROOT}/${PATH_TABLE}`, 'utf8')) as {
        compilerOptions: { paths: Record<string, string[]> }
      }
    ).compilerOptions.paths
    const privateRow = paths['@kobato/inkling-internal/*']
    expect(privateRow, 'the private inkling alias is one wildcard row over packages/inkling/src').toHaveLength(1)

    const offenders: string[] = []
    const checked: string[] = []
    for (const [alias, targets] of Object.entries(paths)) {
      const entry = /^@kobato\/inkling\/([^/]+)\/\*$/.exec(alias)
      if (entry === null || targets.length !== 1 || !targets[0]!.startsWith('../../packages/inkling/src/')) {
        continue
      }
      checked.push(alias)
      const throughPrivateAlias = privateRow[0]!.replace('*', `${entry[1]}/*`)
      if (targets[0] !== throughPrivateAlias) {
        offenders.push(`${alias} -> ${targets[0]} (the private alias resolves to ${throughPrivateAlias})`)
      }
    }
    expect(checked, 'the comment entry row must be among the checked per-file entries').toContain(
      '@kobato/inkling/comment/*',
    )
    expect(
      offenders,
      '@kobato/inkling/<entry>/* and @kobato/inkling-internal/<entry>/* must resolve to the same file: tests mock a ' +
        'module through the public specifier while production imports it through the private one, and that interception ' +
        'only works when both resolve to one file id',
    ).toEqual([])
  })

  it('source and test trees contain no unregistered relative module imports', () => {
    const governedRoots = [
      'apps/kobato/src',
      'apps/kobato/tests',
      'apps/sayaka/src',
      'apps/sayaka/tests',
      'apps/inkling-demo',
      'packages',
      'tools',
    ] as const

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
    for (const file of sourceFiles('apps', 'packages', 'shared', 'tools')) {
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
    for (const file of sourceFiles('apps', 'packages', 'shared', 'tools')) {
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
    for (const dir of ['packages/db', 'packages/web/ui']) {
      const manifest = JSON.parse(readFileSync(`${REPO_ROOT}/${dir}/package.json`, 'utf8')) as {
        exports: Record<string, string>
      }
      expect(manifest.exports, `${dir} must not expose every source file`).not.toHaveProperty('./*')
    }
  })

  it('canonical test-helper owners expose their test trees through package exports', () => {
    for (const dir of [
      'shared/settings',
      'shared/i18n',
      'packages/api',
      'packages/server',
      'packages/web/ui',
      'packages/web/kit',
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
      'sayaka',
      ...SHARED_SPLIT,
      '@kobato/api',
      '@kobato/db',
      '@kobato/server',
      '@kobato/ui',
      '@kobato/web-kit',
      '@kobato/inkling',
      '@kobato/test',
      '@kobato/pack',
      '@kobato/trace',
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
    const whiteBoxHostPin = 'apps/kobato/tests/unit/ui/editor/cards/host-cards.test.tsx'
    const offenders: string[] = []
    for (const file of sourceFiles('apps', 'packages', 'shared', 'tools')) {
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

  it('inkling is reached only through its barrel, headless, comment, styles entries, or test-tree helper imports', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('apps', 'packages', 'shared', 'tools')) {
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
          !specifier.startsWith('@kobato/inkling/comment/') &&
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
