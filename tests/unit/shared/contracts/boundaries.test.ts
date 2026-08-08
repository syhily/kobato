import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname as posixDirname, normalize as posixNormalize } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

// Node-native walker — CI runners have no `rg`.
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

function walk(root: string, out: string[]): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue
    }
    const full = `${root}/${entry.name}`
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
}

function files(...args: string[]): string[] {
  const paths: string[] = []
  const extensions: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-g') {
      const glob = args[++i]
      if (glob !== undefined && glob.startsWith('*.')) {
        extensions.push(glob.slice(1))
      }
      continue
    }
    paths.push(args[i])
  }
  if (paths.length === 0) {
    return []
  }
  const existing = paths.filter((path) => existsSync(path))
  if (existing.length === 0) {
    return []
  }

  const collected: string[] = []
  for (const path of existing) {
    if (statSync(path).isDirectory()) {
      walk(path, collected)
    } else {
      collected.push(path)
    }
  }
  if (extensions.length === 0) {
    return collected
  }
  return collected.filter((file) => {
    const dot = file.lastIndexOf('.')
    return dot !== -1 && extensions.includes(file.slice(dot))
  })
}

// Comments may mention import paths or re-export syntax and must not trip the checks.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// Whole-file match: a per-line scan misses multiline imports whose `from '…'` clause sits alone.
function importSpecifiers(source: string): string[] {
  const specifierRe = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
  return [...source.matchAll(specifierRe)].map((match) => match[1])
}

// VALUE imports only: `import type` is erased at compile time and must not
// trip a runtime-coupling ban.
function valueImportSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const staticRe = /\bimport\s+([^'";]*?)\s+from\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(staticRe)) {
    if (!/^\s*type[\s{]/.test(match[1])) {
      specifiers.push(match[2])
    }
  }
  const bareRe = /\bimport\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(bareRe)) {
    specifiers.push(match[1])
  }
  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(dynamicRe)) {
    specifiers.push(match[1])
  }
  return specifiers
}

// Checks compare both the `@/…` alias and the resolved `src/…` path so a
// `../` escape cannot bypass an alias-only ban.
function resolveSpecifier(file: string, specifier: string): string {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return posixNormalize(`${posixDirname(file)}/${specifier}`)
  }
  return specifier
}

