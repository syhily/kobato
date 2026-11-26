import type { Database } from '@kobato/db/sqlite/database'
import type { BlogSession, SessionUser } from '@kobato/server/domains/auth/session-storage'
import type { RequestFacts } from '@kobato/server/infra/http/request-facts'
import type { AppLocalization } from '@kobato/settings/app-localization'
import type { BlogSettingsBundle } from '@kobato/settings/types'

export interface RequestContext {
  session: BlogSession
  viewer: SessionUser | null
  clientAddress: string
  url: URL
  requestFacts: RequestFacts
  db: Database
  cspNonce: string
  readonly settings: BlogSettingsBundle | null
  readonly localization: AppLocalization
  markSessionDirty(): void
}
