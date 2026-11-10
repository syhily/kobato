const EXEMPT_PATH_PREFIXES = ['/__manifest', '/assets/', '/build/', '/api/', '/sitemap.xml', '/images/']

// Cacheable machine-readable paths never mint anonymous cookies, so shared caches stay clean.
// `/feed` is matched exactly plus the `/feed/` sub-paths: a bare `/feed` prefix would also
// exempt probes like `/feed.xml` (not a feed route), and skipping the CSRF mint there made
// the root loader throw instead of 404ing.
export function isExempt(pathname: string): boolean {
  if (pathname === '/feed' || pathname.startsWith('/feed/')) {
    return true
  }
  return EXEMPT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