// Exported bindings that came from an import are facades; locally-declared
// exports are legal.
function importedBindings(source: string): Set<string> {
  const names = new Set<string>()
  const importRe = /\bimport\s+([^'";]*?)\s+from\s*['"][^'"]+['"]/g
  for (const match of source.matchAll(importRe)) {
    let clause = match[1].trim()
    if (clause.startsWith('type ')) {
      clause = clause.slice(5).trim()
    }
    const brace = /\{([^{}]*)\}/.exec(clause)
    const head = brace ? clause.slice(0, brace.index) : clause
    for (const part of head.split(',')) {
      const name = part.trim().replace(/^type\s+/, '')
      if (name === '') {
        continue
      }
      names.add(name.startsWith('* as ') ? name.slice(5).trim() : name)
    }
    for (const part of (brace?.[1] ?? '').split(',')) {
      const name = part.trim().replace(/^type\s+/, '')
      if (name === '') {
        continue
      }
      const alias = /\bas\s+([\w$]+)\s*$/.exec(name)
      names.add(alias?.[1] ?? name)
    }
  }
  return names
}

describe('contract: module and bundle boundaries', () => {
  it('keeps value imports from @/server out of shared modules', () => {
    // Value imports would drag the server graph into the shared (server +
    // browser) bundle; type imports are erased and stay legal.
    const offenders: string[] = []
    for (const file of files('src/shared', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of valueImportSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if (target.startsWith('@/server/') || target.startsWith('src/server/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps re-export facades out of src (every import points at the owning module)', () => {
    // Import-then-export facades are banned; locally-declared exports stay
    // legal. Allowlisted: the layout routes re-export AdminErrorFallback as
    // ErrorBoundary (React Router requires that exact export name).
    const allowlist = new Set(
      ['src/routes/admin/layout.tsx', 'src/routes/auth/layout.tsx', 'src/routes/editor/layout.tsx'].map(
        (file) => `${file}: export { AdminErrorFallback as ErrorBoundary }`,
      ),
    )

    const offenders: string[] = []
    const directRe = /\bexport\s+(?:type\s+)?(?:\*\s+as\s+[\w$]+|\*|\{[^{}]*\})\s*from\s*['"][^'"]+['"]/g
    const plainRe = /\bexport\s+(?:type\s+)?\{([^{}]*)\}(?!\s*from)/g
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx')) {
      const source = stripComments(readFileSync(file, 'utf8'))
      for (const match of source.matchAll(directRe)) {
        offenders.push(`${file}: ${match[0].replace(/\s+/g, ' ')}`)
      }
      const imported = importedBindings(source)
      for (const match of source.matchAll(plainRe)) {
        const reexported = match[1]
          .split(',')
          .map((part) => part.trim().replace(/^type\s+/, ''))
          .filter((part) => part !== '')
          .map((part) => (/\bas\s/.test(part) ? part.slice(0, part.indexOf(' as ')).trim() : part))
        if (reexported.some((name) => imported.has(name))) {
          offenders.push(`${file}: ${match[0].replace(/\s+/g, ' ')}`)
        }
      }
    }

    expect(offenders.filter((offender) => !allowlist.has(offender))).toEqual([])
  })

  it('keeps barrel index modules out of src', () => {
    // Fires only when stripping every `export … from` leaves nothing but
    // whitespace — real index.tsx routes stay legal.
    const exportFromRe = /\bexport\s+(?:type\s+)?(?:\*\s+as\s+[\w$]+|\*|\{[^{}]*\})\s*from\s*['"][^'"]+['"]/g
    const offenders = files('src', '-g', '*.ts', '-g', '*.tsx')
      .filter((file) => /(^|\/)index\.tsx?$/.test(file))
      .filter((file) => {
        const source = stripComments(readFileSync(file, 'utf8'))
        return /\bexport\b/.test(source) && source.replace(exportFromRe, '').trim() === ''
      })

    expect(offenders).toEqual([])
  })

  it('keeps the server layer graph one-way (infra → domains → render → http)', () => {
    // One-way layering: infra → domains → render → http; type imports count too.
    const rules: Array<{ from: string; banned: string[] }> = [
      { from: 'src/server/infra/', banned: ['@/server/domains/', '@/server/http/', '@/server/render/'] },
      { from: 'src/server/domains/', banned: ['@/server/http/', '@/server/render/'] },
      { from: 'src/server/render/', banned: ['@/server/http/'] },
    ]
    const offenders: string[] = []
    for (const file of files('src/server', '-g', '*.ts', '-g', '*.tsx')) {
      const rule = rules.find((entry) => file.startsWith(entry.from))
      if (rule === undefined) {
        continue
      }
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if (rule.banned.some((banned) => target.startsWith(banned) || target.startsWith(`src/${banned.slice(2)}`))) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the Postgres-era drivers and async transactions out of src', () => {
    // The retired pg stack (`pg`, `pg-copy-streams`, `drizzle-orm/node-postgres`)
    // must never re-enter src/. node:sqlite transactions are sync — a
    // `transaction(async` callback commits before its awaited work runs.
    const BANNED_DRIVERS = ['pg', 'pg-copy-streams', 'drizzle-orm/node-postgres']
    const offenders: string[] = []
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx')) {
      const source = stripComments(readFileSync(file, 'utf8'))
      for (const specifier of importSpecifiers(source)) {
        if (BANNED_DRIVERS.some((banned) => specifier === banned || specifier.startsWith(`${banned}/`))) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
      if (/\.transaction\(\s*async/.test(source)) {
        offenders.push(`${file}: .transaction(async …) — node:sqlite transactions are sync`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the cross-domain import graph acyclic', () => {
    // The domain graph must stay a DAG; cross-domain values flow through
    // caller-wired injection. Relative escapes and type imports count too.
    const domainsRoot = 'src/server/domains'
    const domainOf = (path: string): string | null => {
      if (!path.startsWith(`${domainsRoot}/`)) {
        return null
      }
      const rest = path.slice(domainsRoot.length + 1)
      const slash = rest.indexOf('/')
      return slash === -1 ? null : rest.slice(0, slash)
    }

    const nodes = new Set<string>()
    for (const entry of readdirSync(domainsRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        nodes.add(entry.name)
      }
    }
    const adjacency = new Map<string, Set<string>>()
    for (const file of files(domainsRoot, '-g', '*.ts', '-g', '*.tsx')) {
      const from = domainOf(file)
      if (from === null) {
        continue
      }
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        let target: string | null = null
        if (specifier.startsWith('@/server/domains/')) {
          target = `src/${specifier.slice(2)}`
        } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
          target = posixNormalize(`${posixDirname(file)}/${specifier}`)
        }
        if (target === null) {
          continue
        }
        const to = domainOf(target)
        if (to === null || to === from) {
          continue
        }
        nodes.add(from)
        nodes.add(to)
        let targets = adjacency.get(from)
        if (targets === undefined) {
          targets = new Set()
          adjacency.set(from, targets)
        }
        targets.add(to)
      }
    }

    // Three-color DFS; a failure reports the cycle path, not a bare boolean.
    const cycle: string[] = []
    const state = new Map<string, 'visiting' | 'done'>()
    const stack: string[] = []
    const visit = (node: string): boolean => {
      state.set(node, 'visiting')
      stack.push(node)
      for (const next of [...(adjacency.get(node) ?? [])].sort()) {
        if (state.get(next) === 'done') {
          continue
        }
        if (state.get(next) === 'visiting') {
          cycle.push(...stack.slice(stack.indexOf(next)), next)
          return true
        }
        if (visit(next)) {
          return true
        }
      }
      stack.pop()
      state.set(node, 'done')
      return false
    }
    for (const node of [...nodes].sort()) {
      if (!state.has(node) && visit(node)) {
        break
      }
    }

    expect(cycle).toEqual([])
  })

  it('keeps domains below the composition root', () => {
    // `bootstrap/` is the composition root — domains must not import back
    // into it (import cycle risk). Relative escapes and type imports count.
    const offenders: string[] = []
    for (const file of files('src/server/domains', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        if (specifier.startsWith('@/server/bootstrap/')) {
          offenders.push(`${file}: ${specifier}`)
        } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
          const target = posixNormalize(`${posixDirname(file)}/${specifier}`)
          if (target.startsWith('src/server/bootstrap/')) {
            offenders.push(`${file}: ${specifier}`)
          }
        }
      }
    }
    expect(offenders.sort()).toEqual([])
  })

  it('keeps domain repos private to their owning domain', () => {
    // `repos/**` (or a root `repo.ts`) is a domain's private persistence
    // layer; cross-domain capabilities must be promoted to the domain
    // surface instead. Importers inside the owning domain stay legal.
    const domainsRoot = 'src/server/domains'
    const reposOwner = (path: string): string | null => {
      if (!path.startsWith(`${domainsRoot}/`)) {
        return null
      }
      const rest = path.slice(domainsRoot.length + 1)
      const slash = rest.indexOf('/')
      if (slash === -1) {
        return null
      }
      const inner = rest.slice(slash + 1)
      if (inner === 'repo.ts' || inner === 'repos' || inner.startsWith('repos/')) {
        return rest.slice(0, slash)
      }
      return null
    }

    const offenders: string[] = []
    for (const file of files('src/server', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        let target: string | null = null
        if (specifier.startsWith('@/server/domains/')) {
          target = `src/${specifier.slice(2)}`
        } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
          target = posixNormalize(`${posixDirname(file)}/${specifier}`)
        }
        if (target === null) {
          continue
        }
        const owner = reposOwner(target)
        if (owner === null || file.startsWith(`${domainsRoot}/${owner}/`)) {
          continue
        }
        offenders.push(`${file}: ${specifier}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps base-vocabulary root files from coexisting with their subdirectory', () => {
    // One legal home per vocabulary: a root file (`repo.ts`) must not
    // coexist with its subdirectory (`repos/`).
    const pairs = [
      ['schema.ts', 'schemas'],
      ['repo.ts', 'repos'],
      ['service.ts', 'services'],
      ['projection.ts', 'projections'],
      ['cache.ts', 'caches'],
    ] as const
    const offenders: string[] = []
    for (const entry of readdirSync('src/server/domains', { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }
      const domainRoot = `src/server/domains/${entry.name}`
      for (const [rootFile, subdir] of pairs) {
        if (existsSync(`${domainRoot}/${rootFile}`) && existsSync(`${domainRoot}/${subdir}`)) {
          offenders.push(`${entry.name}: ${rootFile} coexists with ${subdir}/`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps routes on domain surfaces: no infra/db/operations imports under src/routes', () => {
    // Routes must not reach into `infra/db/operations` — business data
    // access belongs behind a domain surface or an http/loaders assembly.
    // Non-data infra (rate limiter, `infra/http/status`) stays legal.
    const offenders: string[] = []
    for (const file of files('src/routes', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target =
          specifier.startsWith('./') || specifier.startsWith('../')
            ? posixNormalize(`${posixDirname(file)}/${specifier}`)
            : specifier
        if (target.startsWith('@/server/infra/db/operations') || target.startsWith('src/server/infra/db/operations')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the public render path on the content API: routes/public + root stay inside the server-import whitelist', () => {
    // Public data loads go through the in-process `ssr-caller`; the
    // whitelist is the HTTP orchestration line only.
    const allowed = (file: string, target: string): boolean => {
      const prefixes = ['@/server/http/ssr-caller', '@/server/http/loaders/route-exports', '@/server/infra/http/']
      if (file === 'src/root.tsx') {
        prefixes.push('@/server/render/warmup/')
      }
      return prefixes.some((prefix) => target.startsWith(prefix) || target.startsWith(`src/${prefix.slice(2)}`))
    }
    const offenders: string[] = []
    for (const file of [...files('src/routes/public', '-g', '*.ts', '-g', '*.tsx'), 'src/root.tsx']) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if ((target.startsWith('@/server/') || target.startsWith('src/server/')) && !allowed(file, target)) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the admin/editor SSR data path on the API: routes/admin + routes/editor stay inside the server-import whitelist', () => {
    // Admin/editor data loads go through the in-process `ssr-caller`; the
    // whitelist is gating + HTTP orchestration only.
    const allowed = (target: string): boolean => {
      const prefixes = [
        '@/server/http/ssr-caller',
        '@/server/http/request-context',
        '@/server/domains/auth/rbac',
        '@/server/infra/http/',
      ]
      return prefixes.some((prefix) => target.startsWith(prefix) || target.startsWith(`src/${prefix.slice(2)}`))
    }
    const offenders: string[] = []
    for (const file of [
      ...files('src/routes/admin', '-g', '*.ts', '-g', '*.tsx'),
      ...files('src/routes/editor', '-g', '*.ts', '-g', '*.tsx'),
    ]) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if ((target.startsWith('@/server/') || target.startsWith('src/server/')) && !allowed(target)) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the auth orchestration imports direct: routes/auth stays on the signin/setup whitelist', () => {
    // Auth routes orchestrate the signin/setup flow — the whitelist is the
    // auth domain surface plus the infra/HTTP primitives the actions need.
    const allowed = (target: string): boolean => {
      const prefixes = [
        '@/server/domains/auth/',
        '@/server/domains/comments/services/public-query',
        '@/server/domains/settings/install-gate',
        '@/server/http/loaders/signin',
        '@/server/http/request-context',
        '@/server/infra/rate-limit',
      ]
      return prefixes.some((prefix) => target.startsWith(prefix) || target.startsWith(`src/${prefix.slice(2)}`))
    }
    const offenders: string[] = []
    for (const file of files('src/routes/auth', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if ((target.startsWith('@/server/') || target.startsWith('src/server/')) && !allowed(target)) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps client and ui modules out of the server layer', () => {
    // `@/client/` and `@/ui/` touch DOM APIs that cannot evaluate under
    // SSR — server depends on `@/shared/` and `@/server/` only.
    const offenders: string[] = []
    for (const file of files('src/server', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if (
          target.startsWith('@/client/') ||
          target.startsWith('@/ui/') ||
          target.startsWith('src/client/') ||
          target.startsWith('src/ui/')
        ) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps client modules out of shared (isomorphic) modules', () => {
    // `shared/*` runs in server, browser, and vite config — a `@/client/`
    // import would drag browser-only hooks into every consumer.
    const offenders: string[] = []
    for (const file of files('src/shared', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if (target.startsWith('@/client/') || target.startsWith('src/client/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the kv-store row-access plane private to the cache module', () => {
    // `@/server/infra/cache/registry` is the only kv-store consumer — key
    // shapes and codecs stay declared in one place.
    const offenders = files('src', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      if (file.startsWith('src/server/infra/cache/')) {
        return false
      }
      return readFileSync(file, 'utf8').includes('@/server/infra/cache/kv-store')
    })

    expect(offenders).toEqual([])
  })

  it('keeps shared/seo isomorphic: shared-only value imports, no node specifiers', () => {
    // Route `meta()` exports pull `shared/seo` into every route chunk — a
    // server or node-only import there leaks into the browser bundle.
    const offenders: string[] = []
    for (const file of files('src/shared/seo', '-g', '*.ts', '-g', '*.tsx')) {
      const source = stripComments(readFileSync(file, 'utf8'))
      // `node:` specifiers are browser-hostile even in type positions.
      for (const specifier of importSpecifiers(source)) {
        if (specifier.startsWith('node:')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
      // `import type` is erased at compile time and stays legal otherwise.
      for (const specifier of valueImportSpecifiers(source)) {
        const target = resolveSpecifier(file, specifier)
        if (
          (target.startsWith('@/') && !target.startsWith('@/shared/')) ||
          (target.startsWith('src/') && !target.startsWith('src/shared/'))
        ) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('public stylesheet imports tailwind.css', () => {
    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).toMatch(/@import\s+['"]\.\/tailwind\.css['"]/)
  })

  it('keeps optional vendor CSS out of the root stylesheet', () => {
    const source = readFileSync('src/styles/public.css', 'utf8')

    expect(source).not.toContain('bootstrap/dist/css/bootstrap.css')
    expect(source).not.toContain('bootstrap/dist/css/bootstrap-reboot.css')
    expect(source).not.toContain('bootstrap/dist/css/bootstrap-utilities.css')
    expect(source).not.toContain('aplayer-ts/src/css/base.css')
    expect(source).not.toContain('medium-zoom/dist/style.css')
    expect(source).not.toContain('tippy.js')
  })

  it('keeps the Bootstrap npm dep fully retired from the public bundle', () => {
    const globals = readFileSync('src/styles/public.css', 'utf8')

    // Match real import statements only — comments about retired paths must
    // not trip these.
    expect(globals).not.toMatch(/^\s*@import\s+['"]bootstrap/m)
    expect(globals).not.toMatch(/^\s*import\s.*from\s+['"]bootstrap/m)
    expect(globals).not.toContain('_legacy-utilities')
    expect(globals).not.toMatch(/bootstrap[^.]*utilities\.css/i)
    expect(
      files('src/assets/styles', '-g', '*.css').filter((file) =>
        /bootstrap.*utilities|utilities.*bootstrap|legacy-utilities/.test(file),
      ),
    ).toEqual([])
  })

  it('keeps the legacy buttons + bootstrap-compat partials AND the temporary components.css shim fully retired', () => {
    expect(existsSync('src/ui/primitives/buttons.css')).toBe(false)
    expect(existsSync('src/styles/bootstrap-compat.css')).toBe(false)
    expect(existsSync('src/styles/components.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*buttons\.css['"]/)
    expect(globals).not.toMatch(/@import\s+['"][^'"]*bootstrap-compat\.css['"]/)
    expect(globals).not.toMatch(/@import\s+['"][^'"]*components\.css['"]/)

    // Button recipe lives in the shared CVA; pin variant/size/shape sets.
    expect(existsSync('src/ui/primitives/btn.ts')).toBe(false)
    const btn = readFileSync('src/ui/components/button.tsx', 'utf8')
    expect(btn).toMatch(/export \{ Button, buttonVariants \}/)
    expect(btn).toMatch(/export interface ButtonProps\b/)
    for (const variant of [
      'default',
      'destructive',
      'destructive-soft',
      'outline',
      'secondary',
      'ghost',
      'link',
      'light',
      'dark',
    ]) {
      expect(btn).toMatch(new RegExp(`${variant}['"]?\\s*:`))
    }
    for (const size of ['default', 'sm', 'lg', 'icon', 'iconSm', 'iconMd', 'iconLg']) {
      expect(btn).toMatch(new RegExp(`\\b${size}:`))
    }
    for (const shape of ['default', 'circle', 'pill', 'block']) {
      expect(btn).toMatch(new RegExp(`\\b${shape}:`))
    }

    const tailwindCss = readFileSync('src/styles/tailwind.css', 'utf8')
    expect(tailwindCss).toMatch(/--spacing-icon-inset:\s*28%;/)
  })

  it('keeps the legacy cards + lists partials fully retired', () => {
    expect(existsSync('src/ui/primitives/cards.css')).toBe(false)
    expect(existsSync('src/ui/primitives/lists.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*cards\.css['"]/)
    expect(globals).not.toMatch(/@import\s+['"][^'"]*lists\.css['"]/)

    const tailwindCss = readFileSync('src/styles/tailwind.css', 'utf8')
    expect(tailwindCss).toMatch(/--ink-5:\s*#eaecf3;/)
    expect(tailwindCss).toMatch(/--color-ink-5:\s*var\(--ink-5\);/)

    // Scan for residual className tokens that would only resolve through
    // the deleted partials.
    const offenders: string[] = []
    const bannedClassTokens = [
      'list-item',
      'list-content',
      'list-body',
      'list-title',
      'list-grouped',
      'list-bookmarks',
      'list-nice-overlay',
      'list-grid',
      'list-desc',
      'list-meta',
      'list-footer',
      'list-subtitle',
      'list-gogogo',
      'h-1x',
      'h-2x',
      'h-3x',
      'data-null',
    ]
    const ambiguousClassTokens = ['media', 'overlay', 'text-muted']
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      const hit = bannedClassTokens.find((token) =>
        new RegExp(`(?<![A-Za-z0-9_-])${token}(?![A-Za-z0-9_-])`).test(stripped),
      )
      if (hit !== undefined) {
        offenders.push(`${file} (${hit})`)
        continue
      }
      const ambiguous = ambiguousClassTokens.find((token) =>
        new RegExp(
          `class(?:Name)?\\s*=\\s*["'\`][^"'\`]*(?<![A-Za-z0-9_:-])${token}(?![A-Za-z0-9_:-])[^"'\`]*["'\`]`,
        ).test(stripped),
      )
      if (ambiguous !== undefined) {
        offenders.push(`${file} (${ambiguous} className)`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy navigation partial fully retired', () => {
    expect(existsSync('src/ui/primitives/navigation.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*navigation\.css['"]/)

    const tokens = readFileSync('src/styles/tailwind.css', 'utf8')
    expect(tokens).toMatch(/--z-aside-drawer:\s*1020;/)

    const offenders: string[] = []
    const bannedClassTokens = [
      'site-aside',
      'aside-inner',
      'navbar-brand',
      'mobile-brand',
      'menu-toggler',
      'site-menu',
      'site-submenu',
      'button-social',
      'content-wrapper',
      'site-layout',
      'site-main',
    ]
    const bareSidebar = /class(?:Name)?\s*=\s*["'`][^"'`]*(?:^|\s)sidebar(?:\s|$)[^"'`]*["'`]/
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (bareSidebar.test(stripped)) {
        offenders.push(`${file} (bare 'sidebar' className)`)
        continue
      }
      const hit = bannedClassTokens.find((token) =>
        new RegExp(`(?<![A-Za-z0-9_-])${token}(?![A-Za-z0-9_-])`).test(stripped),
      )
      if (hit !== undefined) {
        offenders.push(`${file} (${hit})`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy popup partial fully retired', () => {
    expect(existsSync('src/ui/primitives/popup.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/popup\.css/)

    const offenders: string[] = []
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (/\bnice-popup(?:-[a-z]+)*\b/.test(stripped)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy media partial fully retired', () => {
    expect(existsSync('src/ui/primitives/media.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*media\.css['"]/)

    const offenders: string[] = []
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (
        /\bmedia-(?:overlay|content|3x[12]|36x17)\b/.test(stripped) ||
        /\boverlay-top\b/.test(stripped) ||
        /\bnav-links\b/.test(stripped) ||
        /\bpage-numbers\b/.test(stripped)
      ) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy forms partial fully retired', () => {
    expect(existsSync('src/ui/primitives/forms.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*forms\.css['"]/)

    const offenders: string[] = []
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (/\bflex-avatar\b/.test(stripped)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy sidebar partial fully retired', () => {
    expect(existsSync('src/ui/sidebar/sidebar.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*sidebar\.css['"]/)
    expect(globals).not.toMatch(/\.widget-title:before\b/)
    expect(globals).not.toMatch(/\.tagcloud\s*>\s*a:before\b/)
    expect(globals).not.toMatch(/@layer\s+components\s*\{/)
    expect(globals).not.toMatch(/\.screen-reader-text\b/)

    const sidebarSource = readFileSync('src/ui/public/Sidebar.tsx', 'utf8')
    expect(sidebarSource).toMatch(/before:content-\['']/)
    expect(sidebarSource).toMatch(/before:content-\['#']/)

    const partialOffenders: string[] = []
    const bannedSelectors = [
      /\.sidebar-inner\s*\{/,
      /\.widget\s*\{/,
      /\.widget-title\s*\{/,
      /\.widget-search\b/,
      /\.widget-recent-(?:entries|comments)\b/,
      /\.tagcloud\s*\{/,
      /\.tagcloud\s+a\b/,
      /\.list-like(?:-square)?\s*\{/,
      /\.list-like(?:-square)?\s+\.like-count\b/,
      /\.site-fixed-widget\b/,
      /\.search-field\b/,
    ]
    for (const file of files('src', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '')
      const hit = bannedSelectors.find((re) => re.test(stripped))
      if (hit !== undefined) {
        partialOffenders.push(`${file} (${hit})`)
      }
    }
    expect(partialOffenders).toEqual([])
  })
  it('keeps client utilities independent from UI component modules', () => {
    // `@/client/` hooks and `@/shared/` helpers are imported by server and
    // browser bundles alike — reaching into `@/ui/` components would drag
    // the DOM component graph into every consumer. Value and type imports
    // both count, whether `@/`-aliased or relative.
    const offenders: string[] = []
    for (const file of files('src/client', 'src/shared', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if (target.startsWith('@/ui/') || target.startsWith('src/ui/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps UI and client modules from importing server/runtime data modules', () => {
    // `import type` is compile-time only; runtime imports are banned.
    const offenders: string[] = []
    for (const file of files('src/ui', 'src/client', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of valueImportSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if (target.startsWith('@/server/') || target.startsWith('src/server/') || target.endsWith('.server')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the static `@/blog.config` import out of the codebase entirely', () => {
    const offenders = files('src', 'tests', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /from\s+["']@\/blog\.config["']/.test(source)
    })
    expect(offenders).toEqual([])
  })

  it('keeps the retired blog-config snapshot shim out of the codebase', () => {
    expect(existsSync('src/shared/blog-config-snapshot.ts')).toBe(false)

    const offenders = files('src', 'tests', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /from\s+["']@\/shared\/blog-config-snapshot["']/.test(source)
    })

    expect(offenders).toEqual([])
  })

  it('keeps blog settings provider split by section context', () => {
    const source = readFileSync('src/shared/lib/blog-config-context.tsx', 'utf8')

    expect(source).toContain('SECTION_CONTEXTS_ANY')
    expect(source).toContain("makeCtx<SiteIdentitySettings>('siteIdentityContext')")
    expect(source).toContain("makeCtx<CacheSettings>('cacheContext')")
    expect(source).toContain("makeCtx<RateLimitSettings>('rateLimitContext')")
    expect((source.match(/makeCtx</g) ?? []).length).toBeGreaterThanOrEqual(12)
    expect(source).not.toContain('BlogSettingsBundleContext')
  })

  it('routes every settings form through the unified react-hook-form wrapper', () => {
    const source = readFileSync('src/ui/admin/settings/shell/useSettingsCard.tsx', 'utf8')

    expect(source).toContain('useForm<TState>')
    expect(source).toContain('safeParseAsync')
    expect(source).not.toContain('submittedDraftRef')
    expect(source).not.toContain('setSnapshot(')

    const formFiles = files('src/ui/admin/settings', '-g', '*.tsx').filter((file) => {
      const formSource = readFileSync(file, 'utf8')
      return /useSettingsCard(?:<|\()/.test(formSource) && !file.includes('/shell/')
    })
    for (const file of formFiles) {
      const formSource = readFileSync(file, 'utf8')
      expect(formSource).toMatch(/useSettingsCard/)
      // Direct `useForm` import means the form bypasses the wrapper.
      expect(formSource).not.toMatch(/import\s*\{[^}]*\buseForm\b[^}]*\}\s*from\s*['"]react-hook-form['"]/)
      // No form may import `useRevalidator` directly.
      expect(formSource).not.toMatch(/import\s*\{[^}]*\buseRevalidator\b[^}]*\}\s*from\s*['"]react-router['"]/)
    }
  })

  it('keeps settings-card inputs on the blur-driven autosave contract', () => {
    const settingsCardFiles = files('src/ui/admin/settings', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /useSettingsCard(?:<|\()/.test(source) && !file.includes('/shell/')
    })
    const directInputAllowlist = new Set([
      // Test-mail recipient is transient action state, not persisted settings.
      'src/ui/admin/settings/MailTestCard.tsx',
    ])

    const bareInputOffenders = settingsCardFiles.filter((file) => {
      if (directInputAllowlist.has(file)) {
        return false
      }
      return readFileSync(file, 'utf8').includes("from '@/ui/components/input'")
    })
    expect(bareInputOffenders).toEqual([])

    // Save-on-change lives in the Settings* wrappers. Banned in cards:
    // hand-rolled `field.onChange(…)` + `save()` pairs, and bare
    // `onChange={field.onChange}` with no wrapper import.
    const handRolledOffenders = settingsCardFiles.filter((file) =>
      /field\.onChange\([^)]*\)\s*save\(\)/.test(readFileSync(file, 'utf8')),
    )
    expect(handRolledOffenders).toEqual([])

    const directChangeOffenders = settingsCardFiles.filter((file) => {
      const source = readFileSync(file, 'utf8')
      if (!/on(?:Checked|Value)Change=\{field\.onChange\}/.test(source)) {
        return false
      }
      return !/from '@\/ui\/admin\/settings\/shell\/Settings(?:Switch|Checkbox|Select|RadioGroup|Combobox)'/.test(
        source,
      )
    })
    expect(directChangeOffenders).toEqual([])
  })

  it('keeps non-type catalog imports out of UI components', () => {
    // `shared/types/catalog` is type-only — a value import drags shared
    // runtime code into the component chunk.
    const offenders: string[] = []
    for (const file of files('src/ui', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of valueImportSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if (target === '@/shared/types/catalog' || target === 'src/shared/types/catalog') {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps Luxon out of client-facing chrome and date formatter paths', () => {
    const clientFacing = [
      ...files('src/ui', '-g', '*.ts', '-g', '*.tsx'),
      'src/shared/utils/formatter.ts',
      'src/server/http/loaders/sidebar.ts',
      'src/routes/public/home.tsx',
    ]
    const offenders = clientFacing.filter((file) => readFileSync(file, 'utf8').includes('luxon'))

    expect(offenders).toEqual([])
  })

  it('keeps source relative imports inside the documented allowlist', () => {
    const explicitAllowed = [
      {
        key: 'vite.config.ts -> ./src/server/infra/hono/dev.ts',
        file: 'vite.config.ts',
        specifier: './src/server/infra/hono/dev.ts',
      },
      {
        key: 'vite.config.ts -> ./src/server/infra/route-warmup.ts',
        file: 'vite.config.ts',
        specifier: './src/server/infra/route-warmup.ts',
      },
      {
        key: 'vite.config.ts -> ./src/server/infra/image/worker-entry-plugin.ts',
        file: 'vite.config.ts',
        specifier: './src/server/infra/image/worker-entry-plugin.ts',
      },
      {
        key: 'dev.ts -> ./dev-server-ref.ts',
        file: 'src/server/infra/hono/dev.ts',
        specifier: './dev-server-ref.ts',
      },
      {
        key: 'process-worker.ts -> ../../../shared/utils/thumbhash.ts',
        file: 'src/server/infra/image/process-worker.ts',
        specifier: '../../../shared/utils/thumbhash.ts',
      },
      {
        // Config-graph file: Vite's config loader resolves no `@/` aliases
        // and requires explicit extensions.
        key: 'route-warmup.ts -> ../../shared/constants/route-warmup.ts',
        file: 'src/server/infra/route-warmup.ts',
        specifier: '../../shared/constants/route-warmup.ts',
      },
      {
        // Config-graph file: same alias caveat; shared contract keeps
        // writer and reader from drifting.
        key: 'route-warmup.ts -> ../../shared/route-warmup/manifest.ts',
        file: 'src/server/infra/route-warmup.ts',
        specifier: '../../shared/route-warmup/manifest.ts',
      },
      {
        // Config-graph file: same alias caveat; `unsafeCast` bridges
        // Vite's structurally-compatible types.
        key: 'dev.ts -> ../../../shared/utils/unsafe-cast.ts',
        file: 'src/server/infra/hono/dev.ts',
        specifier: '../../../shared/utils/unsafe-cast.ts',
      },
      {
        // Config-graph file: same alias caveat; `unsafeCast` bridges
        // Vite internals (env/ssr flags).
        key: 'route-warmup.ts -> ../../shared/utils/unsafe-cast.ts',
        file: 'src/server/infra/route-warmup.ts',
        specifier: '../../shared/utils/unsafe-cast.ts',
      },
      {
        // Vendored cn-font-split: relative import of the wasm glue module.
        key: 'slice.ts -> ./vendor/wasm-split',
        file: 'src/server/domains/fonts/slice.ts',
        specifier: './vendor/wasm-split',
      },
      {
        key: 'LazyCommentBodyEditor.tsx -> ./CommentBodyEditor',
        file: 'src/ui/public/comments/LazyCommentBodyEditor.tsx',
        specifier: './CommentBodyEditor',
      },
    ] as const
    const explicitAllowedHits = new Set<string>()

    const allowed = (file: string, specifier: string): boolean => {
      if (specifier.startsWith('./+types/')) {
        return true
      }

      const explicit = explicitAllowed.find((entry) => entry.file === file && entry.specifier === specifier)
      if (explicit) {
        explicitAllowedHits.add(explicit.key)
        return true
      }
      return false
    }

    const offenders: string[] = []
    const importRe = /from\s+["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g
    for (const file of files('src', 'vite.config.ts', 'react-router.config.ts', '-g', '*.ts', '-g', '*.tsx')) {
      const source = readFileSync(file, 'utf8')
      let match: RegExpExecArray | null
      while ((match = importRe.exec(source)) !== null) {
        const specifier = match[1] ?? match[2]
        if (!allowed(file, specifier)) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
    expect(explicitAllowed.map((entry) => entry.key).filter((key) => !explicitAllowedHits.has(key))).toEqual([])
  })

  it('keeps src/routes.ts project imports relative because aliases are unavailable there', () => {
    const source = readFileSync('src/routes.ts', 'utf8')
    const importSpecifiers = [...source.matchAll(/(?:from\s+|import\(\s*)["']([^"']+)["']/g)].map((match) => match[1])
    const aliasedProjectImports = importSpecifiers.filter(
      (specifier) => specifier.startsWith('@/') || specifier.startsWith('~/'),
    )

    expect(aliasedProjectImports).toEqual([])
  })

  it('keeps DOM/script islands out of the tree (React only)', () => {
    const legacy = files('src/assets/scripts', '-g', '*.ts')
    expect(legacy).toEqual([])
  })

  it('documents React islands instead of the removed src/assets/scripts tree', () => {
    const agents = readFileSync('AGENTS.md', 'utf8')
    expect(agents).toContain('`src/assets/scripts` is intentionally absent')
    expect(agents).not.toContain('src/assets/scripts/**/*.ts')
    expect(agents).not.toContain('Do not remove existing browser scripts')
  })

  it('keeps domain Zod schemas out of db/types', () => {
    const source = readFileSync('src/server/infra/db/types.ts', 'utf8')
    expect(source).not.toContain('db/types/auth')
    expect(source).not.toContain('db/types/comment')
  })

  it('keeps fonts off the repo and out of every CSS bundle (everything flows through blog.fonts admin settings)', () => {
    const globals = readFileSync('src/styles/public.css', 'utf8')
    const root = readFileSync('src/root.tsx', 'utf8')

    expect(files('src/assets/fonts', '-g', '*.ttf', '-g', '*.woff2', '-g', '*.css')).toEqual([])

    expect(globals).not.toContain('opposans.css')
    expect(globals).not.toContain('opposerif.css')
    expect(globals).not.toContain('iosevka.css')

    expect(root).not.toContain("from '@/assets/fonts/")
    expect(root).not.toContain("import '@/assets/fonts/")
    expect(root).not.toContain('.ttf')

    // Fonts flow from the root loader's `fonts` field (family + href per
    // slot), not external CSS URLs.
    expect(root).toContain('rel="stylesheet" href={f.href}')
  })

  it('keeps admin Tailwind layouts on flex/grid gap instead of space utilities', () => {
    const offenders = files('src/ui/admin', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /space-[xy]-/.test(source)
    })

    expect(offenders).toEqual([])
  })

  it('keeps screen-reader helpers visually hidden instead of display-none', () => {
    const source = readFileSync('src/styles/public.css', 'utf8')

    expect(source).not.toMatch(/\.screen-reader-text\b/)
    expect(source).not.toMatch(/\.sr-only\s*\{[^}]*display:\s*none/s)
  })

  it('does not pass hex design tokens through rgba(var(...))', () => {
    const offenders = files('src/assets/styles', '-g', '*.css').filter((file) =>
      /rgba\(\s*var\(--/.test(readFileSync(file, 'utf8')),
    )

    expect(offenders).toEqual([])
  })

  it('keeps raw arbitrary colors out of non-admin Tailwind surfaces', () => {
    const offenders = files('src/ui', 'src/routes', '-g', '*.ts', '-g', '*.tsx')
      .filter(
        (file) =>
          !file.startsWith('src/ui/admin/') &&
          !file.startsWith('src/routes/auth/') &&
          !file.startsWith('src/routes/admin/') &&
          !file.startsWith('src/ui/public/aplayer/'),
      )
      .filter((file) => /(?:bg|text|border)-\[#/.test(readFileSync(file, 'utf8')))

    expect(offenders).toEqual([])
  })

  it('keeps Base UI select and dropdown items inside group wrappers', () => {
    const select = readFileSync('src/ui/components/select.tsx', 'utf8')
    const dropdown = readFileSync('src/ui/components/dropdown-menu.tsx', 'utf8')

    expect(select).toContain('<SelectGroup>{children}</SelectGroup>')
    expect(dropdown).toContain('<DropdownMenuGroup>{children}</DropdownMenuGroup>')
  })

  it('keeps interaction-only animation libraries behind lazy boundaries', () => {
    // `motion/react` and `@number-flow/react` must stay behind lazy
    // boundaries (`lazy-motion.tsx`, `lazy(() => …)`).
    const popupComponents = [
      'src/ui/components/alert-dialog.tsx',
      'src/ui/components/combobox.tsx',
      'src/ui/components/dialog.tsx',
      'src/ui/components/dropdown-menu.tsx',
      'src/ui/components/popover.tsx',
      'src/ui/components/select.tsx',
      'src/ui/components/sheet.tsx',
    ]
    for (const file of popupComponents) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} statically imports motion/react`).not.toMatch(/^import .* from 'motion\/react'/m)
      expect(source, `${file} bypasses the lazy boundary`).not.toContain('motion.div')
    }
    // The same rule for page-level consumers: `motion/react` only via
    // `lazy-motion.tsx`; `useReducedMotion` would force a static import.
    const motionConsumers = [
      'src/ui/public/widgets/Popup.tsx',
      'src/ui/public/post/TableOfContents.tsx',
      'src/ui/admin/musics/Equalizer.tsx',
      'src/ui/admin/musics/MusicLibraryHero.tsx',
      'src/ui/admin/musics/AdminMusicPlayerFloat.tsx',
      'src/ui/admin/musics/MusicDetailView.tsx',
      'src/ui/admin/musics/AddMusicView.tsx',
      'src/ui/admin/images/JustifiedImageGrid.tsx',
    ]
    for (const file of motionConsumers) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} statically imports motion/react`).not.toMatch(/^import .* from 'motion\/react'/m)
      expect(source, `${file} bypasses the lazy boundary`).not.toMatch(/<motion\./)
      expect(source, `${file} bypasses the lazy boundary`).not.toContain('useReducedMotion')
    }
    const likeActions = readFileSync('src/ui/public/LikeActions.tsx', 'utf8')
    expect(likeActions).not.toMatch(/^import .* from '@number-flow\/react'/m)
    expect(likeActions).toContain("lazy(() => import('@number-flow/react'))")

    // Root MotionConfig goes through `LazyMotionConfig`; animated public
    // chrome is lazy-loaded at call sites.
    const root = readFileSync('src/root.tsx', 'utf8')
    expect(root, 'root.tsx statically imports motion/react').not.toMatch(/^import .* from 'motion\/react'/m)
    const popupCallSites = [
      'src/ui/public/Search.tsx',
      'src/ui/public/friends/FriendApplyForm.tsx',
      'src/ui/public/widgets/QRDialog.tsx',
    ]
    for (const file of popupCallSites) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} statically imports Popup`).not.toContain("from '@/ui/public/widgets/Popup'")
    }
    const detailChrome = readFileSync('src/ui/public/post/DetailBodyChrome.tsx', 'utf8')
    // Static import is safe: TOC motion renders through `lazy-motion.tsx`
    // (lazy boundary regression pinned by toc-hydration.test.tsx).
    expect(detailChrome).toContain("import { TableOfContents } from '@/ui/public/post/TableOfContents'")
  })

  it('sizes Button icons through data-icon instead of hand-written size classes', () => {
    const button = readFileSync('src/ui/components/button.tsx', 'utf8')
    const offenders: string[] = []

    expect(button).toContain('[&_[data-icon]]')

    for (const file of files('src/ui/admin', '-g', '*.tsx')) {
      const source = readFileSync(file, 'utf8')
      for (const chunk of source.split(/<Button\b/).slice(1)) {
        const end = chunk.indexOf('</Button>')
        if (end === -1) {
          continue
        }
        const block = chunk.slice(0, end)
        if (/<[A-Z][A-Za-z0-9]*Icon\b[^>]*className=["'][^"']*size-/.test(block)) {
          offenders.push(file)
          break
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('forbids template-literal `className=` strings under src/ui in favour of cn()', () => {
    const offenders: string[] = []
    for (const file of files('src/ui', '-g', '*.tsx')) {
      const source = readFileSync(file, 'utf8')
      if (source.includes('className={`')) {
        offenders.push(file)
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the wp-decoy status text mirrored between server and ErrorView', () => {
    const server = readFileSync('src/server/http/middlewares/wp-decoy.ts', 'utf8')
    const ui = readFileSync('src/ui/public/chrome/ErrorView.tsx', 'utf8')

    expect(server).toContain("export const NOT_WORDPRESS_STATUS_TEXT = 'Not WordPress'")
    expect(ui).toContain("const NOT_WORDPRESS_STATUS_TEXT = 'Not WordPress'")
  })

  it('keeps solution math scrollable instead of clipping long formulas', () => {
    const publicCss = readFileSync('src/styles/public.css', 'utf8')
    const tailwindCss = readFileSync('src/styles/tailwind.css', 'utf8')

    expect(publicCss).not.toMatch(/\.post-content \.solution\s*\{[^}]*overflow:\s*hidden/s)
    expect(tailwindCss).not.toMatch(/\.post-content \.solution\s*\{[^}]*overflow:\s*hidden/s)
    expect(tailwindCss).toContain(':where(.math-display)')
    expect(tailwindCss).toContain('overflow-x: auto')
  })

  it('routes post / comment typography through @tailwindcss/typography', () => {
    const publicCss = readFileSync('src/styles/public.css', 'utf8')
    const adminCss = readFileSync('src/styles/admin.css', 'utf8')
    const tailwindCss = readFileSync('src/styles/tailwind.css', 'utf8')
    const commentItem = readFileSync('src/ui/public/comments/comment-item/helpers.ts', 'utf8')

    expect(publicCss).not.toMatch(/^\s*\.post-content\s*\{/m)
    expect(publicCss).not.toMatch(/^\s*\.comment-content\s*\{/m)
    expect(tailwindCss).toMatch(/@utility\s+prose-blog\s*\{/)
    expect(tailwindCss).toMatch(/&\.post-content\s*\{/)
    expect(tailwindCss).toMatch(/&\.comment-content\s*\{/)
    expect(publicCss).not.toMatch(/@import\s+['"][^'"]*ui\/post\/post\.css['"]/)
    expect(existsSync('src/ui/post/post.css')).toBe(false)

    // Registration lives in both entries; the shared partial is entry-agnostic.
    expect(publicCss).toContain("@plugin '@tailwindcss/typography'")
    expect(adminCss).toContain("@plugin '@tailwindcss/typography'")
    expect(tailwindCss).toMatch(/--code-bg:\s*rgb\(253,\s*246,\s*227\);/)

    // Light and invert ladders read from the same `--prose-blog-*` slot table.
    for (const slot of [
      'body',
      'headings',
      'lead',
      'links',
      'bold',
      'counters',
      'bullets',
      'hr',
      'quotes',
      'quote-borders',
      'captions',
      'code',
      'pre-code',
      'pre-bg',
      'th-borders',
      'td-borders',
    ]) {
      expect(tailwindCss).toMatch(new RegExp(`--prose-blog-${slot}\\s*:`))
      expect(tailwindCss).toMatch(new RegExp(`--tw-prose-${slot}\\s*:\\s*var\\(--prose-blog-${slot}\\)`))
      expect(tailwindCss).toMatch(new RegExp(`--tw-prose-invert-${slot}\\s*:\\s*var\\(--prose-blog-${slot}\\)`))
    }

    expect(commentItem).toMatch(/cn\(\s*'comment-content'\s*,\s*'prose-blog prose prose-sm max-w-none'/)
  })

  it('inlines the post-content / comment-content literals at the only two call-site shapes', () => {
    const tailwindCss = readFileSync('src/styles/tailwind.css', 'utf8')
    expect(tailwindCss).toMatch(/&\.post-content\s*\{/)
    expect(tailwindCss).toMatch(/&\.comment-content\s*\{/)

    const detailChrome = readFileSync('src/ui/public/post/DetailBodyChrome.tsx', 'utf8')
    const commentItem = readFileSync('src/ui/public/comments/comment-item/helpers.ts', 'utf8')

    expect(detailChrome).toMatch(/cn\(\s*'post-content'\s*,/)
    expect(commentItem).toMatch(/cn\(\s*'comment-content'\s*,/)

    expect(existsSync('src/ui/lib/wp-compat.ts')).toBe(false)
    const offenders = files('src', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes("from '@/ui/lib/wp-compat'")
    })
    expect(offenders).toEqual([])
  })

  it('owns popup outside-click dismissal inside Popup (backdrop), with no data-popup-id protocol', () => {
    const popup = readFileSync('src/ui/public/widgets/Popup.tsx', 'utf8')
    // The full-viewport backdrop keeps the rest of the document inert, so
    // every outside click lands on it.
    expect(popup).toMatch(/fixed inset-0 bg-scrim\/80 backdrop-blur-sm/)
    expect(popup).toMatch(/onClick=\{onClose\}/)
    expect(popup).not.toMatch(/popupId/)
    expect(popup).not.toMatch(/data-popup-id/)
    expect(popup).not.toMatch(/^\s*className\?:\s*string/m)

    const qr = readFileSync('src/ui/public/widgets/QRDialog.tsx', 'utf8')
    expect(qr).not.toMatch(/data-popup-id/)
    expect(qr).not.toMatch(/document\.addEventListener\('click'/)

    const search = readFileSync('src/ui/public/Search.tsx', 'utf8')
    expect(search).not.toMatch(/data-popup-id/)
    expect(search).not.toMatch(/document\.addEventListener\('click'/)
  })

  it('keeps the public UI free of dead exports and one-use comment pass-throughs', () => {
    const musicPlayer = readFileSync('src/ui/pt/blocks/MusicPlayer.tsx', 'utf8')
    expect(musicPlayer).not.toMatch(/MusicPlayerInitHost|scheduleMusicPlayerInit/)

    const footnotes = readFileSync('src/ui/pt/Footnotes.tsx', 'utf8')
    expect(footnotes).not.toMatch(/FootnoteDefinition|stripBackrefs|isBackref/)

    const comments = readFileSync('src/ui/public/comments/Comments.tsx', 'utf8')
    expect(comments).not.toMatch(/export\s+function\s+createCommentTreeState/)
    expect(comments).not.toMatch(/export\s+const\s+commentTreeReducer/)
    expect(comments).not.toMatch(/export\s+type\s+\{\s*CommentTreeAction,\s*CommentTreeState\s*\}/)
    expect(existsSync('src/ui/public/comments/Comment.tsx')).toBe(false)

    const pageDetailBody = readFileSync('src/ui/public/post/PageDetailBody.tsx', 'utf8')
    expect(pageDetailBody).not.toMatch(/export\s+type\s+\{\s*DraftMarker\s*\}/)

    const commentBodyEditor = readFileSync('src/ui/public/comments/CommentBodyEditor.tsx', 'utf8')
    expect(commentBodyEditor).not.toMatch(/export\s+type\s+\{\s*Editor\s*\}/)
  })

  it('keeps the public chrome, audio controls, and detail flags at their owning modules', () => {
    expect(existsSync('src/ui/public/chrome/PublicChrome.tsx')).toBe(false)

    const baseLayout = readFileSync('src/ui/public/chrome/BaseLayout.tsx', 'utf8')
    expect(baseLayout).toMatch(/import ['"]@\/styles\/public\.css['"]/)

    const audioControl = readFileSync('src/ui/public/aplayer/hooks/use-audio-control.ts', 'utf8')
    expect(audioControl).toMatch(/export\s+type\s+AudioControl\s*=\s*ReturnType<typeof useAudioControl>/)

    const playbackControls = readFileSync('src/ui/public/aplayer/controller.tsx', 'utf8')
    expect(playbackControls).toMatch(/control:\s*AudioControl/)
    expect(playbackControls).not.toMatch(/audioDurationSeconds/)

    const detailChrome = readFileSync('src/ui/public/post/DetailBodyChrome.tsx', 'utf8')
    expect(detailChrome).toMatch(/showUpdated\?:\s*boolean/)
    expect(detailChrome).toMatch(/toc\?:\s*boolean/)
    expect(detailChrome).toMatch(/comments\?:\s*boolean/)
    expect(detailChrome).not.toMatch(/'shown'\s*\|\s*'hidden'|'enabled'\s*\|\s*'disabled'/)

    const catalog = readFileSync('src/shared/types/catalog.ts', 'utf8')
    expect(catalog).toMatch(/export\s+type\s+DraftMarker\s*=/)
    const draftMarkerDefinitions = files('src', '-g', '*.ts', '-g', '*.tsx').filter((file) =>
      /type\s+DraftMarker\s*=/.test(readFileSync(file, 'utf8')),
    )
    expect(draftMarkerDefinitions).toEqual(['src/shared/types/catalog.ts'])
  })

  it('derives shared settings and comment contracts from their canonical owners', () => {
    const commentSchema = readFileSync('src/shared/pt/comment-schema.ts', 'utf8')
    expect(commentSchema).toMatch(/textBlockSchema\.extend\(/)

    const display = readFileSync('src/shared/config/display.ts', 'utf8')
    expect(display).not.toMatch(/\bto:\s*['"]\/admin\/settings['"]/)
    expect(display).not.toMatch(/SECTION_DISPLAY_LIST/)

    const settingsRoute = readFileSync('src/routes/admin/settings/index.tsx', 'utf8')
    expect(settingsRoute).toMatch(/Assert<\s*Equals<\(typeof SECTION_CONFIGS\)\[number\]\['id'\], SettingsSection>\s*>/)
    expect(settingsRoute).toMatch(
      /Assert<\s*Equals<\(typeof SECTION_CONFIGS\)\['length'\], \(typeof SETTINGS_SECTIONS\)\['length'\]>\s*>/,
    )
  })

  it('keeps pool wiring and low-level test helpers at their canonical owners', () => {
    const lifecycle = readFileSync('src/server/bootstrap/db-lifecycle.ts', 'utf8')
    expect(lifecycle).toMatch(/function wireDatabase\(/)

    expect(existsSync('tests/_helpers/request.ts')).toBe(false)
    const dbHelper = readFileSync('tests/_helpers/db.ts', 'utf8')
    expect(dbHelper).toMatch(/export\s+function\s+seedMetric/)
    expect(dbHelper).not.toMatch(/afterEach|\bvi\.|spyQueryModule|resetSeedIds|seedComment|seedUser|seedLike/)

    const likeOperations = readFileSync('src/server/infra/db/operations/like.ts', 'utf8')
    const metricOperations = readFileSync('src/server/infra/db/operations/metric.ts', 'utf8')
    const imageProcess = readFileSync('src/server/infra/image/process.ts', 'utf8')
    expect(likeOperations).not.toMatch(/export\s+\{\s*targetKey\s*\}/)
    expect(metricOperations).not.toMatch(/export\s+\{\s*targetKey\s*\}/)
    expect(imageProcess).not.toMatch(/export\s+type\s+\{/)
  })

  it('owns PNG emission and OG rendering in the images resource', () => {
    const images = readFileSync('src/server/http/resources/images.ts', 'utf8')
    expect(images).toMatch(/function respondPng\(/)
    expect(images).toMatch(/function createOgHandler\(/)
    expect(images.match(/c\.header\('Content-Type', 'image\/png'\)/g)).toHaveLength(1)
    expect(images.match(/drawOpenGraph\(/g)).toHaveLength(1)
  })

  it('routes icon-button content through @/ui/components/icon-button-content', () => {
    expect(existsSync('src/ui/components/icon-button-content.tsx')).toBe(true)
    const component = readFileSync('src/ui/components/icon-button-content.tsx', 'utf8')
    expect(component).toMatch(/export\s+function\s+IconButtonContent\b/)
    expect(component).toMatch(/absolute top-0 flex size-full items-center justify-center/)

    const offenders = files('src', '-g', '*.ts', '-g', '*.tsx')
      .filter((file) => file !== 'src/ui/components/icon-button-content.tsx')
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return source.includes('absolute top-0 flex size-full items-center justify-center')
      })
    expect(offenders).toEqual([])
  })

  it('keeps ScrollTopButton on the GPU-layer / opacity toggle (mobile rendering-ghost fix)', () => {
    // iOS ghost fix: toggle visibility via opacity + pointer-events, never
    // display.
    const scrollTop = readFileSync('src/ui/public/chrome/ScrollTopButton.tsx', 'utf8')
    expect(scrollTop).toMatch(/\btransform-gpu\b/)
    expect(scrollTop).toMatch(/\bopacity-0\b/)
    expect(scrollTop).toMatch(/\bopacity-100\b/)
    expect(scrollTop).toMatch(/\bpointer-events-none\b/)
    expect(scrollTop).not.toMatch(/show\s*\?\s*'block'\s*:\s*'hidden'/)
    expect(scrollTop).not.toMatch(/show\s*\?\s*'hidden'\s*:\s*'block'/)

    const baseLayout = readFileSync('src/ui/public/chrome/BaseLayout.tsx', 'utf8')
    expect(baseLayout).toMatch(/\btransform-gpu\b/)
  })

  it('centralises all process.env access in config.ts, hono/dev.ts, and the SEA runtime modules', () => {
    const offenders: string[] = []
    // SEA runtime modules read `KOBATO_NATIVES_DIR` / `KOBATO_CACHE_DIR`
    // before the validated `serverConfig` snapshot exists, and must stay
    // dependency-light (SEA bundles inline them ahead of the app graph).
    const allowed = new Set([
      // config.ts resolves `__`-convention env vars over kobato.config.json
      // at module load.
      'src/server/infra/config.ts',
      'src/server/infra/hono/dev.ts',
      'src/server/infra/sea.ts',
      'src/server/infra/sea-natives.ts',
      'src/server/infra/native-require.ts',
    ])
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx')) {
      if (file.endsWith('.d.ts')) {
        continue
      }
      if (allowed.has(file)) {
        continue
      }
      const source = readFileSync(file, 'utf8')
      if (/\bprocess\.env\b/.test(source)) {
        offenders.push(file)
      }
    }

    expect(offenders).toEqual([])
  })

  it('routes the native packages through static imports + the bundler redirect plugin', () => {
    // Native packages are statically imported and inlined; a
    // `requireExternal` call site would hide them from the bundler and
    // crash under SEA. Pin both halves: no call sites, plugin wired.
    const offenders: string[] = []
    const nativeRequireExternal = /requireExternal(?:<[^>]*>)?\(\s*['"](?:sharp|@napi-rs\/canvas)(?:\/[^'"]*)?['"]/
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx')) {
      const source = readFileSync(file, 'utf8')
      if (nativeRequireExternal.test(source)) {
        offenders.push(file)
      }
    }
    for (const file of ['scripts/sea/smoke-worker.ts']) {
      const source = readFileSync(file, 'utf8')
      if (nativeRequireExternal.test(source)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])

    const plugin = readFileSync('scripts/sea/redirect-native-requires.ts', 'utf8')
    expect(plugin).toMatch(/redirectNativeRequiresPlugin/)
    expect(plugin).toMatch(/@\/server\/infra\/native-require/)
    const seaConfig = readFileSync('vite.sea.config.ts', 'utf8')
    expect(seaConfig).toMatch(/redirectNativeRequiresPlugin\(\)/)
  })
})

describe('contract checker internals (the scanners catch their own escape shapes)', () => {
  // Scanner regressions would silently neuter every layer check above.
  const MULTILINE_SAMPLE = [
    'import {',
    '  alpha,',
    "} from '@/server/domains/pt/service'",
    "import type { Beta } from '@/server/http/types'",
    "import '../server/infra/db/operations/post'",
    'const lazy = import(',
    "  '@/ui/components/button'",
    ')',
  ].join('\n')

  it('valueImportSpecifiers catches multiline, side-effect, and dynamic imports — but not import type', () => {
    expect(valueImportSpecifiers(MULTILINE_SAMPLE)).toEqual([
      '@/server/domains/pt/service',
      '../server/infra/db/operations/post',
      '@/ui/components/button',
    ])
    // importSpecifiers keeps type imports (some checks ban those too).
    expect(importSpecifiers(MULTILINE_SAMPLE)).toContain('@/server/http/types')
  })

  it('the retired per-line scan misses the multiline sample (why the scanners match whole-file)', () => {
    const perLineHit = MULTILINE_SAMPLE.split('\n').some((line) => {
      const trimmed = line.trim()
      return trimmed.startsWith('import') && !trimmed.startsWith('import type') && trimmed.includes('@/server/')
    })
    expect(perLineHit).toBe(false)
    expect(valueImportSpecifiers(MULTILINE_SAMPLE)).toContain('@/server/domains/pt/service')
  })

  it('resolveSpecifier maps relative escapes onto their src/ target and leaves aliases alone', () => {
    expect(resolveSpecifier('src/shared/x.ts', '../server/infra/db/operations/post')).toBe(
      'src/server/infra/db/operations/post',
    )
    expect(resolveSpecifier('src/client/hooks/y.ts', '../../ui/components/button')).toBe('src/ui/components/button')
    expect(resolveSpecifier('src/server/infra/z.ts', '@/server/domains/pt/service')).toBe('@/server/domains/pt/service')
    expect(resolveSpecifier('src/ui/w.ts', 'react')).toBe('react')
  })
})
