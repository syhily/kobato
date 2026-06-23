import { forwardRef } from 'react'

import { cn } from '@/ui/lib/cn'

/**
 * Card visual shell — ported from Koenig's CardWrapper.jsx.
 *
 * Renders the selection ring (2px green on selected, 1px green on hover),
 * width wrapper classes, and an optional drag handle indicator. This is the
 * purely visual layer — state management lives in KoenigCardWrapper which
 * provides CardContext.
 *
 * Differences from Koenig:
 *   - No wide/full width card classes (we don't have that layout yet)
 *   - No visibility indicator (visibility feature removed)
 *   - No prop-types (TypeScript interface instead)
 */
export type CardWrapperStyle = 'regular' | 'border' | 'code-card'

export interface CardWrapperProps {
  isSelected?: boolean
  wrapperStyle?: CardWrapperStyle
  width?: 'regular'
  isDragging?: boolean
  className?: string
  children: React.ReactNode
}

export const CardWrapper = forwardRef<HTMLDivElement, CardWrapperProps>(function CardWrapper(
  { isSelected = false, wrapperStyle = 'regular', isDragging = false, className, children },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'relative transition-shadow duration-100',
        // Selection ring — 2px green when selected, 1px green on hover when not selected
        isSelected && 'z-20 shadow-[0_0_0_2px] shadow-green',
        !isSelected && 'hover:shadow-[0_0_0_1px] hover:shadow-green',
        // code-card negative margin so the editor chrome extends to the card edges
        wrapperStyle === 'code-card' && '-mx-6',
        // Hide content while dragging (card is being moved, show empty placeholder)
        isDragging && 'opacity-0',
        className,
      )}
      data-kg-card
      data-kg-card-selected={isSelected}
    >
      {children}
    </div>
  )
})
