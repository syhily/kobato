import type { BlogSettingsBundle } from '@kobato/settings/types'

import { tryParseUrl } from '@kobato/base/utils/safe-url'
import { isWebmentionReceiveEnabled } from '@kobato/settings/getters'

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
