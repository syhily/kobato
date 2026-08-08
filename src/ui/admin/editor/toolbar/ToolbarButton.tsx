import type { ReactNode } from 'react'

import { Button } from '@/ui/components/button'

export interface ToolbarButtonProps {
  title: string
  state?: 'active' | 'inactive'
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

// Single source of truth for toolbar buttons; `title` doubles as `aria-label`.
export function ToolbarButton({ title, state, disabled, onClick, children }: ToolbarButtonProps) {
  const isActive = state === 'active'
  return (
    <Button
      type="button"
      variant={isActive ? 'secondary' : 'ghost'}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
    >
      {children}
    </Button>
  )
}
