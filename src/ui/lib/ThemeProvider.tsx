import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'

import { getLogger } from '@/client/lib/logger'
import { transitionViewIfSupported } from '@/client/lib/view-transition'
import { THEME_COOKIE } from '@/shared/utils/theme-cookie'

const logger = getLogger('theme')

type Theme = 'dark' | 'light' | 'system'
type Resolved = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: Resolved
}

const STORAGE_KEY = THEME_COOKIE

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
  const [resolvedTheme, setResolvedTheme] = useState<Resolved>(initialResolved)
  const [hydrated] = useState(() => typeof window !== 'undefined')
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') {
      return 'system'
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'dark' || stored === 'light' || stored === 'system') {
        return stored
      }
    } catch (err) {
      // Storage-restricted browsers throw SecurityError on any access.
      logger.warn('Failed to read theme preference', { error: err })
    }
    return 'system'
  })

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

    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      resolve()
      mql.addEventListener('change', resolve)
      return () => mql.removeEventListener('change', resolve)
    }
    resolve()
  }, [theme, hydrated])

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch (err) {
      logger.warn('Failed to persist theme preference', { error: err, theme: next })
    }
    // flushSync lands the render and applyTheme inside the view-transition update window.
    transitionViewIfSupported(() => {
      flushSync(() => setThemeState(next))
    })
  }, [])

  const value = useMemo(() => ({ theme, setTheme, resolvedTheme }), [theme, setTheme, resolvedTheme])

  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): ThemeContextType {
  const ctx = use(ThemeContext)
  if (ctx === null) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
