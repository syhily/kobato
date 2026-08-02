import type { BlogSettingsBundle } from '@/shared/config/types'

import { isWebmentionReceiveEnabled } from '@/shared/config/getters'
import { tryParseUrl } from '@/shared/utils/safe-url'

/**
 * W3C Webmention endpoint discovery via the HTTP Link header — the
 * header twin of `<link rel="webmention">` in the root document. The
 * origin comes from `blog.general.siteIdentity.website` (same source
 * the receive endpoint's target resolution trusts). Returns null when
 * the receive switch is off (`isWebmentionReceiveEnabled` is the one
 * switch read shared with the 410 gate) or no site URL is configured
 * yet.
 */
export function webmentionLinkHeader(bundle: BlogSettingsBundle | null): string | null {
  if (!isWebmentionReceiveEnabled(bundle)) {
    return null
  }
  const website = bundle?.siteIdentity?.website
  if (website === undefined || website === '') {
    return null
  }
  const site = tryParseUrl(website)
  if (site === null) {
    return null
  }
  return `<${site.origin}/webmention>; rel="webmention"`
}
