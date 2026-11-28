export type CatalogScope = 'public' | 'workspace'

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

export function isPublicMessageKey(key: string): boolean {
  return PUBLIC_MESSAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
}
