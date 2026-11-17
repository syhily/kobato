import type { BlogSettingsBundle } from '@kobato/settings/types.ts'

import { isWebmentionReceiveEnabled } from '@kobato/settings/getters.ts'
import { tryParseUrl } from '@kobato/utils/safe-url.ts'

/** W3C Webmention discovery via the Link header (twin of the root `<link>`); null when
 *  the receive switch is off or no site URL is configured. */
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
