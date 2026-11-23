import type { Database } from '@kobato/db/sqlite/database'
import type { BlogSession, SessionUser } from '@kobato/server/domains/auth/session-storage'
import type { RequestContext } from '@kobato/server/http/request-context'
import type { AppLocalization } from '@kobato/settings/app-localization'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { extractRequestFacts, normalizeDocumentUrl } from '@kobato/server/http/request/request-facts'
import { regularSession } from '@kobato/server/tests/utils/session'
import { createLazyAppSnapshot } from '@kobato/settings/app-localization'

type LocalizationOverride = Pick<AppLocalization, 'locale' | 'timeZone'> &
  Partial<Pick<AppLocalization, 'timeFormat' | 'revision' | 'revisions'>>

export interface MakeRequestContextOptions {
  request?: Request
  session?: BlogSession
  user?: SessionUser | null
  clientAddress?: string
  db?: Database
  cspNonce?: string
  localization?: LocalizationOverride
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
