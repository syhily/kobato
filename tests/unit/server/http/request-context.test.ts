import { describe, expect, it } from 'vitest'

import type { SessionUser } from '@/server/domains/auth/session-storage'
import type { RequestContext } from '@/server/http/request-context'

import { projectLegacyRouteContexts } from '@/server/http/request-context'

// Pure projection — the legacy five-key split reads ONLY these fields off
// the canonical context, so the stub carries just them (cast through
// `unknown`, the same partial-stub convention as the middleware tests).
function stubContext(viewer: SessionUser | null): RequestContext {
  return {
    session: { id: 'session-1' },
    viewer,
    clientAddress: '203.0.113.7',
    url: new URL('http://localhost/posts/hello'),
  } as unknown as RequestContext
}

const adminViewer: SessionUser = {
  id: '1',
  name: 'Admin',
  email: 'admin@example.com',
  website: null,
  role: 'admin',
}

describe('projectLegacyRouteContexts', () => {
  it('projects the viewer into the legacy session shape', () => {
    const rc = stubContext(adminViewer)
    const legacy = projectLegacyRouteContexts(rc)

    expect(legacy.session.session).toBe(rc.session)
    expect(legacy.session.user).toBe(adminViewer)
    expect(legacy.session.role).toBe('admin')
  })

  it('projects anonymous requests as user undefined / role null', () => {
    const legacy = projectLegacyRouteContexts(stubContext(null))

    expect(legacy.session.user).toBeUndefined()
    expect(legacy.session.role).toBeNull()
  })

  it('passes clientAddress and the normalized url through', () => {
    const rc = stubContext(null)
    const legacy = projectLegacyRouteContexts(rc)

    expect(legacy.request.clientAddress).toBe('203.0.113.7')
    expect(legacy.request.url).toBe(rc.url)
  })
})
