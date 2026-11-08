import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { bundleFromMatches, i18nFromMatches, routeMeta } from '@/shared/seo/meta'

/**
 * Factory for the `meta` export of routes whose only SEO input is a static
 * title, replacing the repetitive 3-line `meta` function. Routes whose meta
 * depends on `loaderData` stay explicit.
 *
 * The title is a UI message id, resolved from the root loader's i18n payload
 * (matches) — statically typed, so an untranslated title fails `tsc`, and it
 * still works on client navigation where no server translator exists.
 */
export function titleMeta(titleKey: UiMessageId) {
  return ({ matches }: { matches: readonly unknown[] }) =>
    routeMeta({ titleKey }, bundleFromMatches(matches), i18nFromMatches(matches))
}
