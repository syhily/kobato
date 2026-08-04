import type { ReactNode } from 'react'

import { cn } from '@kobato/ui/lib/cn'

interface SettingGroupContentProps {
  children: ReactNode
  className?: string
}

// Content wrapper for a `SettingGroup`.
// Provides consistent vertical spacing between rows (e.g. `SettingValue`s)
// and the canonical two-column responsive grid.
export function SettingGroupContent({ children, className }: SettingGroupContentProps) {
  return <div className={cn('flex flex-col gap-6', className)}>{children}</div>
}
