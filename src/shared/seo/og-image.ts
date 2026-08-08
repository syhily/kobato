// Single owner of the `/images/og/<slug>.png` URL shape — the Hono
// images resource declares the matching route pattern; every builder of
// the URL goes through this helper so the path cannot drift.
export function ogImagePathForSlug(slug: string): string {
  return `/images/og/${slug}.png`
}
