/**
 * Public-bundle product guard (plan stage 3 §4).
 *
 * The public app depends on the whole `@kobato/ui` package — including the
 * ~38k-line admin side — and on `@kobato/editor` (engine + renderer +
 * comments-editor). Vite tree-shaking is what keeps admin/engine modules
 * out of the shipped client bundle; this guard is the regression fence for
 * the day a side-effectful admin module starts riding a public import
 * path (a silent kilobyte-and-route leak that source-level scans cannot
 * see once the import graph looks clean).
 *
 * It asserts on the BUILD PRODUCTS (`apps/public/build/client/`), so it
 * only runs when a build exists — a plain `pnpm run test` before any
 * build skips the suite; the CI/verification flow builds first and then
 * tests. The scans:
 *
 *   1. chunk names — Vite names chunks after the owning module, so a
 *      bundled admin route/component shows up as an `admin-*` /
 *      `Admin*` chunk;
 *   2. admin module-path markers in chunk text — `src/admin/`,
 *      `ui/admin/`, `routes/admin/` literals (lazy-import specifiers and
 *      the route-warmup manifest materialize module paths as strings);
 *      the public UI's *user-facing* `/admin/...` links are fine and are
 *      NOT matched;
 *   3. editor engine markers — the engine must never ride the public
 *      bundle (the comments-editor chunk is legitimate and does not
 *      match);
 *   4. `@kobato/server` / `packages/server` markers — the headless
 *      double-insurance at product level (boundaries.test.ts pins the
 *      source level);
 *   5. the route-warmup tier table — the public app's tier-2
 *      admin/editor/auth buckets must stay empty (the manifest embeds
 *      chunk paths, so a leaked admin chunk would appear there too).
 *
 * The marker scans are tripwires, not proofs — a leak whose module path
 * never surfaces as a string and whose chunk name avoids `admin` would
 * evade them, but every current leak shape (lazy imports, warmup
 * manifest, chunk naming) is covered, and the fixture tripwires pin the
 * scanners themselves.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const CLIENT_DIR = join(PROJECT_ROOT, 'apps/public/build/client')

/** Chunk names that only appear when an admin module is bundled. */
const ADMIN_CHUNK_NAME_RE = /(^|[-_.])admin[-_.]|^Admin[A-Z]/i

/** Module-path literals that surface admin-side modules as strings. */
const ADMIN_MODULE_MARKERS = ['src/admin/', 'ui/admin/', '@kobato/ui/admin', 'routes/admin/']

/** Editor engine module paths — the engine must never ride the public bundle. */
const ENGINE_MARKERS = ['@kobato/editor/engine', 'editor/engine/']

/** Server-package references — headless double-insurance at product level. */
const SERVER_MARKERS = ['@kobato/server', 'packages/server/']

function walk(dir: string, callback: (filePath: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, callback)
    } else {
      callback(full)
    }
  }
}

function clientJsFiles(): string[] {
  const files: string[] = []
  walk(CLIENT_DIR, (file) => {
    if (file.endsWith('.js') || file.endsWith('.json')) {
      files.push(file)
    }
  })
  return files
}

function findMarker(source: string, markers: string[]): string | null {
  return markers.find((marker) => source.includes(marker)) ?? null
}

const hasClientBuild = existsSync(CLIENT_DIR)

describe.skipIf(!hasClientBuild)('public client bundle guard (product-level, stage 3 §4)', () => {
  const files = clientJsFiles()
  const sources = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]))

  it('emits no admin-named chunks', () => {
    const offenders = files
      .map((file) => file.slice(CLIENT_DIR.length + 1))
      .filter((rel) => ADMIN_CHUNK_NAME_RE.test(rel))
    expect(offenders).toEqual([])
  })

  it('contains no admin module-path markers in any chunk', () => {
    const offenders: string[] = []
    for (const [file, source] of sources) {
      const marker = findMarker(source, ADMIN_MODULE_MARKERS)
      if (marker !== null) {
        offenders.push(`${file.slice(CLIENT_DIR.length + 1)} contains '${marker}'`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the editor engine out of the public bundle', () => {
    const offenders: string[] = []
    for (const [file, source] of sources) {
      const marker = findMarker(source, ENGINE_MARKERS)
      if (marker !== null) {
        offenders.push(`${file.slice(CLIENT_DIR.length + 1)} contains '${marker}'`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps @kobato/server out of the public client products', () => {
    const offenders: string[] = []
    for (const [file, source] of sources) {
      const marker = findMarker(source, SERVER_MARKERS)
      if (marker !== null) {
        offenders.push(`${file.slice(CLIENT_DIR.length + 1)} contains '${marker}'`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the route-warmup tier-2 admin/editor/auth buckets empty', () => {
    const manifestPath = join(CLIENT_DIR, 'assets', 'warmup-manifest.json')
    expect(existsSync(manifestPath)).toBe(true)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    for (const bucket of ['tier2_admin', 'tier2_editor', 'tier2_auth']) {
      expect(manifest[bucket], `${bucket} must stay empty in the public manifest`).toEqual([])
    }
    expect(Array.isArray(manifest.tier1)).toBe(true)
    expect((manifest.tier1 as unknown[]).length).toBeGreaterThan(0)
  })

  it('tripwire: the admin marker scan flags admin module paths', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'public-bundle-guard-'))
    try {
      const fixture = join(fixtureRoot, 'chunk.js')
      writeFileSync(fixture, "export const x = 1\n// lazy admin route\nimport('./src/admin/settings/index')\n")
      const source = readFileSync(fixture, 'utf8')
      expect(findMarker(source, ADMIN_MODULE_MARKERS)).toBe('src/admin/')
      expect(findMarker(source, ENGINE_MARKERS)).toBeNull()
      expect(findMarker(source, SERVER_MARKERS)).toBeNull()
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })
})
