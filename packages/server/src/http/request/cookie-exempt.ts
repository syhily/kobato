const EXEMPT_PATH_PREFIXES = ['/admin/assets/']

export function isExempt(pathname: string): boolean {
  return EXEMPT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
