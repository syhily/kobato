import type { ReactNode } from 'react'

import { cn } from '@kobato/ui/lib/cn'

export interface IconButtonContentProps {
  children: ReactNode
  /** Extra classes appended to the centring wrapper. Rare — most callers don't need this. */
  className?: string
}

export function IconButtonContent({ children, className }: IconButtonContentProps) {
  return <span className={cn('absolute top-0 flex size-full items-center justify-center', className)}>{children}</span>
}
