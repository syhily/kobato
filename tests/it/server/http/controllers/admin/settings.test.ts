import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { DomainError } from '@/server/infra/http/errors'

vi.mock('@/server/domains/settings/services/core', () => ({
  updateBlogSettingsSection: vi.fn(),
}))

const { updateBlogSettingsSection } = await import('@/server/domains/settings/services/core')
const { adminSettingsRouter } = await import('@/server/http/controllers/admin/settings.controller')

const bundleStub = {
  siteIdentity: null,
  assets: null,
  navigation: null,
  socials: null,
  content: null,
  sidebar: null,
  comments: null,
  seo: null,
  mail: null,
  cache: null,
  backup: null,
  rateLimit: null,
  search: null,
  fonts: null,
  limits: null,
  analytics: null,
}

describe('adminSettingsRouter.update', () => {
  it('updates a section with a valid payload', async () => {
    vi.mocked(updateBlogSettingsSection).mockResolvedValueOnce(
      bundleStub as unknown as Awaited<ReturnType<typeof updateBlogSettingsSection>>,
    )
    const ctx = makeAuthedCtx()
    const res = await call(
      adminSettingsRouter.update,
      {
        section: 'mail',
        payload: {
          mail: { enabled: false, host: 'api.zeabur.com', sender: 'noreply@example.com' },
        },
      },
      { context: ctx },
    )
    expect(res.success).toBe(true)
  })

  it('throws BAD_REQUEST for an invalid payload', async () => {
    vi.mocked(updateBlogSettingsSection).mockRejectedValueOnce(new DomainError('BAD_REQUEST', '设置数据无效'))
    const ctx = makeAuthedCtx()
    await expect(
      call(
        adminSettingsRouter.update,
        {
          section: 'mail',
          payload: { mail: { enabled: false, host: '', sender: '' } },
        },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})
