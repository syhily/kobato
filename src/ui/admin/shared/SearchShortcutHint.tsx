import { useSyncExternalStore } from 'react'

function emptySubscribe(): () => void {
  return () => undefined
}

function getIsMacSnapshot(): boolean {
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

function getIsMacServerSnapshot(): boolean {
  return false
}

export function SearchShortcutHint() {
  const isMac = useSyncExternalStore(emptySubscribe, getIsMacSnapshot, getIsMacServerSnapshot)
  return (
    <span className="flex items-center gap-1" aria-label={isMac ? '快捷键：Command K' : '快捷键：Ctrl K'}>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-sm font-semibold text-foreground">
        {isMac ? '⌘' : 'Ctrl'}
      </kbd>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-sm font-semibold text-foreground">K</kbd>
    </span>
  )
}
