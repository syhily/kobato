import type { ReactNode } from 'react'

import { useSettingsFlushContext } from '@kobato/web-admin/ui/settings/shell/SettingsFlushProvider'

interface SettingsPanelProps {
  children: ReactNode
}

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
