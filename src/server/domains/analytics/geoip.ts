import type { City, ReaderModel } from '@maxmind/geoip2-node'

import { Reader } from '@maxmind/geoip2-node'
import { existsSync } from 'node:fs'

import { serverConfig } from '@/server/infra/config'
import { getLogger } from '@/server/infra/logger'
import { MAXMIND_DB_PATH, isPathInside } from '@/server/infra/paths'

const log = getLogger('analytics.geoip')

let readerPromise: Promise<ReaderModel | null> | undefined

async function openReader(): Promise<ReaderModel | null> {
  const dataPath = serverConfig.storage.data
  if (!isPathInside(MAXMIND_DB_PATH, dataPath)) {
    log.warn('MaxMind DB path is outside data directory; geo enrichment disabled', {
      path: MAXMIND_DB_PATH,
      dataPath,
    })
    return null
  }
  if (!existsSync(MAXMIND_DB_PATH)) {
    log.debug('MaxMind DB not found; geo enrichment disabled', { path: MAXMIND_DB_PATH })
    return null
  }
  try {
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

/** Clear the cached reader so a newly-uploaded DB is picked up. */
export function resetGeoReader(): void {
  readerPromise = undefined
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
    return null
  }
}
