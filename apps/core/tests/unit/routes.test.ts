import { describe, expect, it } from 'vitest'

import routes from '@/routes'

// Admin URL contract for the core app (admin SSR + API + URL endpoints).
// AGENTS.md is explicit: "public URL / feed URL / stable". This file pins
// the admin routes in the core manifest so any rename forces an explicit
// test update. The public-side URL stability contract lives in
// apps/public/tests/unit/routes.test.ts.

interface RouteEntry {
  path?: string
  file: string
  id?: string
  index?: boolean
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

describe('contract: core admin URL stability', () => {
  const all = flatten(routes)

  it('admin URLs are mounted (signin + dashboard + setup)', () => {
    const paths = new Set(all.map((r) => r.path))
    expect(paths.has('admin/signin')).toBe(true)
    expect(paths.has('admin')).toBe(true)
    expect(paths.has('admin/setup')).toBe(true)
  })
})
