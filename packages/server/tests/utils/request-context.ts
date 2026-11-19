import type { Database } from '@kobato/db/database.ts'
import type { BlogSession, SessionUser } from '@kobato/server/domains/auth/session-storage.ts'
import type { RequestContext } from '@kobato/server/http/request-context.ts'
import type { AppLocalization } from '@kobato/settings/app-localization.ts'
import type { BlogSettingsBundle } from '@kobato/settings/types.ts'

import { extractRequestFacts, normalizeDocumentUrl } from '@kobato/server/http/request/request-facts.ts'
import { regularSession } from '@kobato/server/tests/utils/session.ts'
import { createLazyAppSnapshot } from '@kobato/settings/app-localization.ts'

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
