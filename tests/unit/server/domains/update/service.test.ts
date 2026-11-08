import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { DomainError } from '@/server/infra/http/errors'

const gateMocks = vi.hoisted(() => ({ evaluateSelfUpdateGate: vi.fn() }))
const releaseMocks = vi.hoisted(() => ({ fetchLatestRelease: vi.fn() }))
const jobMocks = vi.hoisted(() => ({ startUpdateJob: vi.fn() }))

vi.mock('@/server/infra/self-update-gate', () => ({ evaluateSelfUpdateGate: gateMocks.evaluateSelfUpdateGate }))
vi.mock('@/server/domains/update/release', () => ({ fetchLatestRelease: releaseMocks.fetchLatestRelease }))
vi.mock('@/server/domains/update/job', () => ({ startUpdateJob: jobMocks.startUpdateJob }))
vi.mock('@/shared/config/version', () => ({ APP_VERSION: '6.4.0' }))

const { checkForUpdate, applyUpdate, isNewerVersion } = await import('@/server/domains/update/service')

// Only forwarded to the mocked release lookup — a plain object suffices.
const db = {} as Database

function release(tagName: string) {
  return {
    tagName,
    htmlUrl: `https://github.com/syhily/kobato/releases/tag/${tagName}`,
    name: `Release ${tagName}`,
    publishedAt: '2026-07-19T00:00:00Z',
  }
}

describe('update/service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gateMocks.evaluateSelfUpdateGate.mockReturnValue({
      canSelfUpdate: true,
      reasons: [],
      reasonDescriptors: [],
    })
    releaseMocks.fetchLatestRelease.mockResolvedValue(release('v6.5.0'))
  })

  it('composes the check result from release, gate, and version comparison', async () => {
    const result = await checkForUpdate(db)
    expect(result).toEqual({
      currentVersion: '6.4.0',
      latestVersion: '6.5.0',
      tagName: 'v6.5.0',
      htmlUrl: 'https://github.com/syhily/kobato/releases/tag/v6.5.0',
      updateAvailable: true,
      canSelfUpdate: true,
      reasons: [],
    })
  })

  it('reports no update when the release is not newer', async () => {
    releaseMocks.fetchLatestRelease.mockResolvedValue(release('v6.4.0'))
    const result = await checkForUpdate(db)
    expect(result.updateAvailable).toBe(false)
  })

  it('passes the gate refusal descriptors through to the check result', async () => {
    const descriptor = {
      messageKey: 'update.gate.containerized',
      fallbackMessage: 'Docker deployments must pull a new image to upgrade.',
    }
    gateMocks.evaluateSelfUpdateGate.mockReturnValue({
      canSelfUpdate: false,
      reasons: [descriptor.fallbackMessage],
      reasonDescriptors: [descriptor],
    })
    const result = await checkForUpdate(db)
    expect(result.canSelfUpdate).toBe(false)
    expect(result.reasons).toEqual([descriptor])
  })

  it('apply starts the job and returns the from/to versions', async () => {
    const result = await applyUpdate(db)
    expect(result).toEqual({ fromVersion: '6.4.0', toVersion: '6.5.0' })
    expect(jobMocks.startUpdateJob).toHaveBeenCalledWith('v6.5.0')
  })

  it('apply re-checks freshness and refuses when no update is available', async () => {
    releaseMocks.fetchLatestRelease.mockResolvedValue(release('v6.4.0'))
    await expect(applyUpdate(db)).rejects.toThrow(DomainError)
    await expect(applyUpdate(db)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(jobMocks.startUpdateJob).not.toHaveBeenCalled()
  })

  it('apply re-checks the gate and refuses with a descriptor summary + one issue per reason', async () => {
    const descriptors = [
      {
        messageKey: 'update.gate.containerized',
        fallbackMessage: 'Docker deployments must pull a new image to upgrade.',
      },
      {
        messageKey: 'update.gate.unwritable',
        fallbackMessage: 'The directory containing the binary is not writable, so the executable cannot be replaced.',
      },
    ]
    gateMocks.evaluateSelfUpdateGate.mockReturnValue({
      canSelfUpdate: false,
      reasons: descriptors.map((descriptor) => descriptor.fallbackMessage),
      reasonDescriptors: descriptors,
    })
    // No locale-flavored punctuation is assembled here: the summary is one
    // typed message and the reasons ride `issues` for the transport to fold.
    await expect(applyUpdate(db)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'This deployment cannot self-update.',
      descriptor: { messageKey: 'update.error.gateBlocked' },
      issues: descriptors,
    })
    expect(jobMocks.startUpdateJob).not.toHaveBeenCalled()
  })
})

describe('update/service isNewerVersion', () => {
  it('detects newer patch, minor, and major versions', () => {
    expect(isNewerVersion('v1.2.4', '1.2.3')).toBe(true)
    expect(isNewerVersion('v1.3.0', '1.2.9')).toBe(true)
    expect(isNewerVersion('v2.0.0', '1.9.9')).toBe(true)
  })

  it('detects same or older versions', () => {
    expect(isNewerVersion('v1.2.3', '1.2.3')).toBe(false)
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false)
    expect(isNewerVersion('v1.2.2', '1.2.3')).toBe(false)
    expect(isNewerVersion('v1.1.9', '1.2.0')).toBe(false)
    expect(isNewerVersion('v0.9.9', '1.0.0')).toBe(false)
  })

  it('treats a leading v on either side as equal', () => {
    expect(isNewerVersion('v1.2.3', 'v1.2.3')).toBe(false)
    expect(isNewerVersion('1.2.4', 'v1.2.3')).toBe(true)
  })

  it('ignores pre-release suffixes beyond the dev gate', () => {
    expect(isNewerVersion('v1.2.3', '1.2.3-dev')).toBe(false)
    expect(isNewerVersion('v1.2.4-beta', '1.2.3')).toBe(true)
    expect(isNewerVersion('v1.2.3', '1.2.4-dev')).toBe(false)
  })

  it('compares numerically, not lexically', () => {
    expect(isNewerVersion('v1.10.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('v1.2.10', '1.2.9')).toBe(true)
  })

  it('pads missing parts with zero and tolerates junk segments', () => {
    expect(isNewerVersion('v1.2', '1.1.9')).toBe(true)
    expect(isNewerVersion('v1.2', '1.2.1')).toBe(false)
    expect(isNewerVersion('v2', '1.9.9')).toBe(true)
    expect(isNewerVersion('garbage', '0.0.1')).toBe(false)
  })
})
