import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname as posixDirname, normalize as posixNormalize } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────
// Stage-3 boundaries: workspace package directions.
//
// This file pins the monorepo's cross-package dependency directions
// (plan stage 3 §2) plus the in-package layering rules that pnpm cannot
// express. What pnpm already enforces — an undeclared cross-package
// import cannot resolve under its strict node_modules — is NOT re-checked
// here; the src-level direction rules below catch the couplings pnpm
// still allows (declared but wrong-direction imports) and the headless
// promise the plan demands to machine-verify.
//
// Scan scope: ONLY the package/app `src/` trees (SRC_ROOTS). Test
// directories (`packages/*/tests`, `apps/*/tests`, `tests/`) are
// deliberately exempt — tests may import across packages for test
// infrastructure (e.g. the SDK's tests type-import `@kobato/server` to
// pin its published contracts against the private implementation)
// without that coupling leaking into any shipped artifact.
//
// Relative-escape policy: intra-`src` relative imports are banned
// project-wide except the documented allowlist in the
// "keeps source relative imports inside the documented allowlist" test,
// so the direction checks below only need to match `@kobato/*`
// specifiers — a relative import escaping into another package is
// already a violation of that allowlist.
// ─────────────────────────────────────────────────────────────────────

// Node-native replacement for ripgrep. GitHub's ubuntu-latest runner
// doesn't ship rg, so execFileSync('rg', …) fails in CI.
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

// Comment-stripped view of a source file: `//` and `/* */` blocks may
// mention import paths or re-export syntax and must not trip the checks.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// Every static / dynamic import specifier in a comment-stripped source.
// Line-oriented checks miss multiline statements whose `from '…'` clause
// sits on its own line, so this matches the `from` / `import` keywords
// directly across the whole file.
function importSpecifiers(source: string): string[] {
  const specifierRe = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
  return [...source.matchAll(specifierRe)].map((match) => match[1])
}

// Specifiers bound by VALUE imports (static, side-effect, and dynamic) in a
// comment-stripped source. `import type …` is erased at compile time and
// excluded — a check that bans runtime coupling must not flag it. Matching
// runs across the whole source, so a multiline import whose `from '…'`
// clause sits on its own line is still caught (a per-line
// `startsWith('import')` scan misses those).
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

// A relative specifier resolves against the importing file; everything else
// (`@kobato/*` aliases, package names, node: builtins) passes through
// unchanged. Layer checks compare against BOTH the `@kobato/…` specifier
// and the resolved path so a `../` escape cannot bypass an alias-only ban.
function resolveSpecifier(file: string, specifier: string): string {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return posixNormalize(`${posixDirname(file)}/${specifier}`)
  }
  return specifier
}

// The walk roots: the package srcs + the two app srcs. Direction rules
// below scan only these — test directories are exempt by design (see the
// header comment).
const SRC_ROOTS = [
  'packages/shared/src',
  'packages/server/src',
  'packages/client/src',
  'packages/ui/src',
  'packages/editor/src',
  'packages/sdk/src',
  'apps/core/src',
  'apps/public/src',
]

// Local names bound by `import … from '…'` statements. Used to tell an
// import-then-export facade apart from a legal `const x = …; export { x }`:
// only exported bindings that came from an import are facades.
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

