import { cn } from '@/ui/lib/cn'

/**
 * Card selection toolbar — ported from Koenig's ActionToolbar.jsx.
 *
 * Renders a floating toolbar above a selected card (top: -46px). Hidden while
 * dragging. Children are the actual buttons — typically <ToolbarMenu> with
 * <ToolbarMenuItem> entries (edit, delete, etc.).
 *
 * The card component controls visibility via `isVisible` (usually
 * `isSelected && !isEditing`).
 */
export function ActionToolbar({
  isVisible = false,
  children,
  className,
}: {
  isVisible?: boolean
  children?: React.ReactNode
  className?: string
}) {
  if (!isVisible) {
    return null
  }
  return (
    <div className={cn('not-kg-prose absolute top-[-46px] left-1/2 z-[1000]', '-translate-x-1/2', className)}>
      {children}
    </div>
  )
}
