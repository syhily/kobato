import React from 'react'

import type { CardWidth } from '@/nodes/base/utils/card-widths'

import { useInklingLabels } from '@/hooks/useInklingLabels'
import { interpolateLabel } from '@/labels/inkling-labels'

const CARD_WIDTH_CLASSES: Partial<Record<CardWidth, string>> = {
  wide: [
    'w-[calc(75vw-var(--inkling-breakout-adjustment-with-fallback)+2px)] mx-[calc(50%-(50vw-var(--inkling-breakout-adjustment-with-fallback))-.8rem)] min-w-[calc(100%+3.6rem)] translate-x-[calc(50vw-50%+.8rem-var(--inkling-breakout-adjustment-with-fallback))]',
    'md:min-w-[calc(100%+10rem)]',
    'lg:min-w-[calc(100%+18rem)]',
  ].join(' '),
  full: 'inset-x-[-1px] mx-[calc(50%-50vw)] w-[calc(100vw+2px)] lg:mx-[calc(50%-50vw+(var(--inkling-breakout-adjustment-with-fallback)/2))] lg:w-[calc(100vw-var(--inkling-breakout-adjustment-with-fallback)+2px)]',
}

interface CardWrapperProps {
  cardType?: string
  cardWidth?: CardWidth
  IndicatorIcon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  isDragging?: boolean
  isEditing?: boolean
  isSelected?: boolean
  wrapperStyle?: string
  children?: React.ReactNode
}

export const CardWrapper = React.forwardRef<HTMLDivElement, CardWrapperProps>(
  (
    { cardType, cardWidth = 'regular', IndicatorIcon, isDragging, isEditing, isSelected, wrapperStyle, children },
    ref,
  ) => {
    const labels = useInklingLabels()

    const wrapperClass = () => {
      if (wrapperStyle === 'wide' && (isEditing || isSelected)) {
        return '!-mx-3 !px-3'
      } else if (wrapperStyle === 'code-card' && isEditing) {
        return '-mx-6'
      } else if (wrapperStyle === 'wide') {
        return 'hover:-mx-3 hover:px-3'
      } else {
        return 'border'
      }
    }

    const className = [
      'relative border-transparent caret-grey-800',
      isSelected ? 'z-20' : 'z-10', // ensure setting panels sit above other cards
      isSelected && !isDragging ? 'shadow-[0_0_0_2px] shadow-green' : '',
      !isSelected && !isDragging ? 'hover:shadow-[0_0_0_1px] hover:shadow-green' : '',
      CARD_WIDTH_CLASSES[cardWidth] || '',
      wrapperClass(),
    ].join(' ')

    let indicatorIcon: React.ReactNode = null
    if (IndicatorIcon) {
      indicatorIcon = (
        <div className="sticky top-0 lg:top-8">
          <IndicatorIcon
            aria-label={interpolateLabel(labels['aria.indicator'], { cardType: cardType ?? '' })}
            className="absolute left-[-6rem] size-5 text-grey"
            style={{ top: '.6rem' }}
          />
        </div>
      )
    }

    return (
      <>
        {indicatorIcon}
        <div
          ref={ref}
          className={className}
          data-inkling-card={cardType}
          data-inkling-card-editing={isEditing}
          data-inkling-card-selected={isSelected}
        >
          {children}
        </div>
      </>
    )
  },
)

CardWrapper.displayName = 'CardWrapper'
