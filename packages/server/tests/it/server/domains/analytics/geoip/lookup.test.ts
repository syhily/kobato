import {
  getGeoReader,
  lookupCity,
  resetGeoReader,
  __setMaxmindDbPathForTests,
} from '@kobato/server/domains/analytics/geoip/lookup.ts'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MISSING_DB = join(tmpdir(), 'kobato-geoip-lookup-missing', 'GeoLite2-City.mmdb')

describe('analytics/geoip — getGeoReader & lookupCity', () => {
  // The shared /tmp data dir is written to by other suites; pin the reader
  // to a path that is deterministically absent.
  it('returns null reader when MaxMind DB is not available', async () => {
    __setMaxmindDbPathForTests(MISSING_DB)
    resetGeoReader()
    const reader = await getGeoReader()
    expect(reader).toBeNull()
    __setMaxmindDbPathForTests(null)
  })

  it('lookupCity returns null when the reader is unavailable', async () => {
    __setMaxmindDbPathForTests(MISSING_DB)
    resetGeoReader()
    expect(await lookupCity('8.8.8.8')).toBeNull()
    __setMaxmindDbPathForTests(null)
  })

  it('lookupCity returns null for empty input', async () => {
    resetGeoReader()
    expect(await lookupCity('')).toBeNull()
  })

  it('lookupCity returns null for an obviously malformed ip', async () => {
    resetGeoReader()
    expect(await lookupCity('not-an-ip')).toBeNull()
  })
})
