// The resolved-theme cookie: written by the UI `ThemeProvider` on every
// theme change, read server-side by `content.bootstrap` so SSR can stamp
// the theme class (and `color-scheme`) on `<html>` without a flash of the
// wrong theme. Isomorphic by design — the cookie name is shared by the
// browser writer and the server reader.
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
