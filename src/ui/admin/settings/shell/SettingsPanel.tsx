import type { ReactNode } from 'react'

import { useSettingsFlushContext } from '@/ui/admin/settings/shell/SettingsFlushProvider'

interface SettingsPanelProps {
  children: ReactNode
}

/**
 * The settings workspace. A cross-card transaction (the locale switch: flush →
 * locale commit → reload) marks the WHOLE panel `inert` and `aria-busy`, so no
 * edit can land during the window and the reload cannot drop input typed on
 * another card. The provider owns the flag and restores focus afterwards.
 */
export function SettingsPanel({ children }: SettingsPanelProps) {
  const { isTransactionPending } = useSettingsFlushContext()

  return (
    <div
      className="fixed inset-0 z-50 flex size-full bg-background"
      inert={isTransactionPending || undefined}
      aria-busy={isTransactionPending || undefined}
    >
      {children}
    </div>
  )
}
