import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'

import { resolveSiteOrigin } from '@kobato/server/http/utils/site-origin'
import { describe, expect, it } from 'vitest'

describe('http/utils/site-origin — resolveSiteOrigin', () => {
  it('prefers the configured siteIdentity website', () => {
    const request = new Request('http://internal:3000/rpc/admin/users/mute')
    expect(resolveSiteOrigin(request)).toBe(TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.website)
  })

  it('falls back to the request origin when no website is configured', () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      // Null website exercises the unconfigured fallback; the section type is string.
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
