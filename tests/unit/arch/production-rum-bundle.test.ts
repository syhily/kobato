// Production-bundle proof for the released browser RUM capability:
// - the slim RUM SDK must ship as a LAZY client chunk — physically absent from
//   the eager entry/root graph and from the warmup manifest, so a visitor of a
//   site without an active `observability` frontend configuration never
//   downloads it;
// - no browser RUM code may appear in the server bundle (the client loader is
//   the only edge, and `import.meta.env.SSR` prunes it from the server graph);
// - the server OTel implementation stays a released capability, so the server
//   bundle is expected to CARRY it (reached through a dynamic import the build
//   code-splits).
// This test runs after `pnpm build` (CI invokes it explicitly in the build job;
// the ordinary suite skips without build output).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const CLIENT_DIR = join(PROJECT_ROOT, 'build/client')
const SERVER_DIR = join(PROJECT_ROOT, 'build/server')

/** Runtime string literals shipped only by the slim RUM SDK (never the loader). */
const RUM_SDK_MARKERS = ['o2-api-key', 'x-openobserve-trace-id', 'o2-evp-origin'] as const

/** A loader-only marker: the RUM status poll path. */
const RUM_LOADER_MARKER = '/api/rum/status'

/**
 * Anything that would prove browser RUM code reached a server bundle.
 * `o2-api-key` is deliberately ABSENT: the server rewrites that query parameter
 * in the same-origin intake relay (`http/resources/rum-intake.ts`), so the
 * literal is server-owned.
 */
const SERVER_FORBIDDEN_RUM_MARKERS = ['@openobserve/', 'x-openobserve-trace-id', 'o2-evp-origin'] as const

/** The Rollup/Rolldown entry + root chunks of the client document graph. */
const EAGER_CHUNK_PATTERNS = [/\/entry\.client-[^/]+\.js$/, /\/root-[^/]+\.js$/] as const

const SERVER_OTEL_MARKERS = ['OTLPTraceExporter', 'BatchSpanProcessor', 'PeriodicExportingMetricReader'] as const

function walk(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      walk(path, files)
    } else if (/\.(?:js|mjs|cjs)$/.test(entry)) {
      files.push(path)
    }
  }
}

function bundleFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return []
  }
  const files: string[] = []
  walk(dir, files)
  return files
}

function read(path: string): string {
  return readFileSync(path, 'utf-8')
}

function containsAny(path: string, markers: readonly string[]): boolean {
  const text = read(path)
  return markers.some((marker) => text.includes(marker))
}

/** Every chunk URL the warmup plugin may preload (tier1 + the idle tiers). */
function preloadedClientChunks(): Set<string> {
  const manifestPath = join(CLIENT_DIR, 'assets', 'warmup-manifest.json')
  expect(existsSync(manifestPath), 'warmup manifest is missing from the client build').toBe(true)
  const parsed = JSON.parse(read(manifestPath)) as Record<string, unknown>
  const chunks = new Set<string>()
  for (const value of Object.values(parsed)) {
    if (!Array.isArray(value)) {
      continue
    }
    for (const entry of value) {
      if (typeof entry === 'string') {
        chunks.add(entry.replace(/^\/assets\//, ''))
      }
    }
  }
  return chunks
}

const available = existsSync(CLIENT_DIR) && existsSync(SERVER_DIR)
const required = process.env.KOBATO_REQUIRE_PRODUCTION_BUILD === '1'

if (required && !available) {
  throw new Error(
    'KOBATO_REQUIRE_PRODUCTION_BUILD=1 but build/client or build/server is missing; the production guard must not silently skip.',
  )
}

describe.skipIf(!available)('production bundle telemetry composition', () => {
  it('ships the browser RUM SDK as a separate lazy client chunk, never in the eager graph', () => {
    const clientFiles = bundleFiles(CLIENT_DIR)
    const eagerFiles = clientFiles.filter((file) => EAGER_CHUNK_PATTERNS.some((pattern) => pattern.test(file)))
    expect(eagerFiles.length, 'the client entry/root chunks were not found').toBeGreaterThan(0)

    const sdkFiles = clientFiles.filter((file) => containsAny(file, RUM_SDK_MARKERS))
    expect(sdkFiles.length, 'the browser RUM SDK chunk is missing from the client build').toBeGreaterThan(0)

    const loaderFiles = clientFiles.filter((file) => read(file).includes(RUM_LOADER_MARKER))
    expect(loaderFiles.length, 'the RUM loader chunk is missing from the client build').toBeGreaterThan(0)

    // The eager document graph must stay RUM-free in its own bytes…
    for (const eager of eagerFiles) {
      for (const marker of [...RUM_SDK_MARKERS, RUM_LOADER_MARKER]) {
        expect(read(eager), `${relative(PROJECT_ROOT, eager)} contains ${marker}`).not.toContain(marker)
      }
    }
    // …and the SDK loader must be a distinct chunk, not an eager file.
    for (const sdkFile of sdkFiles) {
      expect(eagerFiles, `${relative(PROJECT_ROOT, sdkFile)} is an eager chunk`).not.toContain(sdkFile)
    }

    // Nothing RUM-bearing may be preloaded: an unconfigured site never fetches it.
    const preloaded = preloadedClientChunks()
    for (const file of [...sdkFiles, ...loaderFiles]) {
      expect(preloaded.has(file.slice(file.lastIndexOf('/') + 1))).toBe(false)
    }
  })

  it('carries no browser RUM marker in the server bundle', () => {
    const offenders: string[] = []
    for (const file of bundleFiles(SERVER_DIR)) {
      const text = read(file)
      for (const marker of SERVER_FORBIDDEN_RUM_MARKERS) {
        if (text.includes(marker)) {
          offenders.push(`${relative(PROJECT_ROOT, file)} contains ${marker}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('carries the server OTel implementation in the server bundle', () => {
    const text = bundleFiles(SERVER_DIR)
      .map((file) => read(file))
      .join('\n')
    for (const marker of SERVER_OTEL_MARKERS) {
      expect(text, `server bundle is missing ${marker}`).toContain(marker)
    }
  })
})
