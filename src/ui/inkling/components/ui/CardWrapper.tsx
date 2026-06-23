import { forwardRef } from 'react'

import { cn } from '@/ui/lib/cn'

/**
 * Card visual shell — faithful port of Koenig's CardWrapper.jsx.
 *
 * Renders the selection ring and handles the wrapper styling for different
 * card types. The ref is attached to the outer div so KoenigCardWrapper can
 * register its native mousedown listener on this element.
 *
 * Removed from Koenig: wide/full CARD_WIDTH_CLASSES, VisibilityIndicator,
 * IndicatorIcon, cardWidth prop (always 'regular').
 */

export type CardWrapperStyle = 'regular' | 'border' | 'code-card' | 'wide'

export interface CardWrapperProps {
  cardType?: string
  isDragging?: boolean
  isEditing?: boolean
  isSelected?: boolean
  wrapperStyle?: CardWrapperStyle
  width?: 'regular'
  className?: string
  children: React.ReactNode
}

function wrapperClass(wrapperStyle: CardWrapperStyle | undefined, isEditing: boolean, isSelected: boolean): string {
  if (wrapperStyle === 'wide' && (isEditing || isSelected)) {
    return '!-mx-3 !px-3'
  }
  if (wrapperStyle === 'code-card' && isEditing) {
    return '-mx-6'
  }
  if (wrapperStyle === 'wide') {
    return 'hover:-mx-3 hover:px-3'
  }
  return 'border'
}

export const CardWrapper = forwardRef<HTMLDivElement, CardWrapperProps>(function CardWrapper(
  {
    cardType,
    isDragging = false,
    isEditing = false,
    isSelected = false,
    wrapperStyle = 'regular',
    className,
    children,
  },
  ref,
) {
  const classes = cn(
    'relative border-transparent caret-grey-800',
    isSelected ? 'z-20' : 'z-10',
    isSelected && !isDragging && 'shadow-[0_0_0_2px] shadow-green',
    !isSelected && !isDragging && 'hover:shadow-[0_0_0_1px] hover:shadow-green',
    wrapperClass(wrapperStyle, isEditing, isSelected),
    className,
  )

  return (
    <div
      ref={ref}
      className={classes}
      data-kg-card={cardType}
      data-kg-card-editing={isEditing}
      data-kg-card-selected={isSelected}
    >
      {children}
    </div>
  )
})
