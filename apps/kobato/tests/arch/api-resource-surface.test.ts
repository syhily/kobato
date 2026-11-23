import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path/posix'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const API_LITERAL = /['"`](\/api\/[^'"`]+)['"`]/g
const RESOURCE_PATHS = new Set<string>()
const RESOURCE_PREFIXES = ['/api/rum/intake/'] as const
const RETIRED_JSON_ROUTES = [
  '/api/admin/backup/restore-status',
  '/api/admin/backup/restore-progress',
  '/api/admin/backup/upload-restore/decrypt',
  '/api/admin/branding/clear',
  '/api/admin/backup/upload-restore',
  '/api/admin/branding/upload',
  '/api/admin/fonts/upload',
  '/api/admin/fonts/package/upload',
  '/api/admin/maxmind/upload',
  '/api/analytics/env',
  '/api/analytics/events',
  '/api/rum/status',
  '/api/setup/restore',
] as const
const TELEMETRY_POLICY = 'packages/web/client/src/lib/rum/rum-url-policy.ts'
const OUTBOUND_API_PREFIXES = [
  'packages/server/src/domains/music/providers/',
  'packages/server/src/domains/observability/',
] as const

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) {
    return
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function apiLiterals(file: string): string[] {
  const source = stripComments(readFileSync(file, 'utf8'))
  return [...source.matchAll(API_LITERAL)].map((match) => match[1]!)
}

function productionFiles(): string[] {
  const files: string[] = []
  walk(join(REPO_ROOT, 'packages/server/src'), files)
  walk(join(REPO_ROOT, 'packages/web'), files)
  return files.filter((file) => {
    const relativeFile = relative(REPO_ROOT, file)
    return !file.includes('/tests/') && !OUTBOUND_API_PREFIXES.some((prefix) => relativeFile.startsWith(prefix))
  })
}

function isResourcePath(path: string): boolean {
  return RESOURCE_PATHS.has(path) || RESOURCE_PREFIXES.some((prefix) => path.startsWith(prefix))
}

describe('HTTP resource surface', () => {
  it('keeps retired JSON operations on oRPC only', () => {
    const offenders = productionFiles().flatMap((file) =>
      apiLiterals(file)
        .filter((path) => RETIRED_JSON_ROUTES.some((retired) => path === retired))
        .map((path) => `${relative(REPO_ROOT, file)}: ${path}`),
    )
    expect(offenders).toEqual([])
  })

  it('allows /api paths only for the OpenObserve intake and other external protocol resources', () => {
    const offenders = productionFiles().flatMap((file) => {
      const relativeFile = relative(REPO_ROOT, file)
      if (relativeFile === TELEMETRY_POLICY) {
        return []
      }
      return apiLiterals(file)
        .filter((path) => !isResourcePath(path))
        .map((path) => `${relativeFile}: unregistered resource ${path}`)
    })
    expect(offenders).toEqual([])
  })

  it('keeps health probes as resources and has no retired route in the resource registry', () => {
    const pipeline = readFileSync(join(REPO_ROOT, 'packages/server/src/http/middleware-pipeline.ts'), 'utf8')
    expect(pipeline).toContain("app.get('/health'")
    expect(pipeline).toContain("app.get('/ready'")
    for (const retired of RETIRED_JSON_ROUTES) {
      expect(pipeline).not.toContain(retired)
    }
    expect(pipeline).not.toContain('/admin/music/proxy/')
    expect(pipeline).not.toContain('/api/admin/backup/download/')
  })
})
