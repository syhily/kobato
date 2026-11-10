import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { RequestContext } from '@/server/http/request-context'
import type { Database } from '@/server/infra/db/database'
import type { BlogSettingsBundle } from '@/shared/config/types'
import type { AppLocalization } from '@/shared/i18n/app-localization'

import { regularSession } from '#/_helpers/session'
import { extractRequestFacts, normalizeDocumentUrl } from '@/server/http/utils/request-facts'
import { createLazyAppSnapshot } from '@/shared/i18n/app-localization'

// The suite's single `RequestContext` factory; never hand-roll `{ session, viewer, … }`
// literals. Types only from `@/server/http/request-context`, so vi.mock factories stay
// acyclic; `resolveAppLocalization` reads the shared snapshot leaf, safe inside a factory.
/** Test-only partial projection: missing representation fields come from the lazy capture. */
type LocalizationOverride = Pick<AppLocalization, 'locale' | 'timeZone'> &
  Partial<Pick<AppLocalization, 'timeFormat' | 'revision' | 'revisions'>>

export interface MakeRequestContextOptions {
  request?: Request
  session?: BlogSession
  /** `undefined` derives the viewer from `session.data.user`; explicit `null` forces anonymous. */
  user?: SessionUser | null
  clientAddress?: string
  db?: Database
  cspNonce?: string
  /** Explicit override; omitted means the lazy settings-snapshot pair (like production). */
  localization?: LocalizationOverride
  /** Explicit override; omitted means the lazy settings-snapshot bundle (like production). */
  settings?: BlogSettingsBundle | null
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
  settings,
  markSessionDirty = () => {},
}: MakeRequestContextOptions = {}): RequestContext {
  const resolvedUser = user === undefined ? ((session?.data?.user as SessionUser | undefined) ?? null) : user
  // Lazy by default: mirrors the real context, where the snapshot hydrates
  // after derivation — a pre-hydration capture would mask cold-boot bugs.
  const lazySnapshot = createLazyAppSnapshot()
  return {
    session,
    viewer: resolvedUser,
    clientAddress,
    url: normalizeDocumentUrl(new URL(request.url)),
    requestFacts: extractRequestFacts(request),
    db: (db ?? {}) as Database,
    cspNonce,
    get settings() {
      return settings === undefined ? lazySnapshot().settings : settings
    },
    get localization() {
      if (localization === undefined) {
        return lazySnapshot().localization
      }
      const captured = lazySnapshot().localization
      return {
        locale: localization.locale,
        timeZone: localization.timeZone,
        timeFormat: localization.timeFormat ?? null,
        revision: localization.revision ?? captured.revision,
        revisions: localization.revisions ?? captured.revisions,
      }
    },
    markSessionDirty,
  }
}
