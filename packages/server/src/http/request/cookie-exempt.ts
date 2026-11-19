const EXEMPT_PATH_PREFIXES = ['/__manifest', '/assets/', '/build/', '/api/', '/sitemap.xml', '/images/']

export function isExempt(pathname: string): boolean {
  if (pathname === '/feed' || pathname.startsWith('/feed/')) {
    return true
  }
  return EXEMPT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
