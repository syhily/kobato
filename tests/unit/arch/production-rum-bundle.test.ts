// ADR-0012 production-bundle proof: the real RUM SDK and the server OTel
// provider/exporter implementation must be physically absent, not merely
// disabled at runtime. This test runs after `pnpm build` (CI invokes it
// explicitly in the build job; the ordinary suite skips without build output).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const BUILD_DIRS = ['build/client', 'build/server'].map((dir) => join(PROJECT_ROOT, dir))

const FORBIDDEN_MARKERS = [
  '@openobserve/',
  '@openobserve/browser-rum-slim',
  'openobserve-rum-slim',
  'O2_RUM',
  'o2-api-key',
  'o2-evp-origin',
  'o2source=',
  'x-openobserve-trace-id',
  'x-openobserve-origin',
  'startSessionReplayRecording',
  // Server-only OTel implementation markers: production may keep the tiny
  // pass-through facade, but no provider/exporter/processor/context manager.
  '@opentelemetry/',
  'OTLPTraceExporter',
  'OTLPMetricExporter',
  'OTLPLogExporter',
  'BatchSpanProcessor',
  'BatchLogRecordProcessor',
  'LoggerProvider',
  'PeriodicExportingMetricReader',
  'AsyncLocalStorageContextManager',
] as const

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

function bundleFiles(): string[] {
  const files: string[] = []
  for (const dir of BUILD_DIRS) {
    if (existsSync(dir)) {
      walk(dir, files)
    }
  }
  return files
}

const available = BUILD_DIRS.every((dir) => existsSync(dir))
const required = process.env.KOBATO_REQUIRE_PRODUCTION_BUILD === '1'

if (required && !available) {
  throw new Error(
    'KOBATO_REQUIRE_PRODUCTION_BUILD=1 but build/client or build/server is missing; the production guard must not silently skip.',
  )
}

describe.skipIf(!available)('production bundle excludes frontend RUM and server OTel implementations', () => {
  it('contains no OpenObserve/RUM marker or server OTel implementation', () => {
    const offenders: string[] = []
    for (const file of bundleFiles()) {
      const text = readFileSync(file, 'utf-8')
      for (const marker of FORBIDDEN_MARKERS) {
        if (text.includes(marker)) {
          offenders.push(`${relative(PROJECT_ROOT, file)} contains ${marker}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
