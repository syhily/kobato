import type { ReactNode } from 'react'

import { cn } from '@/ui/lib/cn'

interface SettingGroupContentProps {
  children: ReactNode
  className?: string
}

export function SettingGroupContent({ children, className }: SettingGroupContentProps) {
  return <div className={cn('flex flex-col gap-6', className)}>{children}</div>
}
