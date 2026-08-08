import { bundleFromMatches, routeMeta } from '@/shared/seo/meta'

/**
 * Factory for the `meta` export of routes whose only SEO input is a
 * static title, replacing the repetitive 3-line `meta` function. Routes
 * whose meta depends on `loaderData` stay explicit.
 */
export function titleMeta(title: string) {
  return ({ matches }: { matches: readonly unknown[] }) => routeMeta({ title }, bundleFromMatches(matches))
}
