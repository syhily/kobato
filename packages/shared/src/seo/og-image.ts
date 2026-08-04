// Single owner of the `/images/og/<slug>.png` URL shape. The Hono images
// resource (`@kobato/server/http/resources/images`) declares the matching route
// pattern; every builder of the URL goes through this helper so the path
// shape cannot drift between meta tags, feeds, and the serving route.
export function ogImagePathForSlug(slug: string): string {
  return `/images/og/${slug}.png`
}
