import { useState } from 'react'

export function SearchShortcutHint() {
  // Lazy initializer runs once on mount; `navigator.platform` is stable
  // for the component's lifetime so this avoids a render+effect cycle.
  const [isMac] = useState(() => typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform))
  return (
    <span className="flex items-center gap-1" aria-label={isMac ? '快捷键：Command K' : '快捷键：Ctrl K'}>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-sm font-semibold text-foreground">
        {isMac ? '⌘' : 'Ctrl'}
      </kbd>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-sm font-semibold text-foreground">K</kbd>
    </span>
  )
}
