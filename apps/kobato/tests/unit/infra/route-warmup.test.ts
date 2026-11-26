import { tier2BucketForRouteId } from '@kobato/pack/vite/route-warmup'
import { describe, expect, it } from 'vitest'

import routes from '@/routes'

const WORKSPACE_TIER1_ROUTES = ['root', 'routes/admin/layout', 'routes/admin/dashboard']

const WORKSPACE_TIER2_PREFIXES = [
  ['routes/admin/', 'admin'],
  ['routes/editor/', 'editor'],
  ['routes/auth/', 'auth'],
] as const

const WARMUP_EXEMPT_ROUTES = ['routes/not-found', 'routes/not-found-splat']

describe('route-warmup tier derivation — src/routes.ts coverage', () => {
  interface RouteEntry {
    file: string
    id?: string
  }

  function flatten(entries: unknown[]): RouteEntry[] {
    const out: RouteEntry[] = []
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      if ('file' in entry) {
        out.push(entry as RouteEntry)
      }
      if ('children' in entry && Array.isArray((entry as { children?: unknown }).children)) {
        out.push(...flatten((entry as { children: unknown[] }).children))
      }
    }
    return out
  }

  it('every route declared in src/routes.ts lands in exactly one warmup bucket', () => {
    for (const entry of flatten(routes)) {
      const baseId = entry.file.replace(/\.tsx$/, '')
      const manifestId = entry.id ?? baseId
      if (WARMUP_EXEMPT_ROUTES.includes(manifestId)) {
        continue
      }
      const bucket =
        WORKSPACE_TIER1_ROUTES.includes(manifestId) || WORKSPACE_TIER1_ROUTES.includes(baseId)
          ? 'tier1'
          : (tier2BucketForRouteId(manifestId, WORKSPACE_TIER2_PREFIXES) ??
            tier2BucketForRouteId(baseId, WORKSPACE_TIER2_PREFIXES))
      expect(
        bucket,
        `route "${manifestId}" (file ${entry.file}) is not covered by any warmup tier — ` +
          'add it to tier1Routes or mount it under a routes/{admin,editor,auth}/ prefix',
      ).not.toBeNull()
    }
  })

  it('pins the not-found pair as the only warmup exemption — it renders null behind the root ErrorBoundary', () => {
    const ids = new Set(flatten(routes).map((entry) => entry.id ?? entry.file.replace(/\.tsx$/, '')))
    expect(WARMUP_EXEMPT_ROUTES).toEqual(['routes/not-found', 'routes/not-found-splat'])
    for (const id of WARMUP_EXEMPT_ROUTES) {
      expect(ids.has(id), `exempt route ${id} is no longer mounted in src/routes.ts`).toBe(true)
    }
  })

  it('pins the workspace tiering that vite.config.ts passes to routeWarmupPlugin', () => {
    expect(WORKSPACE_TIER1_ROUTES).toEqual(['root', 'routes/admin/layout', 'routes/admin/dashboard'])
    expect(WORKSPACE_TIER2_PREFIXES.map(([prefix]) => prefix)).toEqual([
      'routes/admin/',
      'routes/editor/',
      'routes/auth/',
    ])
  })
})
