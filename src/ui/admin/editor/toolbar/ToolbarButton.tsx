import type { ReactNode } from 'react'

import { Button } from '@/ui/components/button'

export interface ToolbarButtonProps {
  title: string
  state?: 'active' | 'inactive'
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

// Single source of truth for every toolbar / group button in the
// page editor. Variant flip on `state` mirrors the rest of the editor
// chrome (ghost vs secondary), and `title` doubles as `aria-label` so
// screen readers and tooltips agree.
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