describe('contract: workspace package boundaries (direction rules)', () => {
  // The plan's dependency graph (stage 0 target): shared is leaf-isolated;
  // server → shared (+ editor since stage 4: the Lexical string renderer
  // lives in the editor package and the server assembles it in
  // `server/render/lexical-html.ts`); client → shared (+ type-only server
  // for ApiRouter); ui → shared, client, editor; editor → shared, client;
  // sdk is a published package with ZERO workspace imports (self-reference
  // only). `allowed` is the set of `@kobato/<name>` prefixes a package's
  // src may import (value AND type); `valueBanned` lists packages that may
  // be imported type-only but never by value.
  interface DirectionRule {
    root: string
    allowed: string[]
    valueBanned: string[]
  }
  const PACKAGE_DIRECTIONS: DirectionRule[] = [
    { root: 'packages/shared/src', allowed: ['shared'], valueBanned: [] },
    { root: 'packages/server/src', allowed: ['server', 'shared', 'editor'], valueBanned: [] },
    // client and ui may TYPE-import server (the ApiRouter type exit for the
    // browser client) but never import it by value.
    { root: 'packages/client/src', allowed: ['client', 'shared', 'server'], valueBanned: ['server'] },
    {
      root: 'packages/ui/src',
      allowed: ['ui', 'shared', 'client', 'editor', 'server'],
      valueBanned: ['server', 'sdk'],
    },
    { root: 'packages/editor/src', allowed: ['editor', 'shared', 'client'], valueBanned: [] },
    // sdk is the one published package: its src must not import ANY
    // workspace package (the consumer's `npm i @kobato/sdk` type
    // resolution would break). Self-reference (`@kobato/sdk/{contracts,
    // types}`) is the only legal `@kobato/*` specifier here.
    { root: 'packages/sdk/src', allowed: ['sdk'], valueBanned: [] },
  ]

  it('keeps every package src on its declared dependency directions', () => {
    const offenders: string[] = []
    for (const rule of PACKAGE_DIRECTIONS) {
      for (const file of files(rule.root, '-g', '*.ts', '-g', '*.tsx')) {
        const source = stripComments(readFileSync(file, 'utf8'))
        const valueSpecifiers = new Set(valueImportSpecifiers(source))
        for (const specifier of importSpecifiers(source)) {
          const pkg = /^@kobato\/([a-z]+)(?:\/|$)/.exec(specifier)?.[1]
          if (pkg === undefined) {
            continue
          }
          if (!rule.allowed.includes(pkg)) {
            offenders.push(`${file}: ${specifier}`)
            continue
          }
          if (rule.valueBanned.includes(pkg) && valueSpecifiers.has(specifier)) {
            offenders.push(`${file}: ${specifier} (value import of ${pkg} — type-only allowed)`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps apps/public free of @kobato/server in src (value + type)', () => {
    // The headless promise, machine-verified: the official frontend is a
    // replaceable theme — it consumes core exclusively through the SDK's
    // typed client over HTTP and must hold zero server-package references
    // of any kind. The build-time vite.config coupling is pinned separately
    // below.
    const offenders = files('apps/public/src', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = stripComments(readFileSync(file, 'utf8'))
      return importSpecifiers(source).some((specifier) => specifier.startsWith('@kobato/server'))
    })
    expect(offenders).toEqual([])
  })

  it('keeps the frontend server coupling confined to the documented vite.config build-time imports', () => {
    // The vite config module graph is bundled without the project's
    // resolve aliases, so the config-graph server modules are imported
    // relatively (with explicit extensions) — the pre-split pattern.
    // Exactly two such couplings may exist, both in apps/public/vite
    // .config.ts (the Hono dev-server plugin and the warmup plugin). Any
    // other server reference in the public app — src or config — violates
    // the headless promise.
    const allowed = new Set([
      'apps/public/vite.config.ts: ../../packages/server/src/infra/hono/dev.ts',
      'apps/public/vite.config.ts: ../../packages/server/src/infra/route-warmup.ts',
    ])
    const allowedHits = new Set<string>()
    const offenders: string[] = []
    const scanned = [
      ...files('apps/public/src', '-g', '*.ts', '-g', '*.tsx'),
      'apps/public/vite.config.ts',
      'apps/public/react-router.config.ts',
    ]
    for (const file of scanned) {
      const source = stripComments(readFileSync(file, 'utf8'))
      for (const specifier of importSpecifiers(source)) {
        const target = resolveSpecifier(file, specifier)
        if (target.startsWith('@kobato/server')) {
          offenders.push(`${file}: ${specifier}`)
          continue
        }
        if (target.startsWith('packages/server/')) {
          const key = `${file}: ${specifier}`
          if (allowed.has(key)) {
            allowedHits.add(key)
          } else {
            offenders.push(`${file}: ${specifier}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
    // No dead allowlist: the documented couplings must actually exist.
    expect([...allowed].filter((key) => !allowedHits.has(key))).toEqual([])
  })

  it('keeps apps/public on the editor public subpaths (renderer/comments-editor/lexical-html — no engine)', () => {
    // The editor package exposes several entry surfaces; the public
    // frontend may only reach the renderer, comments-editor, and
    // lexical-html (the Lexical React renderers since R5b). The engine
    // (Lexical editor chrome + toolbar) is admin-side; its dead weight
    // must never ride the public bundle (the product-level guard in
    // tests/unit/arch/public-bundle is the second line of defense).
    const allowedPrefixes = [
      '@kobato/editor/renderer/',
      '@kobato/editor/comments-editor/',
      '@kobato/editor/lexical-html/',
    ]
    const offenders = files('apps/public/src', '-g', '*.ts', '-g', '*.tsx').flatMap((file) => {
      const source = stripComments(readFileSync(file, 'utf8'))
      return importSpecifiers(source)
        .filter(
          (specifier) =>
            specifier.startsWith('@kobato/editor') && !allowedPrefixes.some((prefix) => specifier.startsWith(prefix)),
        )
        .map((specifier) => `${file}: ${specifier}`)
    })
    expect(offenders).toEqual([])
  })

  it('keeps UI modules from importing route modules (value + type)', () => {
    // UI must consume route-owned DTOs through `@kobato/shared/types` (the
    // sessions / my-comments types were moved there); a ui import of a
    // route module couples the component layer to the app shell. The
    // `@/routes` alias leg is dead under the split; the `apps/` leg catches
    // relative escapes into either app.
    const offenders: string[] = []
    for (const file of files('packages/ui/src', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if (target.startsWith('apps/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('contract: server package internals', () => {
  it('keeps the server layer graph one-way (infra → domains → render → http)', () => {
    // `infra/` holds technical primitives with zero business knowledge, so
    // it must stay unaware of every layer above it; `domains/` owns the
    // business rules and must not reach into the SSR (`render/`) or
    // transport (`http/`) perimeters; `render/` must not reach `http/`.
    // Type imports count too — they pin the same coupling.
    const rules: Array<{ from: string; banned: string[] }> = [
      { from: 'packages/server/src/infra/', banned: ['domains', 'http', 'render'] },
      { from: 'packages/server/src/domains/', banned: ['http', 'render'] },
      { from: 'packages/server/src/render/', banned: ['http'] },
    ]
    const offenders: string[] = []
    for (const file of files('packages/server/src', '-g', '*.ts', '-g', '*.tsx')) {
      const rule = rules.find((entry) => file.startsWith(entry.from))
      if (rule === undefined) {
        continue
      }
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        // Compare against the specifier AND the resolved path — a relative
        // `../domains/…` escape must trip the same ban.
        const target = resolveSpecifier(file, specifier)
        if (
          rule.banned.some(
            (banned) =>
              target.startsWith(`@kobato/server/${banned}/`) || target.startsWith(`packages/server/src/${banned}/`),
          )
        ) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the cross-domain import graph acyclic', () => {
    // Domains compose in one direction only: a cycle (auth ↔ comments,
    // pt → music → … → pt) makes every domain inside it impossible to
    // understand or test in isolation, so the domain graph is a DAG and
    // must stay one. Cross-domain values flow through caller-wired
    // injection instead (see `domains/pt/embeds` and
    // `domains/auth/services/password-reset`'s `PasswordResetFlowDeps`).
    // Edges come from `@kobato/server/domains/<other>` specifiers — a
    // relative import escaping into another domain would count too, and
    // type imports pin the same coupling as value imports.
    const domainsRoot = 'packages/server/src/domains'
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
        if (specifier.startsWith('@kobato/server/domains/')) {
          target = `packages/server/src/domains/${specifier.slice('@kobato/server/domains/'.length)}`
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

    // Three-color DFS topological check. The assertion payload is the
    // cycle path itself, so a failure prints the offending loop
    // (e.g. ['auth', 'comments', 'auth']) instead of a bare boolean.
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
    // `bootstrap/` is the composition root: it imports domain modules and
    // wires their injected deps at boot (`wireRestoreMachine`,
    // `wireBackupScheduler`, `wireBackupSnapshots`, `wireAccessLogBatcher`,
    // `wireSessionStorageDb`, …). A domain importing back into bootstrap
    // inverts that direction and risks an import cycle — every `wire*`
    // seam exists precisely to avoid one. Both `@kobato/`-aliased and
    // relative specifiers count, and type imports pin the same coupling.
    const offenders: string[] = []
    for (const file of files('packages/server/src/domains', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if (target.startsWith('@kobato/server/bootstrap/') || target.startsWith('packages/server/src/bootstrap/')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(offenders.sort()).toEqual([])
  })

  it('keeps domain repos private to their owning domain', () => {
    // A domain's interface is its services/, projection, schema, and root
    // feature modules; `repos/**` (or a root `repo.ts`) is the persistence
    // implementation behind that interface. A cross-domain capability must
    // be promoted to the owning domain's surface instead of imported out of
    // its repos — that keeps the interface (not the storage layout) the
    // test surface every consumer relies on. Importers inside the owning
    // domain are fine; both `@kobato/`-aliased and relative specifiers
    // count, and type imports pin the same coupling.
    const domainsRoot = 'packages/server/src/domains'
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
    for (const file of files('packages/server/src', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        let target: string | null = null
        if (specifier.startsWith('@kobato/server/domains/')) {
          target = `packages/server/src/domains/${specifier.slice('@kobato/server/domains/'.length)}`
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
    // One predictable import location per vocabulary: once a domain grows
    // `services/` (or `repos/`, `schemas/`, …), the same-vocabulary root
    // file (`service.ts`, `repo.ts`, `schema.ts`, …) must not survive next
    // to it — two legal homes for the same vocabulary would leave every
    // future import a coin flip and make the split cosmetic. Feature-named
    // root files and directories are untouched by this rule.
    const pairs = [
      ['schema.ts', 'schemas'],
      ['repo.ts', 'repos'],
      ['service.ts', 'services'],
      ['projection.ts', 'projections'],
      ['cache.ts', 'caches'],
    ] as const
    const offenders: string[] = []
    for (const entry of readdirSync('packages/server/src/domains', { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }
      const domainRoot = `packages/server/src/domains/${entry.name}`
      for (const [rootFile, subdir] of pairs) {
        if (existsSync(`${domainRoot}/${rootFile}`) && existsSync(`${domainRoot}/${subdir}`)) {
          offenders.push(`${entry.name}: ${rootFile} coexists with ${subdir}/`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps routes on domain surfaces: no infra/db/operations imports under src/routes', () => {
    // Route modules are wiring: extract the request context, call one
    // orchestration (`http/loaders/*` or a domain-surface service), and
    // render. A route reaching into `infra/db/operations` bypasses the
    // domain interface and re-couples the URL layer to the storage
    // layout — business data access belongs behind a domain surface or
    // an http/loaders assembly (the same rule the repos-privacy test
    // enforces between domains). Infra primitives that are not business
    // data access (the rate limiter, `infra/http/status`) stay legal and
    // are not matched here. Value and type imports both count, whether
    // `@kobato/`-aliased or relative.
    const offenders: string[] = []
    for (const file of files('apps/core/src/routes', 'apps/public/src/routes', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of importSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if (
          target.startsWith('@kobato/server/infra/db/operations') ||
          target.startsWith('packages/server/src/infra/db/operations')
        ) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the kv-store row-access plane private to the cache module', () => {
    // `@kobato/server/infra/cache/registry` is the ONLY consumer of
    // kv-store — every other module must go through the cache verbs
    // (through / get / set / clear / counters) so key shapes and codecs
    // stay declared in one place. Re-enabled in stage 3 with the
    // `@kobato/server/…` specifier form (the stage-1 `@/…` literal could
    // no longer match anything).
    const offenders: string[] = []
    for (const file of files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx')) {
      if (file.startsWith('packages/server/src/infra/cache/')) {
        continue
      }
      const source = stripComments(readFileSync(file, 'utf8'))
      for (const specifier of importSpecifiers(source)) {
        const target = resolveSpecifier(file, specifier)
        if (
          target === '@kobato/server/infra/cache/kv-store' ||
          target === 'packages/server/src/infra/cache/kv-store' ||
          target.startsWith('@kobato/server/infra/cache/kv-store/') ||
          target.startsWith('packages/server/src/infra/cache/kv-store/')
        ) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('contract: shared / client / ui / editor rules', () => {
  it('keeps shared/seo isomorphic: shared-only value imports, no node specifiers', () => {
    // Route `meta()` exports pull `shared/seo` into the browser bundle, so a
    // server-layer or node-only import there would leak into every route
    // chunk. This pins mechanically what the old `server/render/seo` path
    // only documented in a comment. Whole-file matching catches multiline
    // imports; relative `../` escapes resolve to their `src/…` target.
    const offenders: string[] = []
    for (const file of files('packages/shared/src/seo', '-g', '*.ts', '-g', '*.tsx')) {
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
          (target.startsWith('@kobato/') && !target.startsWith('@kobato/shared/')) ||
          (target.startsWith('packages/') && !target.startsWith('packages/shared/')) ||
          target.startsWith('apps/')
        ) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps non-type catalog imports out of UI components', () => {
    // `@kobato/shared/types/catalog` is the type-only catalog surface; a
    // value import would drag shared runtime code into the component
    // chunk. Re-enabled in stage 3 with the `@kobato/…` specifier form
    // (the stage-1 `@/…` literal could no longer match anything).
    const offenders: string[] = []
    for (const file of files('packages/ui/src', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of valueImportSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if (target === '@kobato/shared/types/catalog' || target === 'packages/shared/src/types/catalog') {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps UI and client modules from importing *.server runtime modules', () => {
    // The `*.server.ts` suffix is redundant inside `src/server` (AGENTS.md)
    // and marks a node-only module; ui/client importing one by value drags
    // a server-only implementation into browser bundles. The `@kobato/
    // server` value-import ban itself lives in the package-direction test.
    const offenders: string[] = []
    for (const file of files('packages/ui/src', 'packages/client/src', '-g', '*.ts', '-g', '*.tsx')) {
      for (const specifier of valueImportSpecifiers(stripComments(readFileSync(file, 'utf8')))) {
        const target = resolveSpecifier(file, specifier)
        if (target.endsWith('.server')) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})

describe('contract: module and bundle boundaries', () => {
  it('keeps re-export facades out of src (every import points at the owning module)', () => {
    // A re-exported symbol hides its owning module and drifts out of sync
    // with the source — AGENTS.md bans `export { X } from 'y'` and the
    // import-then-export variant project-wide. Re-exporting a
    // locally-declared symbol (`const x = …; export { x }`, local aliases)
    // stays legal: only bindings that came from an import are flagged.
    //
    // Allowlist: React Router requires `ErrorBoundary` to be exported from
    // the route module itself, so the three layout routes re-export the
    // shared admin fallback under that exact name. Entries are full
    // `file: statement` pairs — any other re-export in these files flags.
    const allowlist = new Set(
      [
        'apps/core/src/routes/admin/layout.tsx',
        'apps/core/src/routes/auth/layout.tsx',
        'apps/core/src/routes/editor/layout.tsx',
      ].map((file) => `${file}: export { AdminErrorFallback as ErrorBoundary }`),
    )

    const offenders: string[] = []
    const directRe = /\bexport\s+(?:type\s+)?(?:\*\s+as\s+[\w$]+|\*|\{[^{}]*\})\s*from\s*['"][^'"]+['"]/g
    const plainRe = /\bexport\s+(?:type\s+)?\{([^{}]*)\}(?!\s*from)/g
    for (const file of files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx')) {
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
    // A barrel `index.ts` (nothing but re-exports) drags the whole feature
    // graph into every consumer (`bundle-barrel-imports`). Route modules
    // named index.tsx with a real loader/action/component are fine, so the
    // check only fires when stripping every `export … from` statement
    // leaves nothing but whitespace behind.
    const exportFromRe = /\bexport\s+(?:type\s+)?(?:\*\s+as\s+[\w$]+|\*|\{[^{}]*\})\s*from\s*['"][^'"]+['"]/g
    const offenders = files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx')
      .filter((file) => /(^|\/)index\.tsx?$/.test(file))
      .filter((file) => {
        const source = stripComments(readFileSync(file, 'utf8'))
        return /\bexport\b/.test(source) && source.replace(exportFromRe, '').trim() === ''
      })

    expect(offenders).toEqual([])
  })

  it('keeps the Postgres-era drivers and async transactions out of src', () => {
    // The SQLite migration (node:sqlite + the DuckDB sidecar) retired the
    // pg driver stack: `pg`, `pg-copy-streams`, and
    // `drizzle-orm/node-postgres` must never re-enter src/ — the
    // one-shot data pump lives in the standalone kobato-pg-pump
    // project, outside this repository entirely. And
    // node:sqlite transactions are SYNC: a `transaction(async` callback
    // commits before its awaited work runs — a silent data-loss bug the
    // drizzle types reject (DrizzleTypeError); this scan is the belt to
    // that type-level suspender.
    const BANNED_DRIVERS = ['pg', 'pg-copy-streams', 'drizzle-orm/node-postgres']
    const offenders: string[] = []
    for (const file of files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx')) {
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

  it('public stylesheet imports tailwind.css', () => {
    const globals = readFileSync('apps/public/src/styles/public.css', 'utf8')
    expect(globals).toMatch(/@import\s+['"]\.\/tailwind\.css['"]/)
  })

  it('keeps optional vendor CSS out of the root stylesheet', () => {
    const source = readFileSync('apps/public/src/styles/public.css', 'utf8')

    expect(source).not.toContain('bootstrap/dist/css/bootstrap.css')
    expect(source).not.toContain('bootstrap/dist/css/bootstrap-reboot.css')
    expect(source).not.toContain('bootstrap/dist/css/bootstrap-utilities.css')
    expect(source).not.toContain('aplayer-ts/src/css/base.css')
    expect(source).not.toContain('medium-zoom/dist/style.css')
    expect(source).not.toContain('tippy.js')
  })

  it('keeps the Bootstrap npm dep fully retired from the public bundle', () => {
    const globals = readFileSync('apps/public/src/styles/public.css', 'utf8')

    // Match real CSS/JS import statements only — comments documenting
    // retired paths must not trip these.
    expect(globals).not.toMatch(/^\s*@import\s+['"]bootstrap/m)
    expect(globals).not.toMatch(/^\s*import\s.*from\s+['"]bootstrap/m)
    expect(globals).not.toContain('_legacy-utilities')
    expect(globals).not.toMatch(/bootstrap[^.]*utilities\.css/i)
    expect(
      files('apps/core/src/styles', 'apps/public/src/styles', '-g', '*.css').filter((file) =>
        /bootstrap.*utilities|utilities.*bootstrap|legacy-utilities/.test(file),
      ),
    ).toEqual([])
  })

  it('keeps the legacy buttons + bootstrap-compat partials AND the temporary components.css shim fully retired', () => {
    expect(existsSync('packages/ui/src/primitives/buttons.css')).toBe(false)
    expect(existsSync('apps/core/src/styles/bootstrap-compat.css')).toBe(false)
    expect(existsSync('apps/core/src/styles/components.css')).toBe(false)

    const globals = readFileSync('apps/public/src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*buttons\.css['"]/)
    expect(globals).not.toMatch(/@import\s+['"][^'"]*bootstrap-compat\.css['"]/)
    expect(globals).not.toMatch(/@import\s+['"][^'"]*components\.css['"]/)

    // Button recipe lives in the shared CVA; pin variant/size/shape sets.
    expect(existsSync('packages/ui/src/primitives/btn.ts')).toBe(false)
    const btn = readFileSync('packages/ui/src/components/button.tsx', 'utf8')
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

    const tailwindCss = readFileSync('apps/core/src/styles/tailwind.css', 'utf8')
    expect(tailwindCss).toMatch(/--spacing-icon-inset:\s*28%;/)
  })

  it('keeps the legacy cards + lists partials fully retired', () => {
    expect(existsSync('packages/ui/src/primitives/cards.css')).toBe(false)
    expect(existsSync('packages/ui/src/primitives/lists.css')).toBe(false)

    const globals = readFileSync('apps/public/src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*cards\.css['"]/)
    expect(globals).not.toMatch(/@import\s+['"][^'"]*lists\.css['"]/)

    const tailwindCss = readFileSync('apps/core/src/styles/tailwind.css', 'utf8')
    expect(tailwindCss).toMatch(/--ink-5:\s*#eaecf3;/)
    expect(tailwindCss).toMatch(/--color-ink-5:\s*var\(--ink-5\);/)

    // Scan every source file for residual className tokens that would
    // only resolve through the deleted partials. Strip comments first
    // so the assertion fires on real markup.
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
    for (const file of files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
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
    expect(existsSync('packages/ui/src/primitives/navigation.css')).toBe(false)

    const globals = readFileSync('apps/public/src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*navigation\.css['"]/)

    const tokens = readFileSync('apps/core/src/styles/tailwind.css', 'utf8')
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
    for (const file of files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
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
    expect(existsSync('packages/ui/src/primitives/popup.css')).toBe(false)

    const globals = readFileSync('apps/public/src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/popup\.css/)

    const offenders: string[] = []
    for (const file of files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (/\bnice-popup(?:-[a-z]+)*\b/.test(stripped)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy media partial fully retired', () => {
    expect(existsSync('packages/ui/src/primitives/media.css')).toBe(false)

    const globals = readFileSync('apps/public/src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*media\.css['"]/)

    const offenders: string[] = []
    for (const file of files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
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
    expect(existsSync('packages/ui/src/primitives/forms.css')).toBe(false)

    const globals = readFileSync('apps/public/src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*forms\.css['"]/)

    const offenders: string[] = []
    for (const file of files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (/\bflex-avatar\b/.test(stripped)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy sidebar partial fully retired', () => {
    expect(existsSync('packages/ui/src/sidebar/sidebar.css')).toBe(false)

    const globals = readFileSync('apps/public/src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*sidebar\.css['"]/)
    expect(globals).not.toMatch(/\.widget-title:before\b/)
    expect(globals).not.toMatch(/\.tagcloud\s*>\s*a:before\b/)
    expect(globals).not.toMatch(/@layer\s+components\s*\{/)
    expect(globals).not.toMatch(/\.screen-reader-text\b/)

    const sidebarSource = readFileSync('packages/ui/src/public/Sidebar.tsx', 'utf8')
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
    for (const file of files(...SRC_ROOTS, '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '')
      const hit = bannedSelectors.find((re) => re.test(stripped))
      if (hit !== undefined) {
        partialOffenders.push(`${file} (${hit})`)
      }
    }
    expect(partialOffenders).toEqual([])
  })

  it('keeps the static `@/blog.config` import out of the codebase entirely', () => {
    const offenders = files(...SRC_ROOTS, 'tests', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /from\s+["']@\/blog\.config["']/.test(source)
    })
    expect(offenders).toEqual([])
  })

  it('keeps the retired blog-config snapshot shim out of the codebase', () => {
    expect(existsSync('packages/shared/src/blog-config-snapshot.ts')).toBe(false)

    const offenders = files(...SRC_ROOTS, 'tests', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /from\s+["']@\/shared\/blog-config-snapshot["']/.test(source)
    })

    expect(offenders).toEqual([])
  })

  it('keeps blog settings provider split by section context', () => {
    const source = readFileSync('packages/shared/src/lib/blog-config-context.tsx', 'utf8')

    expect(source).toContain('SECTION_CONTEXTS_ANY')
    expect(source).toContain("makeCtx<SiteIdentitySettings>('siteIdentityContext')")
    expect(source).toContain("makeCtx<CacheSettings>('cacheContext')")
    expect(source).toContain("makeCtx<RateLimitSettings>('rateLimitContext')")
    expect((source.match(/makeCtx</g) ?? []).length).toBeGreaterThanOrEqual(12)
    expect(source).not.toContain('BlogSettingsBundleContext')
  })

  it('routes every settings form through the unified react-hook-form wrapper', () => {
    const source = readFileSync('packages/ui/src/admin/settings/shell/useSettingsCard.tsx', 'utf8')

    expect(source).toContain('useForm<TState>')
    expect(source).toContain('safeParseAsync')
    expect(source).not.toContain('submittedDraftRef')
    expect(source).not.toContain('setSnapshot(')

    const formFiles = files('packages/ui/src/admin/settings', '-g', '*.tsx').filter((file) => {
      const formSource = readFileSync(file, 'utf8')
      return /useSettingsCard(?:<|\()/.test(formSource) && !file.includes('/shell/')
    })
    for (const file of formFiles) {
      const formSource = readFileSync(file, 'utf8')
      expect(formSource).toMatch(/useSettingsCard/)
      // Direct `useForm` import means the form bypasses the wrapper.
      expect(formSource).not.toMatch(/import\s*\{[^}]*\buseForm\b[^}]*\}\s*from\s*['"]react-hook-form['"]/)
      // `MailForm` may import `useFetcher` for the test-mail button;
      // every other form must not import `useRevalidator` directly.
      expect(formSource).not.toMatch(/import\s*\{[^}]*\buseRevalidator\b[^}]*\}\s*from\s*['"]react-router['"]/)
    }
  })

  it('keeps settings-card inputs on the blur-driven autosave contract', () => {
    const settingsCardFiles = files('packages/ui/src/admin/settings', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /useSettingsCard(?:<|\()/.test(source) && !file.includes('/shell/')
    })
    const directInputAllowlist = new Set([
      // Test-mail recipient is transient action state, not persisted settings.
      'packages/ui/src/admin/settings/MailTestCard.tsx',
    ])

    const bareInputOffenders = settingsCardFiles.filter((file) => {
      if (directInputAllowlist.has(file)) {
        return false
      }
      return readFileSync(file, 'utf8').includes("from '@/ui/components/input'")
    })
    expect(bareInputOffenders).toEqual([])

    // Save-on-change for Switch / Checkbox / Select / RadioGroup / Combobox
    // lives in the Settings* wrappers (SettingsSwitch, SettingsSelect, …):
    // they merge RHF's `field.onChange` with the card's `save`. Two failure
    // modes stay banned in card files:
    //   1. the retired hand-rolled inline handler (`field.onChange(…)` then
    //      `save()` in the same function) — use a wrapper instead;
    //   2. a bare `onChange={field.onChange}` with no wrapper import anywhere
    //      in the file — a control that never saves.
    const handRolledOffenders = settingsCardFiles.filter((file) =>
      /field\.onChange\([^)]*\)\s*save\(\)/.test(readFileSync(file, 'utf8')),
    )
    expect(handRolledOffenders).toEqual([])

    const directChangeOffenders = settingsCardFiles.filter((file) => {
      const source = readFileSync(file, 'utf8')
      if (!/on(?:Checked|Value)Change=\{field\.onChange\}/.test(source)) {
        return false
      }
      return !/from '@kobato\/ui\/admin\/settings\/shell\/Settings(?:Switch|Checkbox|Select|RadioGroup|Combobox)'/.test(
        source,
      )
    })
    expect(directChangeOffenders).toEqual([])
  })

  it('keeps Luxon out of client-facing chrome and date formatter paths', () => {
    const clientFacing = [
      ...files('packages/ui/src', '-g', '*.ts', '-g', '*.tsx'),
      'packages/shared/src/utils/formatter.ts',
      'packages/server/src/http/loaders/sidebar.ts',
      'apps/public/src/routes/public/home.tsx',
    ]
    const offenders = clientFacing.filter((file) => readFileSync(file, 'utf8').includes('luxon'))

    expect(offenders).toEqual([])
  })

  it('keeps source relative imports inside the documented allowlist', () => {
    const explicitAllowed = [
      {
        // The public routes' injected Content API client (phase 0.5): a
        // routes-internal relative import — `@kobato/` specifiers are fine
        // here, but keeping it relative matches the sibling route-module
        // convention and survived the package split as-is.
        key: 'routes/public/* -> ./client (injected Content API client)',
        file: 'apps/public/src/routes/public/home.tsx',
        specifier: './client',
      },
      {
        // The public routes' injected Content API client (phase 0.5): a
        // routes-internal relative import — `@kobato/` specifiers are fine
        // here, but keeping it relative matches the sibling route-module
        // convention and survived the package split as-is.
        key: 'routes/public/* -> ./client (injected Content API client)',
        file: 'apps/public/src/routes/public/home.tsx',
        specifier: './client',
      },
      {
        key: 'routes/public/archives.tsx -> ./client',
        file: 'apps/public/src/routes/public/archives.tsx',
        specifier: './client',
      },
      {
        key: 'routes/public/categories.tsx -> ./client',
        file: 'apps/public/src/routes/public/categories.tsx',
        specifier: './client',
      },
      {
        key: 'routes/public/category/list.tsx -> ../client',
        file: 'apps/public/src/routes/public/category/list.tsx',
        specifier: '../client',
      },
      {
        key: 'routes/public/tag/list.tsx -> ../client',
        file: 'apps/public/src/routes/public/tag/list.tsx',
        specifier: '../client',
      },
      {
        key: 'routes/public/search/list.tsx -> ../client',
        file: 'apps/public/src/routes/public/search/list.tsx',
        specifier: '../client',
      },
      {
        key: 'routes/public/post/detail.tsx -> ../client',
        file: 'apps/public/src/routes/public/post/detail.tsx',
        specifier: '../client',
      },
      {
        key: 'routes/public/page/detail.tsx -> ../client',
        file: 'apps/public/src/routes/public/page/detail.tsx',
        specifier: '../client',
      },
      {
        // The frontend's local warmup-manifest reader (headless stage 3):
        // routes-internal relative import of the local SEA asset reader —
        // the `@kobato/` specifier works here too, but the sibling lib-module
        // convention keeps it relative.
        key: 'lib/warmup-manifest.ts -> ./sea-assets (frontend local SEA reader)',
        file: 'apps/public/src/lib/warmup-manifest.ts',
        specifier: './sea-assets',
      },
      {
        // The vite.config module graph is bundled without the project's
        // resolve aliases, so config-graph server modules import shared
        // relatively (with explicit extensions) — the pre-split pattern.
        key: 'route-warmup.ts (infra) -> shared constants/route-warmup',
        file: 'packages/server/src/infra/route-warmup.ts',
        specifier: '../../../shared/src/constants/route-warmup.ts',
      },
      {
        key: 'route-warmup.ts (infra) -> shared route-warmup/manifest',
        file: 'packages/server/src/infra/route-warmup.ts',
        specifier: '../../../shared/src/route-warmup/manifest.ts',
      },
      {
        key: 'route-warmup.ts (infra) -> shared utils/unsafe-cast',
        file: 'packages/server/src/infra/route-warmup.ts',
        specifier: '../../../shared/src/utils/unsafe-cast.ts',
      },
      {
        key: 'dev.ts -> shared utils/unsafe-cast',
        file: 'packages/server/src/infra/hono/dev.ts',
        specifier: '../../../../shared/src/utils/unsafe-cast.ts',
      },
      {
        key: 'dev.ts -> ./dev-server-ref.ts',
        file: 'packages/server/src/infra/hono/dev.ts',
        specifier: './dev-server-ref.ts',
      },
      {
        key: 'process-worker.ts -> ../../../../shared/src/utils/thumbhash.ts',
        file: 'packages/server/src/infra/image/process-worker.ts',
        specifier: '../../../../shared/src/utils/thumbhash.ts',
      },
      {
        // Vendored cn-font-split: relative import of the wasm glue module.
        key: 'slice.ts -> ./vendor/wasm-split',
        file: 'packages/server/src/domains/fonts/slice.ts',
        specifier: './vendor/wasm-split',
      },
      {
        // Vendored cn-font-split: the wasm glue's own binary import.
        key: 'wasm-split.ts -> ./cnfs.wasm?init',
        file: 'packages/server/src/domains/fonts/vendor/wasm-split.ts',
        specifier: './cnfs.wasm?init',
      },
      {
        // App vite.configs: each app's own warmup tier table (relative
        // because the config graph is bundled without the resolve aliases).
        key: 'apps/core/vite.config.ts -> ./src/warmup.ts',
        file: 'apps/core/vite.config.ts',
        specifier: './src/warmup.ts',
      },
      {
        key: 'apps/public/vite.config.ts -> ./src/warmup.ts',
        file: 'apps/public/vite.config.ts',
        specifier: './src/warmup.ts',
      },
      {
        // App vite.configs: the config-graph server modules imported
        // relatively (no aliases in the config graph). The public app's
        // pair is the ONLY server coupling the headless promise tolerates
        // (pinned by the dedicated test above).
        key: 'apps/core/vite.config.ts -> server infra/hono/dev',
        file: 'apps/core/vite.config.ts',
        specifier: '../../packages/server/src/infra/hono/dev.ts',
      },
      {
        key: 'apps/core/vite.config.ts -> server infra/image/worker-entry-plugin',
        file: 'apps/core/vite.config.ts',
        specifier: '../../packages/server/src/infra/image/worker-entry-plugin.ts',
      },
      {
        key: 'apps/core/vite.config.ts -> server infra/route-warmup',
        file: 'apps/core/vite.config.ts',
        specifier: '../../packages/server/src/infra/route-warmup.ts',
      },
      {
        key: 'apps/public/vite.config.ts -> server infra/hono/dev',
        file: 'apps/public/vite.config.ts',
        specifier: '../../packages/server/src/infra/hono/dev.ts',
      },
      {
        key: 'apps/public/vite.config.ts -> server infra/route-warmup',
        file: 'apps/public/vite.config.ts',
        specifier: '../../packages/server/src/infra/route-warmup.ts',
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
    for (const file of files(
      ...SRC_ROOTS,
      'apps/core/vite.config.ts',
      'apps/core/react-router.config.ts',
      'apps/public/vite.config.ts',
      'apps/public/react-router.config.ts',
      '-g',
      '*.ts',
      '-g',
      '*.tsx',
    )) {
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

  it('keeps the app routes.ts project imports relative because aliases are unavailable there', () => {
    for (const routesFile of ['apps/core/src/routes.ts', 'apps/public/src/routes.ts']) {
      const source = readFileSync(routesFile, 'utf8')
      const importSpecifiers = [...source.matchAll(/(?:from\s+|import\(\s*)["']([^"']+)["']/g)].map((match) => match[1])
      const aliasedProjectImports = importSpecifiers.filter(
        (specifier) => specifier.startsWith('@/') || specifier.startsWith('~/'),
      )

      expect(aliasedProjectImports).toEqual([])
    }
  })

  it('keeps DOM/script islands out of the tree (React only)', () => {
    const legacy = files('apps/core/src/assets/scripts', '-g', '*.ts')
    expect(legacy).toEqual([])
  })

  it('documents React islands instead of the removed src/assets/scripts tree', () => {
    const agents = readFileSync('AGENTS.md', 'utf8')
    expect(agents).toContain('`apps/core/src/assets/scripts` is intentionally absent')
    expect(agents).not.toContain('src/assets/scripts/**/*.ts')
    expect(agents).not.toContain('Do not remove existing browser scripts')
  })

  it('keeps domain Zod schemas out of db/types', () => {
    const source = readFileSync('packages/server/src/infra/db/types.ts', 'utf8')
    expect(source).not.toContain('db/types/auth')
    expect(source).not.toContain('db/types/comment')
  })

  it('keeps fonts off the repo and out of every CSS bundle (everything flows through blog.fonts admin settings)', () => {
    const globals = readFileSync('apps/public/src/styles/public.css', 'utf8')
    // The font-slot contract holds for both app roots (public renders the
    // user-facing shell; the core admin shell shares the same loader data).
    const roots = ['apps/core/src/root.tsx', 'apps/public/src/root.tsx'].map((file) => readFileSync(file, 'utf8'))

    expect(files('src/assets/fonts', '-g', '*.ttf', '-g', '*.woff2', '-g', '*.css')).toEqual([])

    expect(globals).not.toContain('opposans.css')
    expect(globals).not.toContain('opposerif.css')
    expect(globals).not.toContain('iosevka.css')

    for (const root of roots) {
      expect(root).not.toContain("from '@/assets/fonts/")
      expect(root).not.toContain("import '@/assets/fonts/")
      expect(root).not.toContain('.ttf')

      // Browser web fonts now flow through self-hosted packages resolved from
      // the root loader's `fonts` field (resolved family + href per slot), not
      // from external CSS URLs. Assert the new contract holds.
      expect(root).toContain('rel="stylesheet" href={f.href}')
    }
  })

  it('keeps admin Tailwind layouts on flex/grid gap instead of space utilities', () => {
    const offenders = files('packages/ui/src/admin', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /space-[xy]-/.test(source)
    })

    expect(offenders).toEqual([])
  })

  it('keeps screen-reader helpers visually hidden instead of display-none', () => {
    const source = readFileSync('apps/public/src/styles/public.css', 'utf8')

    expect(source).not.toMatch(/\.screen-reader-text\b/)
    expect(source).not.toMatch(/\.sr-only\s*\{[^}]*display:\s*none/s)
  })

  it('does not pass hex design tokens through rgba(var(...))', () => {
    const offenders = files('apps/core/src/styles', 'apps/public/src/styles', '-g', '*.css').filter((file) =>
      /rgba\(\s*var\(--/.test(readFileSync(file, 'utf8')),
    )

    expect(offenders).toEqual([])
  })

  it('keeps raw arbitrary colors out of non-admin Tailwind surfaces', () => {
    const offenders = files(
      'packages/ui/src',
      'apps/core/src/routes',
      'apps/public/src/routes',
      '-g',
      '*.ts',
      '-g',
      '*.tsx',
    )
      .filter(
        (file) =>
          !file.startsWith('packages/ui/src/admin/') &&
          !file.startsWith('apps/core/src/routes/auth/') &&
          !file.startsWith('apps/core/src/routes/admin/') &&
          !file.startsWith('packages/ui/src/public/aplayer/'),
      )
      .filter((file) => /(?:bg|text|border)-\[#/.test(readFileSync(file, 'utf8')))

    expect(offenders).toEqual([])
  })

  it('keeps Base UI select and dropdown items inside group wrappers', () => {
    const select = readFileSync('packages/ui/src/components/select.tsx', 'utf8')
    const dropdown = readFileSync('packages/ui/src/components/dropdown-menu.tsx', 'utf8')

    expect(select).toContain('<SelectGroup>{children}</SelectGroup>')
    expect(dropdown).toContain('<DropdownMenuGroup>{children}</DropdownMenuGroup>')
  })

  it('keeps interaction-only animation libraries behind lazy boundaries', () => {
    // The popup chrome enhances its content with a motion enter-animation,
    // but the animation runtime must not ride the content pages' synchronous
    // bundle — the components reach it through `lazy-motion.tsx` (dynamic
    // import + Suspense fallback). `@number-flow/react` likewise animates
    // only on like/unlike, so LikeActions lazy-loads it (admin Counters stay
    // static — the admin bundle is already heavy).
    const popupComponents = [
      'packages/ui/src/components/alert-dialog.tsx',
      'packages/ui/src/components/combobox.tsx',
      'packages/ui/src/components/dialog.tsx',
      'packages/ui/src/components/dropdown-menu.tsx',
      'packages/ui/src/components/popover.tsx',
      'packages/ui/src/components/select.tsx',
      'packages/ui/src/components/sheet.tsx',
    ]
    for (const file of popupComponents) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} statically imports motion/react`).not.toMatch(/^import .* from 'motion\/react'/m)
      expect(source, `${file} bypasses the lazy boundary`).not.toContain('motion.div')
    }
    // The same rule holds for the deeper motion consumers: page-level
    // transitions and ambient animations reach `motion/react` exclusively
    // through `lazy-motion.tsx`, so the runtime is fetched when the first
    // animated element mounts instead of riding the owning route/widget
    // chunk as a static dependency (`useReducedMotion` is a hook and would
    // force a static import — `useMediaQuery` covers the same media query).
    const motionConsumers = [
      'packages/ui/src/public/widgets/Popup.tsx',
      'packages/ui/src/public/post/TableOfContents.tsx',
      'packages/ui/src/admin/musics/Equalizer.tsx',
      'packages/ui/src/admin/musics/MusicLibraryHero.tsx',
      'packages/ui/src/admin/musics/AdminMusicPlayerFloat.tsx',
      'packages/ui/src/admin/musics/MusicDetailView.tsx',
      'packages/ui/src/admin/musics/AddMusicView.tsx',
      'packages/ui/src/admin/images/JustifiedImageGrid.tsx',
    ]
    for (const file of motionConsumers) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} statically imports motion/react`).not.toMatch(/^import .* from 'motion\/react'/m)
      expect(source, `${file} bypasses the lazy boundary`).not.toMatch(/<motion\./)
      expect(source, `${file} bypasses the lazy boundary`).not.toContain('useReducedMotion')
    }
    const likeActions = readFileSync('packages/ui/src/public/LikeActions.tsx', 'utf8')
    expect(likeActions).not.toMatch(/^import .* from '@number-flow\/react'/m)
    expect(likeActions).toContain("lazy(() => import('@number-flow/react'))")

    // The rest of the public path follows the same rule: the root's
    // MotionConfig goes through `LazyMotionConfig`, the deeply-animated
    // public chrome (Popup, TableOfContents) is lazy-loaded at the call
    // site, so `motion/react` never rides the entry/public bundle.
    for (const rootFile of ['apps/core/src/root.tsx', 'apps/public/src/root.tsx']) {
      const root = readFileSync(rootFile, 'utf8')
      expect(root, `${rootFile} statically imports motion/react`).not.toMatch(/^import .* from 'motion\/react'/m)
    }
    const popupCallSites = [
      'packages/ui/src/public/Search.tsx',
      'packages/ui/src/public/friends/FriendApplyForm.tsx',
      'packages/ui/src/public/widgets/QRDialog.tsx',
    ]
    for (const file of popupCallSites) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} statically imports Popup`).not.toContain("from '@/ui/public/widgets/Popup'")
    }
    const detailChrome = readFileSync('packages/ui/src/public/post/DetailBodyChrome.tsx', 'utf8')
    // DetailBodyChrome statically imports TableOfContents — the TOC's
    // motion elements all render through `lazy-motion.tsx` (asserted above),
    // so `motion/react` still never rides the public bundle. A component-
    // level lazy boundary with a `fallback={null}` would drop the closed-
    // drawer DOM from SSR and mismatch on hydration (React error #418) —
    // that regression is pinned by tests/unit/ui/public/post/
    // toc-hydration.test.tsx instead.
    expect(detailChrome).toContain("import { TableOfContents } from '@kobato/ui/public/post/TableOfContents'")
  })

  it('sizes Button icons through data-icon instead of hand-written size classes', () => {
    const button = readFileSync('packages/ui/src/components/button.tsx', 'utf8')
    const offenders: string[] = []

    expect(button).toContain('[&_[data-icon]]')

    for (const file of files('packages/ui/src/admin', '-g', '*.tsx')) {
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
    for (const file of files('packages/ui/src', '-g', '*.tsx')) {
      const source = readFileSync(file, 'utf8')
      if (source.includes('className={`')) {
        offenders.push(file)
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the wp-decoy status text mirrored between server and ErrorView', () => {
    const server = readFileSync('packages/server/src/http/middlewares/wp-decoy.ts', 'utf8')
    const ui = readFileSync('packages/ui/src/public/chrome/ErrorView.tsx', 'utf8')

    expect(server).toContain("export const NOT_WORDPRESS_STATUS_TEXT = 'Not WordPress'")
    expect(ui).toContain("const NOT_WORDPRESS_STATUS_TEXT = 'Not WordPress'")
  })

  it('keeps solution math scrollable instead of clipping long formulas', () => {
    const publicCss = readFileSync('apps/public/src/styles/public.css', 'utf8')
    const tailwindCss = readFileSync('apps/core/src/styles/tailwind.css', 'utf8')

    expect(publicCss).not.toMatch(/\.post-content \.solution\s*\{[^}]*overflow:\s*hidden/s)
    expect(tailwindCss).not.toMatch(/\.post-content \.solution\s*\{[^}]*overflow:\s*hidden/s)
    expect(tailwindCss).toContain(':where(.math-display)')
    expect(tailwindCss).toContain('overflow-x: auto')
  })

  it('routes post / comment typography through @tailwindcss/typography', () => {
    const publicCss = readFileSync('apps/public/src/styles/public.css', 'utf8')
    const tailwindCss = readFileSync('apps/core/src/styles/tailwind.css', 'utf8')
    const commentItem = readFileSync('packages/ui/src/public/comments/comment-item/helpers.ts', 'utf8')

    expect(publicCss).not.toMatch(/^\s*\.post-content\s*\{/m)
    expect(publicCss).not.toMatch(/^\s*\.comment-content\s*\{/m)
    expect(tailwindCss).toMatch(/@utility\s+prose-blog\s*\{/)
    expect(tailwindCss).toMatch(/&\.post-content\s*\{/)
    expect(tailwindCss).toMatch(/&\.comment-content\s*\{/)
    expect(publicCss).not.toMatch(/@import\s+['"][^'"]*ui\/post\/post\.css['"]/)
    expect(existsSync('packages/ui/src/post/post.css')).toBe(false)

    expect(tailwindCss).toContain("@plugin '@tailwindcss/typography'")
    expect(tailwindCss).toMatch(/--code-bg:\s*rgb\(253,\s*246,\s*227\);/)

    // Typography colours are driven by a shared --prose-blog-* slot table
    // so light and invert ladders read from the same source.
    for (const slot of [
      'body',
      'headings',
      'lead',
      'links',
      'bold',
      'counters',
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
    const tailwindCss = readFileSync('apps/core/src/styles/tailwind.css', 'utf8')
    expect(tailwindCss).toMatch(/&\.post-content\s*\{/)
    expect(tailwindCss).toMatch(/&\.comment-content\s*\{/)

    const detailChrome = readFileSync('packages/ui/src/public/post/DetailBodyChrome.tsx', 'utf8')
    const commentItem = readFileSync('packages/ui/src/public/comments/comment-item/helpers.ts', 'utf8')

    expect(detailChrome).toMatch(/cn\(\s*'post-content'\s*,/)
    expect(commentItem).toMatch(/cn\(\s*'comment-content'\s*,/)

    expect(existsSync('packages/ui/src/lib/wp-compat.ts')).toBe(false)
    const offenders = files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes("from '@/ui/lib/wp-compat'")
    })
    expect(offenders).toEqual([])
  })

  it('owns popup outside-click dismissal inside Popup (backdrop), with no data-popup-id protocol', () => {
    const popup = readFileSync('packages/ui/src/public/widgets/Popup.tsx', 'utf8')
    // The full-viewport fixed backdrop calls onClose: while open the rest of
    // the document is inert, so every outside click lands there.
    expect(popup).toMatch(/fixed inset-0 bg-scrim\/80 backdrop-blur-sm/)
    expect(popup).toMatch(/onClick=\{onClose\}/)
    expect(popup).not.toMatch(/popupId/)
    expect(popup).not.toMatch(/data-popup-id/)
    expect(popup).not.toMatch(/^\s*className\?:\s*string/m)

    const qr = readFileSync('packages/ui/src/public/widgets/QRDialog.tsx', 'utf8')
    expect(qr).not.toMatch(/data-popup-id/)
    expect(qr).not.toMatch(/document\.addEventListener\('click'/)

    const search = readFileSync('packages/ui/src/public/Search.tsx', 'utf8')
    expect(search).not.toMatch(/data-popup-id/)
    expect(search).not.toMatch(/document\.addEventListener\('click'/)
  })

  it('keeps the public UI free of dead exports and one-use comment pass-throughs', () => {
    const musicPlayer = readFileSync('packages/editor/src/renderer/blocks/MusicPlayer.tsx', 'utf8')
    expect(musicPlayer).not.toMatch(/MusicPlayerInitHost|scheduleMusicPlayerInit/)

    const footnotes = readFileSync('packages/editor/src/renderer/Footnotes.tsx', 'utf8')
    expect(footnotes).not.toMatch(/FootnoteDefinition|stripBackrefs|isBackref/)

    const comments = readFileSync('packages/ui/src/public/comments/Comments.tsx', 'utf8')
    expect(comments).not.toMatch(/export\s+function\s+createCommentTreeState/)
    expect(comments).not.toMatch(/export\s+const\s+commentTreeReducer/)
    expect(comments).not.toMatch(/export\s+type\s+\{\s*CommentTreeAction,\s*CommentTreeState\s*\}/)
    expect(existsSync('packages/ui/src/public/comments/Comment.tsx')).toBe(false)

    const pageDetailBody = readFileSync('packages/ui/src/public/post/PageDetailBody.tsx', 'utf8')
    expect(pageDetailBody).not.toMatch(/export\s+type\s+\{\s*DraftMarker\s*\}/)

    const commentBodyEditor = readFileSync(
      'packages/editor/src/comments-editor/lexical/LexicalCommentEditor.tsx',
      'utf8',
    )
    expect(commentBodyEditor).not.toMatch(/export\s+type\s+\{\s*Editor\s*\}/)
  })

  it('keeps the public chrome, audio controls, and detail flags at their owning modules', () => {
    expect(existsSync('packages/ui/src/public/chrome/PublicChrome.tsx')).toBe(false)

    const baseLayout = readFileSync('packages/ui/src/public/chrome/BaseLayout.tsx', 'utf8')
    expect(baseLayout).toMatch(/import ['"]@\/styles\/public\.css['"]/)

    const audioControl = readFileSync('packages/ui/src/public/aplayer/hooks/use-audio-control.ts', 'utf8')
    expect(audioControl).toMatch(/export\s+type\s+AudioControl\s*=\s*ReturnType<typeof useAudioControl>/)

    const playbackControls = readFileSync('packages/ui/src/public/aplayer/controller.tsx', 'utf8')
    expect(playbackControls).toMatch(/control:\s*AudioControl/)
    expect(playbackControls).not.toMatch(/audioDurationSeconds/)

    const detailChrome = readFileSync('packages/ui/src/public/post/DetailBodyChrome.tsx', 'utf8')
    expect(detailChrome).toMatch(/showUpdated\?:\s*boolean/)
    expect(detailChrome).toMatch(/toc\?:\s*boolean/)
    expect(detailChrome).toMatch(/comments\?:\s*boolean/)
    expect(detailChrome).not.toMatch(/'shown'\s*\|\s*'hidden'|'enabled'\s*\|\s*'disabled'/)

    const catalog = readFileSync('packages/shared/src/types/catalog.ts', 'utf8')
    expect(catalog).toMatch(/export\s+type\s+DraftMarker\s*=/)
    const draftMarkerDefinitions = files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx').filter((file) =>
      /type\s+DraftMarker\s*=/.test(readFileSync(file, 'utf8')),
    )
    expect(draftMarkerDefinitions).toEqual(['packages/shared/src/types/catalog.ts'])
  })

  it('derives shared settings and comment contracts from their canonical owners', () => {
    const commentSchema = readFileSync('packages/shared/src/legacy-pt/comment-schema.ts', 'utf8')
    expect(commentSchema).toMatch(/textBlockSchema\.extend\(/)

    const display = readFileSync('packages/shared/src/config/display.ts', 'utf8')
    expect(display).not.toMatch(/\bto:\s*['"]\/admin\/settings['"]/)
    expect(display).not.toMatch(/SECTION_DISPLAY_LIST/)

    const settingsRoute = readFileSync('apps/core/src/routes/admin/settings/index.tsx', 'utf8')
    expect(settingsRoute).toMatch(/Assert<\s*Equals<\(typeof SECTION_CONFIGS\)\[number\]\['id'\], SettingsSection>\s*>/)
    expect(settingsRoute).toMatch(
      /Assert<\s*Equals<\(typeof SECTION_CONFIGS\)\['length'\], \(typeof SETTINGS_SECTIONS\)\['length'\]>\s*>/,
    )
  })

  it('keeps pool wiring and low-level test helpers at their canonical owners', () => {
    const lifecycle = readFileSync('packages/server/src/bootstrap/db-lifecycle.ts', 'utf8')
    expect(lifecycle).toMatch(/function wireDatabase\(/)

    expect(existsSync('packages/test-utils/tests/_helpers/request.ts')).toBe(false)
    const dbHelper = readFileSync('packages/test-utils/tests/_helpers/db.ts', 'utf8')
    expect(dbHelper).toMatch(/export\s+function\s+seedMetric/)
    expect(dbHelper).not.toMatch(/afterEach|\bvi\.|spyQueryModule|resetSeedIds|seedComment|seedUser|seedLike/)

    const likeOperations = readFileSync('packages/server/src/infra/db/operations/like.ts', 'utf8')
    const metricOperations = readFileSync('packages/server/src/infra/db/operations/metric.ts', 'utf8')
    const imageProcess = readFileSync('packages/server/src/infra/image/process.ts', 'utf8')
    expect(likeOperations).not.toMatch(/export\s+\{\s*targetKey\s*\}/)
    expect(metricOperations).not.toMatch(/export\s+\{\s*targetKey\s*\}/)
    expect(imageProcess).not.toMatch(/export\s+type\s+\{/)
  })

  it('owns PNG emission and OG rendering in the images resource', () => {
    const images = readFileSync('packages/server/src/http/resources/images.ts', 'utf8')
    expect(images).toMatch(/function respondPng\(/)
    expect(images).toMatch(/function createOgHandler\(/)
    expect(images.match(/c\.header\('Content-Type', 'image\/png'\)/g)).toHaveLength(1)
    expect(images.match(/drawOpenGraph\(/g)).toHaveLength(1)
  })

  it('routes icon-button content through @/ui/components/icon-button-content', () => {
    expect(existsSync('packages/ui/src/components/icon-button-content.tsx')).toBe(true)
    const component = readFileSync('packages/ui/src/components/icon-button-content.tsx', 'utf8')
    expect(component).toMatch(/export\s+function\s+IconButtonContent\b/)
    expect(component).toMatch(/absolute top-0 flex size-full items-center justify-center/)

    const offenders = files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx')
      .filter((file) => file !== 'packages/ui/src/components/icon-button-content.tsx')
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return source.includes('absolute top-0 flex size-full items-center justify-center')
      })
    expect(offenders).toEqual([])
  })

  it('keeps ScrollTopButton on the GPU-layer / opacity toggle (mobile rendering-ghost fix)', () => {
    // iOS Safari snapshots fixed-position layers into the compositor.
    // A display toggle invalidates the layer mid-frame, leaving a ghost
    // during inertial scroll. Opacity + pointer-events avoids that.
    const scrollTop = readFileSync('packages/ui/src/public/chrome/ScrollTopButton.tsx', 'utf8')
    expect(scrollTop).toMatch(/\btransform-gpu\b/)
    expect(scrollTop).toMatch(/\bopacity-0\b/)
    expect(scrollTop).toMatch(/\bopacity-100\b/)
    expect(scrollTop).toMatch(/\bpointer-events-none\b/)
    expect(scrollTop).not.toMatch(/show\s*\?\s*'block'\s*:\s*'hidden'/)
    expect(scrollTop).not.toMatch(/show\s*\?\s*'hidden'\s*:\s*'block'/)

    const baseLayout = readFileSync('packages/ui/src/public/chrome/BaseLayout.tsx', 'utf8')
    expect(baseLayout).toMatch(/\btransform-gpu\b/)
  })

  it('centralises all process.env access in config.ts, hono/dev.ts, and the SEA runtime modules', () => {
    const offenders: string[] = []
    // Exceptions beyond config.ts / dev.ts:
    // - sea.ts / sea-natives.ts / native-require.ts (SEA packaging):
    //   `KOBATO_NATIVES_DIR` is runtime state written by the SEA
    //   bootstrap (`bootstrapSeaRuntime`) and read lazily by
    //   `requireExternal` / `nativeRequire` at call time — the validated
    //   `serverConfig` snapshot cannot model a value assigned after
    //   module load. `KOBATO_CACHE_DIR` / `XDG_CACHE_HOME` are read
    //   before the config module's validation runs. These modules must
    //   also stay dependency-light because the SEA bundles inline them
    //   ahead of the app graph.
    const allowed = new Set([
      // The configuration module owns the process.env reads: it resolves
      // `__`-convention env vars over kobato.config.json at module load.
      'packages/server/src/infra/config.ts',
      'packages/server/src/infra/hono/dev.ts',
      'packages/server/src/infra/sea.ts',
      'packages/server/src/infra/sea-natives.ts',
      'packages/server/src/infra/native-require.ts',
      // The frontend app's env face (monorepo plan stage 1 + headless
      // stage 3): PORT / CORE_API_URL / CORE_PUBLIC_URL are deployment
      // wiring for the official public SSR service — deliberately NOT part
      // of the core config file mechanism (the plan forbids spreading
      // kobato.config.json / CONFIG_TABLE to the frontend). `server__port`
      // is honored as the harness convention from the SEA smoke lifecycle
      // (bootServer injects it for both binary lines). Read in the
      // frontend server entry only.
      'apps/public/src/server.ts',
    ])
    for (const file of files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx')) {
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
    // The native packages (sharp, @napi-rs/canvas) are STATICALLY
    // imported and inlined into the SEA bundles; the
    // redirect-native-requires plugin rewrites their internal platform
    // loads to `nativeRequire` (see `src/server/infra/native-require.ts`).
    // The inverted hazard: a `requireExternal('sharp' |
    // '@napi-rs/canvas')` call site would hide the package from the
    // bundler and crash under SEA (no node_modules tree to resolve
    // against). Pin both halves of the mechanism:
    //
    //   1. no source file requires the native packages through
    //      requireExternal (static imports only);
    //   2. the redirect plugin exists and the SEA bundle config wires it —
    //      without it the static imports would drag the platform `.node`
    //      loads into the bundle and the build would fail.
    const offenders: string[] = []
    const nativeRequireExternal = /requireExternal(?:<[^>]*>)?\(\s*['"](?:sharp|@napi-rs\/canvas)(?:\/[^'"]*)?['"]/
    for (const file of files(...SRC_ROOTS, '-g', '*.ts', '-g', '*.tsx')) {
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
    expect(plugin).toMatch(/@kobato\/server\/infra\/native-require/)
    const seaConfig = readFileSync('vite.sea.config.ts', 'utf8')
    expect(seaConfig).toMatch(/redirectNativeRequiresPlugin\(\)/)
  })
})

describe('contract checker internals (the scanners catch their own escape shapes)', () => {
  // These pin the scanner helpers against the escape shapes the checks
  // exist to catch — without them a scanner regression would silently
  // neuter every layer check above while the suite stays green.
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
