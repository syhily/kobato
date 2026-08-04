import { getGeoReader, lookupCity, resetGeoReader } from '@kobato/server/domains/analytics/geoip'
import { describe, expect, it } from 'vitest'

describe('analytics/geoip — getGeoReader & lookupCity', () => {
  it('returns null reader when MaxMind DB is not available', async () => {
    resetGeoReader()
    const reader = await getGeoReader()
    // In test env, the MaxMind DB path is not present → openReader returns null.
    expect(reader).toBeNull()
  })

  it('lookupCity returns null when the reader is unavailable', async () => {
    resetGeoReader()
    expect(await lookupCity('8.8.8.8')).toBeNull()
  })

  it('lookupCity returns null for empty input', async () => {
    resetGeoReader()
    expect(await lookupCity('')).toBeNull()
  })

  it('lookupCity returns null for an obviously malformed ip', async () => {
    resetGeoReader()
    // Even with a reader, this would throw → swallowed → null.
    expect(await lookupCity('not-an-ip')).toBeNull()
  })
})
