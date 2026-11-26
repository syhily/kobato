import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const CLIENT_DIR = join(PROJECT_ROOT, 'apps/kobato/build/client')
const SERVER_DIR = join(PROJECT_ROOT, 'apps/kobato/build/server')

const RUM_SDK_MARKERS = ['o2-api-key', 'x-openobserve-trace-id', 'o2-evp-origin'] as const

const RUM_LOADER_MARKER = '/api/rum/intake'

const SERVER_FORBIDDEN_RUM_MARKERS = ['@openobserve/', 'x-openobserve-trace-id', 'o2-evp-origin'] as const

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

const available = existsSync(CLIENT_DIR) && existsSync(SERVER_DIR)
const required = process.env.KOBATO_REQUIRE_PRODUCTION_BUILD === '1'

if (required && !available) {
  throw new Error(
    'KOBATO_REQUIRE_PRODUCTION_BUILD=1 but build/client or build/server is missing; the production guard must not silently skip.',
  )
}

describe.skipIf(!available)('production bundle telemetry composition', () => {
  it('ships no browser RUM SDK chunk in the workspace client bundle', () => {
    const offenders = bundleFiles(CLIENT_DIR).filter((file) =>
      containsAny(file, [...RUM_SDK_MARKERS, RUM_LOADER_MARKER]),
    )
    expect(offenders.map((file) => relative(PROJECT_ROOT, file))).toEqual([])
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
