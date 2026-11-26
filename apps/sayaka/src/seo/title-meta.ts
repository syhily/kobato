import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { bundleFromMatches, i18nFromMatches, routeMeta } from '@kobato/catalog/seo/meta'

export function titleMeta(titleKey: UiMessageId) {
  return ({ matches }: { matches: readonly unknown[] }) =>
    routeMeta({ titleKey }, bundleFromMatches(matches), i18nFromMatches(matches))
}
