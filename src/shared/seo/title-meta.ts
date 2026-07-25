import { bundleFromMatches, routeMeta } from '@/shared/seo/meta'

/**
 * Factory for the `meta` export of routes whose only SEO input is a static
 * title. Replaces the repetitive 3-line `meta` function in each route:
 * ```ts
 * import { bundleFromMatches, routeMeta } from '@/shared/seo/meta'
 * export function meta({ matches }: Route.MetaArgs) {
 *   return routeMeta({ title: '...' }, bundleFromMatches(matches))
 * }
 * ```
 * with a single `export const meta = titleMeta('...')`. Routes whose meta
 * depends on `loaderData` (detail pages, listings) stay explicit.
 */
export function titleMeta(title: string) {
  return ({ matches }: { matches: readonly unknown[] }) => routeMeta({ title }, bundleFromMatches(matches))
}
