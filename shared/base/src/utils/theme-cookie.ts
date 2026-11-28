export const THEME_COOKIE = 'kobato-blog-theme'

export type ResolvedTheme = 'dark' | 'light'

export function parseThemeCookie(cookie: string | null | undefined): ResolvedTheme | null {
  if (cookie === null || cookie === undefined) {
    return null
  }
  const value = new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`).exec(cookie)?.[1]
  return value === 'dark' || value === 'light' ? value : null
}
