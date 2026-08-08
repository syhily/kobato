import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { RequestContext } from '@/server/http/request-context'
import type { Database } from '@/server/infra/db/database'

import { regularSession } from '#/_helpers/session'
import { extractRequestFacts, normalizeDocumentUrl } from '@/server/http/utils/request-facts'

// Stand-in for the canonical `RequestContext` — the suite's single
// factory; never hand-roll `{ session, viewer, … }` literals.
// VALUE-import-free (types only) so vi.mock factories stay acyclic.
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
