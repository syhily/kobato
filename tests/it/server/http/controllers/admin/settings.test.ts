import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { DomainError } from '@/server/infra/http/errors'

vi.mock('@/server/domains/settings/services/core', () => ({
  getAdminBlogSettings: vi.fn(),
  updateBlogSettingsSection: vi.fn(),
  redactSecretsFromBundle: vi.fn((bundle: unknown) => bundle),
}))

vi.mock('@/server/domains/settings/timezones', () => ({
  getSupportedTimeZones: vi.fn(),
  isSupportedTimeZone: vi.fn(() => true),
}))

const { getAdminBlogSettings, updateBlogSettingsSection } = await import('@/server/domains/settings/services/core')
const { getSupportedTimeZones } = await import('@/server/domains/settings/timezones')
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

describe('adminSettingsRouter.get', () => {
  it('returns the settings bundle', async () => {
    vi.mocked(getAdminBlogSettings).mockResolvedValueOnce({
      bundle: bundleStub as unknown as Awaited<ReturnType<typeof getAdminBlogSettings>>['bundle'],
    })
    const ctx = makeAuthedCtx()
    const res = await call(adminSettingsRouter.get, {}, { context: ctx })
    expect(res.bundle).toEqual(bundleStub)
  })
})

describe('adminSettingsRouter.loadAll', () => {
  it('returns the settings bundle plus timeZones', async () => {
    vi.mocked(getAdminBlogSettings).mockResolvedValueOnce({ bundle: bundleStub } as unknown as Awaited<
      ReturnType<typeof getAdminBlogSettings>
    >)
    vi.mocked(getSupportedTimeZones).mockReturnValueOnce(['Asia/Shanghai', 'UTC'])
    const ctx = makeAuthedCtx()
    const res = await call(adminSettingsRouter.loadAll, {}, { context: ctx })
    expect(res.bundle).toEqual(bundleStub)
    expect(res.timeZones).toEqual(['Asia/Shanghai', 'UTC'])
  })
})

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
