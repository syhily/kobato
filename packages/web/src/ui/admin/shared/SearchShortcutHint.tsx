import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { Suspense, use } from 'react'
import { browser } from 'react-dom'

function ShortcutKeys({ isMac }: { isMac: boolean }) {
  const { t } = useI18n()
  return (
    <span
      className="flex items-center gap-1"
      aria-label={isMac ? t('admin.shared.shortcut.ariaMac') : t('admin.shared.shortcut.ariaOther')}
    >
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
