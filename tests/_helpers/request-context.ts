import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { RequestContext } from '@/server/http/request-context'
import type { Database } from '@/server/infra/db/database'
import type { AppLocalization } from '@/shared/i18n/app-localization'

import { regularSession } from '#/_helpers/session'
import { extractRequestFacts, normalizeDocumentUrl } from '@/server/http/utils/request-facts'
import { createLazyAppLocalization } from '@/shared/i18n/app-localization'

// Stand-in for the canonical `RequestContext` — the suite's single
// factory; never hand-roll `{ session, viewer, … }` literals.
// No runtime edge to `@/server/http/request-context` (types only) so vi.mock
// factories stay acyclic; `resolveAppLocalization` reads the shared snapshot
// leaf, which is safe inside a mocked-module factory.
export interface MakeRequestContextOptions {
  request?: Request
  session?: BlogSession
  /** `undefined` derives the viewer from `session.data.user`; explicit `null` forces anonymous. */
  user?: SessionUser | null
  clientAddress?: string
  db?: Database
  cspNonce?: string
  /** Explicit override; omitted means the lazy settings-snapshot pair (like production). */
  localization?: AppLocalization
  markSessionDirty?: () => void
}

export function makeRequestContext({
  request = new Request('http://localhost/'),
  session = regularSession(),
  user,
  clientAddress = '127.0.0.1',
  db,
  cspNonce = 'test-csp-nonce',
  localization,
  markSessionDirty = () => {},
}: MakeRequestContextOptions = {}): RequestContext {
  const resolvedUser = user === undefined ? ((session?.data?.user as SessionUser | undefined) ?? null) : user
  // Lazy by default: mirrors the real context, where the snapshot hydrates
  // after derivation — a pre-hydration capture would mask cold-boot bugs.
  const lazyLocalization = createLazyAppLocalization()
  return {
    session,
    viewer: resolvedUser,
    clientAddress,
    url: normalizeDocumentUrl(new URL(request.url)),
    requestFacts: extractRequestFacts(request),
    db: (db ?? {}) as Database,
    cspNonce,
    get localization() {
      return localization ?? lazyLocalization()
    },
    markSessionDirty,
  }
}
