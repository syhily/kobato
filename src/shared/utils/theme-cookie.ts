// The resolved-theme cookie: written by the UI `ThemeProvider`, read
// server-side by `content.bootstrap` so SSR stamps the theme class
// without a wrong-theme flash. Cookie name shared by writer + reader.
export const THEME_COOKIE = 'kobato-blog-theme'

export type ResolvedTheme = 'dark' | 'light'

// Raw `Cookie` header → the resolved theme, or null when the cookie is
// absent or carries an unexpected value.
export function parseThemeCookie(cookie: string | null | undefined): ResolvedTheme | null {
  if (cookie === null || cookie === undefined) {
    return null
  }
  const value = cookie.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`))?.[1]
  return value === 'dark' || value === 'light' ? value : null
}
