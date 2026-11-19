import type { EntityTarget } from '@kobato/db/target.ts'
import type { UaClientHints } from '@kobato/server/domains/analytics/ua-parse.ts'

export interface RawAccessEvent {
  eventId: string
  ts: Date
  /** Client IP after proxy-header resolution; used for the GeoIP lookup and the salted hash, never persisted. */
  ip: string
  ua: string
  /** User-Agent Client Hints (`Sec-CH-UA-*`) — recovers device model / OS
   *  version that Chrome's UA reduction erased from the UA string. */
  clientHints?: UaClientHints | null
  path: string
  referer: string | null
  acceptLanguage: string | null
  target: EntityTarget | null
}
