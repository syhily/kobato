import { makeAuthedCtx } from '#/_helpers/mock-ctx'

import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/server/infra/email/sender', () => ({
  sendTestMail: vi.fn(),
}))

const { sendTestMail } = await import('@kobato/server/infra/email/sender')
const { adminMailRouter } = await import('@kobato/server/http/controllers/admin/mail.controller')

describe('adminMailRouter.sendTest', () => {
  it('returns { success: true } when sendTestMail succeeds', async () => {
    vi.mocked(sendTestMail).mockResolvedValueOnce({ ok: true })
    const ctx = makeAuthedCtx()
    const res = await call(adminMailRouter.sendTest, { to: 'admin@example.com' }, { context: ctx })
    expect(res).toEqual({ success: true })
  })

  it('throws BAD_REQUEST when mail is unconfigured', async () => {
    vi.mocked(sendTestMail).mockResolvedValueOnce({
      ok: false,
      reason: 'unconfigured',
      message: '邮件服务尚未配置完整（缺少 Host / API Key / 发件人）',
    })
    const ctx = makeAuthedCtx()
    await expect(call(adminMailRouter.sendTest, { to: 'admin@example.com' }, { context: ctx })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('throws BAD_GATEWAY when upstream rejects the mail', async () => {
    vi.mocked(sendTestMail).mockResolvedValueOnce({
      ok: false,
      reason: 'upstream',
      status: 502,
      message: '502 Bad Gateway',
    })
    const ctx = makeAuthedCtx()
    await expect(call(adminMailRouter.sendTest, { to: 'admin@example.com' }, { context: ctx })).rejects.toMatchObject({
      code: 'BAD_GATEWAY',
    })
  })
})
