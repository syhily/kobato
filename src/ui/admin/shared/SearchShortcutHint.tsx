import { Suspense, use } from 'react'
import { browser } from 'react-dom'

function ShortcutKeys({ isMac }: { isMac: boolean }) {
  return (
    <span className="flex items-center gap-1" aria-label={isMac ? '快捷键：Command K' : '快捷键：Ctrl K'}>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-sm font-semibold text-foreground">
        {isMac ? '⌘' : 'Ctrl'}
      </kbd>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-sm font-semibold text-foreground">K</kbd>
    </span>
  )
}

function PlatformShortcutKeys() {
  use(browser())
  return <ShortcutKeys isMac={/Mac|iPod|iPhone|iPad/.test(navigator.platform)} />
}

export function SearchShortcutHint() {
  return (
    <Suspense fallback={<ShortcutKeys isMac={false} />}>
      <PlatformShortcutKeys />
    </Suspense>
  )
}
