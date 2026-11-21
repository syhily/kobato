import type { EntityTarget } from '@kobato/db/target'
import type { UaClientHints } from '@kobato/server/domains/analytics/ua-parse'

export interface RawAccessEvent {
  eventId: string
  ts: Date
  ip: string
  ua: string
  clientHints?: UaClientHints | null
  path: string
  referer: string | null
  acceptLanguage: string | null
  target: EntityTarget | null
}
