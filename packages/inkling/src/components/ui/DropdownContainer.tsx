import React, { useLayoutEffect } from 'react'

import { debounce } from '@/utils'
import { cx } from '@/utils/cx'
import { POPUP_LIST_MAX_HEIGHT } from '@/utils/selection-anchored-popup'

/**
 * Note: when using the DropdownContainer, make sure the input and the dropdown both are in a relative container with a defined z-index (or new stacking context)
 * Make sure the input has a background color, to avoid the shadow of the dropdown showing through
 *
 * Displays the dropdown above or below the parent element, depending on the space available in the viewport.
 * The parent should be positioned relative.
 */
interface DropdownContainerProps {
  dataTestId?: string
  className?: string
  placementTopClass?: string
  placementBottomClass?: string
  children?: React.ReactNode
}

export function DropdownContainer({
  dataTestId,
  className = 'z-[-1] w-full overflow-y-auto bg-white shadow rounded-lg dark:border-grey-800 dark:bg-grey-900',
  placementTopClass = '-top-0.5 -translate-y-full',
  placementBottomClass = 'mt-0.5',
  children,
}: DropdownContainerProps) {
  const divRef = React.useRef<HTMLUListElement | null>(null)

  const [placement, setPlacement] = React.useState<'top' | 'bottom'>('bottom')

  const updatePlacement = () => {
    const list = divRef.current
    const parent = list?.parentNode
    if (!list || !(parent instanceof HTMLElement)) {
      return
    }

    // Get the position of the list's parent on the screen
    const box = parent.getBoundingClientRect()
    const bottom = box.bottom
    const spaceBelow = window.innerHeight - bottom

    if (spaceBelow < list.offsetHeight) {
      setPlacement('top')
    } else {
      setPlacement('bottom')
    }
  }

  useLayoutEffect(() => {
    updatePlacement()
  }, [])

  // Add event listeners
  React.useEffect(() => {
    const updatePlacementDebounced = debounce(() => {
      updatePlacement()
    }, 250)

    // For now we don't listen for scroll because all the panels are positioned fixed
    // Can add it here if needed
    const handler = () => updatePlacementDebounced()
    window.addEventListener('resize', handler, { passive: true })

    return () => {
      window.removeEventListener('resize', handler)
      updatePlacementDebounced.cancel()
    }
  }, [])

  return (
    <ul
      ref={divRef}
      className={cx(
        'absolute',
        placement === 'top' && placementTopClass,
        placement === 'bottom' && placementBottomClass,
        className,
      )}
      // Single-sourced with the selection-anchored popup flip budget — a
      // tailwind arbitrary value cannot reference the constant.
      style={{ maxHeight: POPUP_LIST_MAX_HEIGHT }}
      data-testid={dataTestId ? `${dataTestId}-dropdown` : undefined}
    >
      {children}
    </ul>
  )
}
