import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'

import { getLogger } from '@/client/lib/logger'

const logger = getLogger('theme')

type Theme = 'dark' | 'light' | 'system'
type Resolved = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: Resolved
}

const STORAGE_KEY = 'kobato-blog-theme'
export const THEME_COOKIE = 'kobato-blog-theme'

const ThemeContext = createContext<ThemeContextType | null>(null)

function setThemeCookie(resolved: Resolved) {
  // eslint-disable-next-line unicorn/no-document-cookie
  document.cookie = `${THEME_COOKIE}=${resolved};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`
}

function applyTheme(resolved: Resolved) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  root.style.colorScheme = resolved
  const meta = document.querySelector('meta[name="color-scheme"]')
  if (meta) {
    meta.setAttribute('content', resolved)
  }
}

export interface ThemeProviderProps {
  children: React.ReactNode
  /**
   * The resolved theme the SSR shell rendered. Seeds `resolvedTheme` so the
   * first client paint matches the server `<html className>` instead of
   * defaulting to light and re-resolving on `useEffect`.
   */
  initialResolved?: Resolved
}

// Owns the `<html>` class flip and the cookie that lets SSR pick up the same
// theme on the next request. The SSR loader reads the cookie and renders
// `<html class={theme}>`; this provider hydrates with the same value and only
// resolves `system` mode through `matchMedia` once the user has picked it.
export function ThemeProvider({ children, initialResolved = 'light' }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<Resolved>(initialResolved)
  const [hydrated, setHydrated] = useState(false)

  // One mount-only effect picks up the persisted preference. Until then we
  // trust the SSR `initialResolved` value (already painted by `<html>`) so
  // we never flip the class on first hydration. When no localStorage entry
  // exists yet we leave `theme` at its default `'system'` so the second
  // effect below resolves it via `matchMedia` and writes the right cookie —
  // never the SSR fallback, which would be `'light'` for a no-cookie visit
  // even when the user prefers dark.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      setThemeState(stored)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    const resolve = () => {
      const next: Resolved =
        theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
      applyTheme(next)
      setThemeCookie(next)
      setResolvedTheme(next)
    }
    resolve()

    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      mql.addEventListener('change', resolve)
      return () => mql.removeEventListener('change', resolve)
    }
  }, [theme, hydrated])

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch (err) {
      logger.warn('Failed to persist theme preference', { error: err, theme: next })
    }
    setThemeState(next)
  }, [])

  const value = useMemo(() => ({ theme, setTheme, resolvedTheme }), [theme, setTheme, resolvedTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextType {
  const ctx = use(ThemeContext)
  if (ctx === null) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
