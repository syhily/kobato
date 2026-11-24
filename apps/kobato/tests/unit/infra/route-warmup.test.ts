import { TIER1_ROUTES, tier2BucketForRouteId } from '@kobato/pack/vite/route-warmup'
import { describe, expect, it } from 'vitest'

import routes from '@/routes'

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
      const bucket =
        TIER1_ROUTES.includes(manifestId) || TIER1_ROUTES.includes(baseId)
          ? 'tier1'
          : (tier2BucketForRouteId(manifestId) ?? tier2BucketForRouteId(baseId))
      expect(
        bucket,
        `route "${manifestId}" (file ${entry.file}) is not covered by any warmup tier — ` +
          'add it to TIER1_ROUTES or mount it under a routes/{public,admin,editor,auth}/ prefix',
      ).not.toBeNull()
    }
  })
})
