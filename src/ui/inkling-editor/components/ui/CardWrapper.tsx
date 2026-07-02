import React from 'react'

import VisibilityIndicator from '@/ui/inkling-editor/assets/icons/inkling-indicator-visibility.svg?react'

const CARD_WIDTH_CLASSES: Record<string, string> = {
  wide: [
    'w-[calc(75vw-var(--inkling-breakout-adjustment-with-fallback)+2px)] mx-[calc(50%-(50vw-var(--inkling-breakout-adjustment-with-fallback))-.8rem)] min-w-[calc(100%+3.6rem)] translate-x-[calc(50vw-50%+.8rem-var(--inkling-breakout-adjustment-with-fallback))]',
    'md:min-w-[calc(100%+10rem)]',
    'lg:min-w-[calc(100%+18rem)]',
  ].join(' '),
  full: 'inset-x-[-1px] mx-[calc(50%-50vw)] w-[calc(100vw+2px)] lg:mx-[calc(50%-50vw+(var(--inkling-breakout-adjustment-with-fallback)/2))] lg:w-[calc(100vw-var(--inkling-breakout-adjustment-with-fallback)+2px)]',
}

const DEFAULT_INDICATOR_POSITION = {
  top: '.6rem',
}

interface CardWrapperProps {
  cardType?: string
  cardWidth?: 'wide' | 'full' | 'regular'
  feature?: boolean | object
  // oxlint-disable-next-line typescript/no-explicit-any
  IndicatorIcon?: React.ComponentType<any>
  indicatorPosition?: { top?: string; left?: string }
  isDragging?: boolean
  isEditing?: boolean
  isSelected?: boolean
  isVisibilityActive?: boolean
  onIndicatorClick?: (event: React.MouseEvent) => void
  wrapperStyle?: string
  children?: React.ReactNode
  // oxlint-disable-next-line typescript/no-explicit-any
  [key: string]: any
}

export const CardWrapper = React.forwardRef<HTMLDivElement, CardWrapperProps>(
  (
    {
      cardType,
      cardWidth = 'regular',
      feature,
      IndicatorIcon,
      indicatorPosition = DEFAULT_INDICATOR_POSITION,
      isDragging,
      isEditing,
      isSelected,
      isVisibilityActive,
      onIndicatorClick,
      wrapperStyle,
      children,
      ...props
    },
    ref,
  ) => {
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
      CARD_WIDTH_CLASSES[cardWidth as keyof typeof CARD_WIDTH_CLASSES] || '',
      wrapperClass(),
    ].join(' ')

    const position = {
      ...DEFAULT_INDICATOR_POSITION,
      ...indicatorPosition,
      ...(cardType === 'call-to-action' && { top: '1.4rem' }),
    }

    let indicatorIcon
    if (isVisibilityActive) {
      indicatorIcon = (
        <div className="sticky top-0 lg:top-8">
          <VisibilityIndicator
            aria-label="Card is hidden for select audiences"
            className="absolute left-[-6rem] size-5 cursor-pointer text-grey"
            data-testid="visibility-indicator"
            style={{
              left: position.left,
              top: position.top,
            }}
            onClick={onIndicatorClick}
          />
        </div>
      )
    } else if (IndicatorIcon) {
      indicatorIcon = (
        <div className="sticky top-0 lg:top-8">
          <IndicatorIcon
            aria-label={`${cardType} indicator`}
            className="absolute left-[-6rem] size-5 text-grey"
            style={{
              left: position.left,
              top: position.top,
            }}
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
          {...props}
        >
          {children}
        </div>
      </>
    )
  },
)

CardWrapper.displayName = 'CardWrapper'
