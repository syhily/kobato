import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DomainError } from '@/server/infra/http/errors'

const gateMocks = vi.hoisted(() => ({ evaluateSelfUpdateGate: vi.fn() }))
const releaseMocks = vi.hoisted(() => ({ fetchLatestRelease: vi.fn() }))
const jobMocks = vi.hoisted(() => ({
  startUpdateJob: vi.fn(),
  getUpdateJobStatus: vi.fn(),
}))

vi.mock('@/server/domains/update/gate', () => ({ evaluateSelfUpdateGate: gateMocks.evaluateSelfUpdateGate }))
vi.mock('@/server/domains/update/release', () => ({ fetchLatestRelease: releaseMocks.fetchLatestRelease }))
vi.mock('@/server/domains/update/job', () => ({
  getUpdateJobStatus: jobMocks.getUpdateJobStatus,
  startUpdateJob: jobMocks.startUpdateJob,
}))
vi.mock('@/shared/config/version', () => ({ APP_VERSION: '6.4.0' }))

const { checkForUpdate, applyUpdate, getUpdateJobStatus } = await import('@/server/domains/update/service')

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
    gateMocks.evaluateSelfUpdateGate.mockReturnValue({ canSelfUpdate: true, reasons: [] })
    releaseMocks.fetchLatestRelease.mockResolvedValue(release('v6.5.0'))
    jobMocks.getUpdateJobStatus.mockReturnValue({ state: 'idle' })
  })

  it('composes the check result from release, gate, and version comparison', async () => {
    const result = await checkForUpdate()
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
    const result = await checkForUpdate()
    expect(result.updateAvailable).toBe(false)
  })

  it('passes gate refusal reasons through to the check result', async () => {
    gateMocks.evaluateSelfUpdateGate.mockReturnValue({
      canSelfUpdate: false,
      reasons: ['Docker 部署请拉取新镜像升级'],
    })
    const result = await checkForUpdate()
    expect(result.canSelfUpdate).toBe(false)
    expect(result.reasons).toEqual(['Docker 部署请拉取新镜像升级'])
  })

  it('apply starts the job and returns the from/to versions', async () => {
    const result = await applyUpdate()
    expect(result).toEqual({ fromVersion: '6.4.0', toVersion: '6.5.0' })
    expect(jobMocks.startUpdateJob).toHaveBeenCalledWith('v6.5.0')
  })

  it('apply re-checks freshness and refuses when no update is available', async () => {
    releaseMocks.fetchLatestRelease.mockResolvedValue(release('v6.4.0'))
    await expect(applyUpdate()).rejects.toThrow(DomainError)
    await expect(applyUpdate()).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(jobMocks.startUpdateJob).not.toHaveBeenCalled()
  })

  it('apply re-checks the gate and refuses with the joined reasons', async () => {
    gateMocks.evaluateSelfUpdateGate.mockReturnValue({
      canSelfUpdate: false,
      reasons: ['Docker 部署请拉取新镜像升级', '二进制所在目录不可写，无法替换程序文件'],
    })
    await expect(applyUpdate()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Docker 部署请拉取新镜像升级；二进制所在目录不可写，无法替换程序文件',
    })
    expect(jobMocks.startUpdateJob).not.toHaveBeenCalled()
  })

  it('exposes the job status from the job module', () => {
    jobMocks.getUpdateJobStatus.mockReturnValue({ state: 'downloading', targetVersion: 'v6.5.0' })
    expect(getUpdateJobStatus()).toEqual({ state: 'downloading', targetVersion: 'v6.5.0' })
  })
})
