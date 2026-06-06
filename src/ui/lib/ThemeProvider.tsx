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
  initialResolved?: Resolved
}

export function ThemeProvider({ children, initialResolved = 'light' }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<Resolved>(initialResolved)
  const [hydrated, setHydrated] = useState(false)

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
