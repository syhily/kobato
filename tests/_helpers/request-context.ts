import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { RequestContext } from '@/server/http/request-context'
import type { Database } from '@/server/infra/db/database'

import { regularSession } from '#/_helpers/session'
import { extractRequestFacts, normalizeDocumentUrl } from '@/server/http/utils/request-facts'

// Stand-in for the canonical `RequestContext` that `requestContextMiddleware`
// derives once per request in production. The single factory for the whole
// test suite — never hand-roll `{ session, viewer, … }` literals in a test;
// pass the overrides you need here instead.
//
// This module is deliberately VALUE-import-free of
// `@/server/http/request-context` (types only, erased at runtime) so it can
// be imported from a `vi.mock('@/server/http/request-context', …)` factory
// without creating a circular mock evaluation.
export interface MakeRequestContextOptions {
  request?: Request
  session?: BlogSession
  /** `undefined` derives the viewer from `session.data.user`; explicit `null` forces anonymous. */
  user?: SessionUser | null
  clientAddress?: string
  db?: Database
  cspNonce?: string
  markSessionDirty?: () => void
}

export function makeRequestContext({
  request = new Request('http://localhost/'),
  session = regularSession(),
  user,
  clientAddress = '127.0.0.1',
  db,
  cspNonce = 'test-csp-nonce',
  markSessionDirty = () => {},
}: MakeRequestContextOptions = {}): RequestContext {
  const resolvedUser = user === undefined ? ((session?.data?.user as SessionUser | undefined) ?? null) : user
  return {
    session,
    viewer: resolvedUser,
    clientAddress,
    url: normalizeDocumentUrl(new URL(request.url)),
    requestFacts: extractRequestFacts(request),
    db: (db ?? {}) as Database,
    cspNonce,
    markSessionDirty,
  }
}
