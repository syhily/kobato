import { tier2BucketForRouteId } from '@kobato/shared/constants/route-warmup'
import { describe, expect, it } from 'vitest'

import routes from '@/routes'
import { TIER1_ROUTES, TIER2_PREFIXES } from '@/warmup'

// Per-app half of the route-warmup coverage contract (the server-package
// half lives in packages/server/tests/unit/infra/route-warmup.test.ts).
// Every route declared in the core app's route table must land in exactly
// one warmup tier, or the route never gets proactive preloads.

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

describe('route-warmup tier derivation — apps/core routes.ts coverage', () => {
  it('every route declared in routes.ts lands in exactly one warmup bucket', () => {
    for (const entry of flatten(routes)) {
      // React Router derives the manifest ID from the file path; an
      // explicit `id` overrides it (paginated aliases). Aliases share the
      // base file's chunk, so the base ID's bucket covers them.
      const baseId = entry.file.replace(/\.tsx$/, '')
      const manifestId = entry.id ?? baseId
      const tier1 = TIER1_ROUTES as readonly string[]
      const bucket =
        tier1.includes(manifestId) || tier1.includes(baseId)
          ? 'tier1'
          : (tier2BucketForRouteId(manifestId, TIER2_PREFIXES) ?? tier2BucketForRouteId(baseId, TIER2_PREFIXES))
      expect(
        bucket,
        `route "${manifestId}" (file ${entry.file}) is not covered by any warmup tier — ` +
          'add it to TIER1_ROUTES or mount it under a routes/{public,admin,editor,auth}/ prefix',
      ).not.toBeNull()
    }
  })
})
