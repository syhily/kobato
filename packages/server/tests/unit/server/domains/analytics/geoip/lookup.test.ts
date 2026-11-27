import { __setMaxmindDbPathForTests, getGeoReader, resetGeoReader } from '@kobato/server/domains/analytics/geoip/lookup'
import { serverConfig } from '@kobato/server/infra/config'
import { __resetDevHostStateForTests } from '@kobato/server/infra/dev-host-state'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger'
import { writeMinimalMmdb } from '@kobato/server/tests/utils/minimal-mmdb'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

afterEach(() => {
  __resetDevHostStateForTests()
  vi.resetModules()
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

  it('hands the memoized reader to a re-evaluated module under the dev host instead of opening again', async () => {
    const { __installDevHostStateForTests } = await import('@kobato/server/infra/dev-host-state')
    __setMaxmindDbPathForTests(missingPath)
    __installDevHostStateForTests()
    const opened = getGeoReader()
    expect(captured('MaxMind DB not found; geo enrichment disabled')).toBe(1)

    vi.resetModules()
    const next = await import('@kobato/server/domains/analytics/geoip/lookup')
    next.__setMaxmindDbPathForTests(missingPath)

    expect(next.getGeoReader()).toBe(opened)

    next.resetGeoReader()
  })

  it('a re-evaluated module holding a carried reader whose open failed retries on its next lookup', async () => {
    const { __installDevHostStateForTests } = await import('@kobato/server/infra/dev-host-state')
    await writeFile(flakyPath, 'not an mmdb file')
    __installDevHostStateForTests()
    vi.resetModules()
    const first = await import('@kobato/server/domains/analytics/geoip/lookup')
    first.__setMaxmindDbPathForTests(flakyPath)
    const failing = first.getGeoReader()

    vi.resetModules()
    const next = await import('@kobato/server/domains/analytics/geoip/lookup')
    next.__setMaxmindDbPathForTests(flakyPath)
    expect(next.getGeoReader()).toBe(failing)

    await expect(failing).resolves.toBeNull()
    await writeMinimalMmdb(flakyPath)
    const retried = next.getGeoReader()
    expect(retried).not.toBe(failing)
    await expect(retried).resolves.not.toBeNull()
    next.resetGeoReader()
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
