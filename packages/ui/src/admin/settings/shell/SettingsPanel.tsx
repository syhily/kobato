import type { ReactNode } from 'react'

interface SettingsPanelProps {
  children: ReactNode
}

export function SettingsPanel({ children }: SettingsPanelProps) {
  return <div className="fixed inset-0 z-50 flex size-full bg-background">{children}</div>
}
