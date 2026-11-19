export type CatalogScope = 'public' | 'workspace'

export const WORKSPACE_PATH_PREFIXES = ['/admin', '/editor'] as const

export const PUBLIC_MESSAGE_PREFIXES = [
  'auth.',
  'common.',
  'error.',
  'meta.',
  'notifications.',
  'public.',
  'validation.',
  'admin.toast.',
] as const

export function isWorkspacePath(pathname: string): boolean {
  return WORKSPACE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function catalogScopeForPathname(pathname: string): CatalogScope {
  return isWorkspacePath(pathname) ? 'workspace' : 'public'
}

export function isPublicMessageKey(key: string): boolean {
  return PUBLIC_MESSAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
}
