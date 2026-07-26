import { Moon, Sun } from 'lucide-react'

import { Button } from '@/ui/components/button'
import { IconButtonContent } from '@/ui/components/icon-button-content'
import { useTheme } from '@/ui/lib/ThemeProvider'

interface ThemeToggleProps {
  mode: 'public' | 'admin'
  variant?: 'rail' | 'floating'
}

// Glyph describes the action (Moon → dark, Sun → light). Both icons stay in the DOM;
// `dark:` swaps via opacity + scale so noscript dark-OS visitors get the right icon pre-hydration.
const moonClass = 'm-icon-inset transition-all dark:scale-0 dark:opacity-0'
const sunClass = 'absolute inset-0 m-auto scale-0 opacity-0 transition-all dark:scale-100 dark:opacity-100'

export function ThemeToggle({ mode, variant = 'rail' }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()

  const toggle = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  if (mode === 'public') {
    const a11y = (
      <>
        <span className="sr-only dark:hidden">切换到暗色模式</span>
        <span className="sr-only hidden dark:inline">切换到亮色模式</span>
      </>
    )
    const staticTitle = '切换深浅色模式'

    if (variant === 'floating') {
      return (
        <Button variant="fab" size="iconLg" shape="pill" onClick={toggle} title={staticTitle}>
          <IconButtonContent>
            <Moon size="1em" aria-hidden className={moonClass} />
            <Sun size="1em" aria-hidden className={sunClass} />
          </IconButtonContent>
          {a11y}
        </Button>
      )
    }
    return (
      <Button
        variant="dark"
        size="iconSm"
        shape="circle"
        className="mr-2 max-lg:hidden"
        onClick={toggle}
        title={staticTitle}
      >
        <IconButtonContent>
          <Sun size="1em" aria-hidden className={sunClass} />
          <Moon size="1em" aria-hidden className={moonClass} />
        </IconButtonContent>
        {a11y}
      </Button>
    )
  }

  const adminLabel = resolvedTheme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="relative text-foreground hover:text-primary focus-visible:text-primary"
      title={adminLabel}
    >
      <Sun data-icon className="transition-all dark:scale-0 dark:opacity-0" />
      <Moon data-icon className="absolute scale-0 opacity-0 transition-all dark:scale-100 dark:opacity-100" />
      <span className="sr-only">{adminLabel}</span>
    </Button>
  )
}
