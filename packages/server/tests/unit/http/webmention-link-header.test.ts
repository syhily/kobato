import type { BlogSettingsBundle } from '@kobato/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

import { webmentionLinkHeader } from '@kobato/server/http/webmention-link-header'
import { describe, expect, it } from 'vitest'

// `webmentionLinkHeader` is pure: bundle in, Link-header value (or null)
// out — the receive switch and the site origin are the only inputs.

function bundleWith(overrides: { receiveEnabled?: boolean; website?: string }): BlogSettingsBundle {
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, website: overrides.website ?? 'https://example.com' },
    webmentions: { webmention: { receiveEnabled: overrides.receiveEnabled ?? true, displayOnPosts: true } },
  }
}

describe('webmentionLinkHeader', () => {
  it('declares the endpoint with the site origin', () => {
    expect(webmentionLinkHeader(bundleWith({}))).toBe('<https://example.com/webmention>; rel="webmention"')
  })

  it('strips a trailing slash / path from the configured website URL', () => {
    expect(webmentionLinkHeader(bundleWith({ website: 'https://example.com/blog/' }))).toBe(
      '<https://example.com/webmention>; rel="webmention"',
    )
  })

  it('is suppressed when the receive switch is off', () => {
    expect(webmentionLinkHeader(bundleWith({ receiveEnabled: false }))).toBeNull()
  })

  it('is absent without a configured website or bundle', () => {
    expect(webmentionLinkHeader(null)).toBeNull()
    expect(webmentionLinkHeader({ ...TEST_BLOG_SETTINGS_BUNDLE, siteIdentity: null })).toBeNull()
  })

  it('still declares when the webmentions section is missing (unseeded reads as the default ON)', () => {
    expect(webmentionLinkHeader({ ...bundleWith({}), webmentions: null })).toBe(
      '<https://example.com/webmention>; rel="webmention"',
    )
  })
})
