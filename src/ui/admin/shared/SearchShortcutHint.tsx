import { useEffect, useState } from 'react'

export function SearchShortcutHint() {
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform))
  }, [])
  return (
    <span className="flex items-center gap-1" aria-label={isMac ? '快捷键：Command K' : '快捷键：Ctrl K'}>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-sm font-semibold text-foreground">
        {isMac ? '⌘' : 'Ctrl'}
      </kbd>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-sm font-semibold text-foreground">K</kbd>
    </span>
  )
}
