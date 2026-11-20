import {
  __setMaxmindDbPathForTests,
  getGeoReader,
  resetGeoReader,
} from '@kobato/server/domains/analytics/geoip/lookup.ts'
import { serverConfig } from '@kobato/server/infra/config.ts'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger.ts'
import { writeMinimalMmdb } from '@kobato/server/tests/utils/minimal-mmdb.ts'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const maxmindDir = join(serverConfig.storage.data, 'maxmind')
const missingPath = join(maxmindDir, 'kobato-test-geoip-missing.mmdb')
const okPath = join(maxmindDir, 'kobato-test-geoip-ok.mmdb')
const flakyPath = join(maxmindDir, 'kobato-test-geoip-flaky.mmdb')

afterAll(async () => {
  __setMaxmindDbPathForTests(null)
  resetGeoReader()
  for (const path of [missingPath, okPath, flakyPath]) {
    await rm(path, { force: true })
  }
})

beforeEach(() => {
  __clearLogCaptureForTests()
  resetGeoReader()
})

function captured(msg: string): number {
  return __logCaptureForTests().filter((entry) => entry.msg === msg).length
}

describe('analytics/geoip — reader memoization', () => {
  it('memoizes the not-installed state', async () => {
    __setMaxmindDbPathForTests(missingPath)

    expect(await getGeoReader()).toBeNull()
    expect(await getGeoReader()).toBeNull()

    expect(captured('MaxMind DB not found; geo enrichment disabled')).toBe(1)
  })

  it('memoizes a successfully opened reader', async () => {
    await writeMinimalMmdb(okPath)
    __setMaxmindDbPathForTests(okPath)

    const first = await getGeoReader()
    expect(first).not.toBeNull()
    await expect(getGeoReader()).resolves.toBe(first)

    expect(captured('MaxMind GeoLite2 reader opened')).toBe(1)
  })

  it('does NOT memoize a failed open — the next lookup retries', async () => {
    await writeFile(flakyPath, 'not an mmdb file')
    __setMaxmindDbPathForTests(flakyPath)

    expect(await getGeoReader()).toBeNull()
    expect(captured('MaxMind reader failed to open; will retry on next lookup')).toBe(1)

    await writeMinimalMmdb(flakyPath)
    const reader = await getGeoReader()
    expect(reader).not.toBeNull()
    expect(captured('MaxMind GeoLite2 reader opened')).toBe(1)
  })
})
