import type { City, ReaderModel } from '@maxmind/geoip2-node'

import { MAXMIND_DB_PATH } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'

// Lazy MaxMind reader. `Reader.open()` mmaps the binary so the load is
// effectively free at runtime, but it's still an async file open we
// don't want on the SSR hot path of the first request. We resolve a
// shared `Promise<ReaderModel | null>` on first call and reuse it.
//
// `null` resolution is deliberate: a missing / unreadable db must NOT
// crash the ingestion pipeline. Every consumer treats `null` as "no
// geo enrichment available" and writes null-only geo columns. The
// hand-off step in `docs/blog-analytics-plan.md §7` covers downloading
// the db; until that ships, the dashboard's country/region/city tabs
// will simply show "(unknown)".

const log = getLogger('analytics.geoip')

let readerPromise: Promise<ReaderModel | null> | undefined

async function openReader(): Promise<ReaderModel | null> {
  if (!MAXMIND_DB_PATH) {
    log.debug('MAXMIND_DB_PATH unset — geo enrichment disabled')
    return null
  }
  try {
    // Dynamic import keeps the heavy mmdb decoder out of cold-path
    // modules. Imported once and cached via the globalForReader promise.
    const { Reader } = await import('@maxmind/geoip2-node')
    const reader = await Reader.open(MAXMIND_DB_PATH)
    log.info('MaxMind GeoLite2 reader opened', { path: MAXMIND_DB_PATH })
    return reader
  } catch (err) {
    log.warn('MaxMind reader failed to open; geo enrichment disabled', {
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export function getGeoReader(): Promise<ReaderModel | null> {
  if (readerPromise === undefined) {
    readerPromise = openReader()
  }
  return readerPromise
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    readerPromise = undefined
  })
}

export async function lookupCity(ip: string): Promise<City | null> {
  if (!ip) {
    return null
  }
  const reader = await getGeoReader()
  if (!reader) {
    return null
  }
  try {
    return reader.city(ip)
  } catch {
    // `city()` throws `AddressNotFoundError` for unknown IPs and
    // `ValueError` for malformed inputs. Both are non-fatal — the
    // visit still records, just without geo.
    return null
  }
}
