import { resolveSiteOrigin } from '@kobato/server/domains/settings/site-origin.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/server/tests/utils/blog-settings.ts'
import { describe, expect, it } from 'vitest'

describe('server/domains/settings/site-origin — resolveSiteOrigin', () => {
  it('prefers the configured siteIdentity website', () => {
    const request = new Request('http://internal:3000/rpc/admin/users/mute')
    expect(resolveSiteOrigin(request)).toBe(TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.website)
  })

  it('ignores a spoofed Host header', () => {
    const request = new Request('http://evil.tld/admin/signin')
    expect(resolveSiteOrigin(request)).toBe(TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.website)
  })

  it('falls back to the request origin when no website is configured', () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, website: null as unknown as string },
    })
    const request = new Request('http://internal:3000/rpc/admin/users/mute')
    expect(resolveSiteOrigin(request)).toBe('http://internal:3000')
  })

  it('falls back to the request origin when the bundle is not hydrated', () => {
    setBlogSettingsBundleForTests(null)
    const request = new Request('https://example.com/admin/signin')
    expect(resolveSiteOrigin(request)).toBe('https://example.com')
  })
})
