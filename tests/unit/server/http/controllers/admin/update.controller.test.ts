import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { parseRpcJson } from '#/_helpers/rpc-call'
import { DomainError } from '@/server/infra/http/errors'

const serviceMocks = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
  applyUpdate: vi.fn(),
}))
const jobMocks = vi.hoisted(() => ({ getUpdateJobStatus: vi.fn() }))

vi.mock('@/server/domains/update/service', () => serviceMocks)
vi.mock('@/server/domains/update/job', () => jobMocks)

vi.mock('@/server/domains/audit/services/record', () => ({
  recordAuditEventFromContext: vi.fn(),
}))

const { RPCHandler } = await import('@orpc/server/fetch')
const { adminUpdateRouter } = await import('@/server/http/controllers/admin/update.controller')
const { recordAuditEventFromContext } = await import('@/server/domains/audit/services/record')
const handler = new RPCHandler(adminUpdateRouter)

async function call(path: string, input: unknown, ctx = makeAuthedCtx({ role: 'admin' })) {
  const result = await handler.handle(
    new Request(`http://localhost/rpc${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: '/rpc', context: ctx },
  )
  if (!result.matched) {
    throw new Error(`No route matched for ${path}`)
  }
  return result.response
}

describe('admin update controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceMocks.checkForUpdate.mockResolvedValue({
      currentVersion: '6.4.0',
      latestVersion: '6.5.0',
      tagName: 'v6.5.0',
      htmlUrl: 'https://github.com/syhily/kobato/releases/tag/v6.5.0',
      updateAvailable: true,
      canSelfUpdate: true,
      reasons: [],
    })
    serviceMocks.applyUpdate.mockResolvedValue({ fromVersion: '6.4.0', toVersion: '6.5.0' })
    jobMocks.getUpdateJobStatus.mockReturnValue({ state: 'downloading', targetVersion: 'v6.5.0' })
  })

  it('check returns the update check result for admins', async () => {
    const response = await call('/check', {})
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ updateAvailable: boolean; canSelfUpdate: boolean }>(response)
    expect(body.updateAvailable).toBe(true)
    expect(body.canSelfUpdate).toBe(true)
  })

  it('status returns the current job status', async () => {
    const response = await call('/status', {})
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ state: string; targetVersion: string }>(response)
    expect(body).toEqual({ state: 'downloading', targetVersion: 'v6.5.0' })
  })

  it('apply returns the versions and records a system_updated audit event', async () => {
    const response = await call('/apply', {})
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ fromVersion: string; toVersion: string }>(response)
    expect(body).toEqual({ fromVersion: '6.4.0', toVersion: '6.5.0' })
    expect(recordAuditEventFromContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'system_updated',
        resourceType: 'system',
        details: { fromVersion: '6.4.0', toVersion: '6.5.0' },
      }),
    )
  })

  it('apply translates a CONFLICT DomainError to 409', async () => {
    serviceMocks.applyUpdate.mockRejectedValue(new DomainError('CONFLICT', '已有更新任务正在进行中'))
    const response = await call('/apply', {})
    expect(response.status).toBe(409)
    expect(recordAuditEventFromContext).not.toHaveBeenCalled()
  })

  it('apply translates a gate refusal to 403', async () => {
    serviceMocks.applyUpdate.mockRejectedValue(new DomainError('FORBIDDEN', 'Docker 部署请拉取新镜像升级'))
    const response = await call('/apply', {})
    expect(response.status).toBe(403)
  })

  it('rejects non-admin roles on every procedure', async () => {
    const authorCtx = makeAuthedCtx({ role: 'author' })
    expect((await call('/check', {}, authorCtx)).status).toBe(403)
    expect((await call('/apply', {}, authorCtx)).status).toBe(403)
    expect((await call('/status', {}, authorCtx)).status).toBe(403)
    expect(serviceMocks.checkForUpdate).not.toHaveBeenCalled()
    expect(serviceMocks.applyUpdate).not.toHaveBeenCalled()
  })
})
