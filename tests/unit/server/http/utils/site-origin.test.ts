import { beforeEach, describe, expect, it, vi } from 'vitest'

const getBlogSettingsBundleSync = vi.hoisted(() => vi.fn())

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync,
}))

const { resolveSiteOrigin } = await import('@/server/http/utils/site-origin')

describe('http/utils/site-origin — resolveSiteOrigin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prefers the configured siteIdentity website', () => {
    getBlogSettingsBundleSync.mockReturnValue({ siteIdentity: { website: 'https://blog.example.com' } })
    const request = new Request('http://internal:3000/rpc/admin/users/mute')
    expect(resolveSiteOrigin(request)).toBe('https://blog.example.com')
  })

  it('falls back to the request origin when no website is configured', () => {
    getBlogSettingsBundleSync.mockReturnValue({ siteIdentity: { website: null } })
    const request = new Request('http://internal:3000/rpc/admin/users/mute')
    expect(resolveSiteOrigin(request)).toBe('http://internal:3000')
  })

  it('falls back to the request origin when the bundle is not hydrated', () => {
    getBlogSettingsBundleSync.mockReturnValue(null)
    const request = new Request('https://example.com/admin/signin')
    expect(resolveSiteOrigin(request)).toBe('https://example.com')
  })
})
