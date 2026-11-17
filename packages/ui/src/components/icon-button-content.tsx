import type { ReactNode } from 'react'

import { cn } from '@kobato/ui/lib/cn.ts'

export interface IconButtonContentProps {
  children: ReactNode
  /** Extra classes appended to the centring wrapper. */
  className?: string
}

export function IconButtonContent({ children, className }: IconButtonContentProps) {
  return <span className={cn('absolute top-0 flex size-full items-center justify-center', className)}>{children}</span>
}
