import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { bundleFromMatches, i18nFromMatches, routeMeta } from '@/shared/seo/meta'

/**
 * Factory for the `meta` export of routes whose only SEO input is a static
 * title; routes whose meta depends on `loaderData` stay explicit.
 * The title is a UI message id resolved from `matches`, so it stays typed
 * (an untranslated title fails `tsc`) and works on client navigation.
 */
export function titleMeta(titleKey: UiMessageId) {
  return ({ matches }: { matches: readonly unknown[] }) =>
    routeMeta({ titleKey }, bundleFromMatches(matches), i18nFromMatches(matches))
}
