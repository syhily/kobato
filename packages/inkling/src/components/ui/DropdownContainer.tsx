import { debounce } from '@kobato/inkling-internal/utils'
import { cx } from '@kobato/inkling-internal/utils/cx'
import { POPUP_LIST_MAX_HEIGHT } from '@kobato/inkling-internal/utils/selection-anchored-popup'
import React, { useLayoutEffect } from 'react'

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

  const updatePlacement = React.useCallback(() => {
    const list = divRef.current
    const parent = list?.parentNode
    if (!list || !(parent instanceof HTMLElement)) {
      return
    }

    const box = parent.getBoundingClientRect()
    const bottom = box.bottom
    const spaceBelow = window.innerHeight - bottom

    if (spaceBelow < list.offsetHeight) {
      setPlacement('top')
    } else {
      setPlacement('bottom')
    }
  }, [])

  useLayoutEffect(() => {
    updatePlacement()
  }, [updatePlacement])

  React.useEffect(() => {
    const updatePlacementDebounced = debounce(() => {
      updatePlacement()
    }, 250)

    const handler = () => updatePlacementDebounced()
    window.addEventListener('resize', handler, { passive: true })

    return () => {
      window.removeEventListener('resize', handler)
      updatePlacementDebounced.cancel()
    }
  }, [updatePlacement])

  return (
    <ul
      ref={divRef}
      className={cx(
        'absolute',
        placement === 'top' && placementTopClass,
        placement === 'bottom' && placementBottomClass,
        className,
      )}
      style={{ maxHeight: POPUP_LIST_MAX_HEIGHT }}
      data-testid={dataTestId ? `${dataTestId}-dropdown` : undefined}
    >
      {children}
    </ul>
  )
}
