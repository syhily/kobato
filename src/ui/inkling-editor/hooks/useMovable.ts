import { useCallback, useEffect, useRef, type RefObject } from 'react'

// TODO: this is a temporary fix, replacement for ember's id, need better solution
function guidFor(): string {
  // create unique id
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

interface MovablePosition {
  x: number
  y: number
}

interface MovablePositionWithSpacing extends MovablePosition {
  lastSpacing?: MovableSpacing | null
}

interface MovableSpacing {
  top: number
  left: number
  right: number
  bottom: number
}

interface MovableRefPosition extends MovablePositionWithSpacing {
  lastSpacing: MovableSpacing | null
}

type AdjustOnResize = (el: HTMLElement | null, position: MovableRefPosition) => MovablePosition

type AdjustOnDrag = (el: HTMLElement | null, position: MovableRefPosition) => MovablePosition

interface UseMovableOptions {
  adjustOnResize?: AdjustOnResize
  adjustOnDrag?: AdjustOnDrag
}

interface UseMovableResult {
  ref: RefObject<HTMLElement | null>
  setPosition: (position: MovablePosition) => void
  getPosition: () => MovablePositionWithSpacing
}

/**
 * useMovable
 * @param {Object} options
 * @param {Function} options.adjustOnResize - function called when panel size was changed
 * @returns {Object} ref - a ref that should be attached to the element that should be movable
 *
 * @description
 * useMovable is a hook that allows an element to be moved around the screen by dragging it.
 *
 * @example
 * const {ref} = useMovable();
 */
export default function useMovable({ adjustOnResize, adjustOnDrag }: UseMovableOptions = {}): UseMovableResult {
  const ref = useRef<HTMLElement | null>(null)

  const moveThreshold = 3

  // Use refs to avoid re-renders, see https://reactjs.org/docs/hooks-faq.html#is-there-something-like-instance-variables
  const active = useRef<boolean>(false)
  const currentX = useRef<number>(0)
  const currentY = useRef<number>(0)

  /**
   * Cursor offset from the left top side of the panel on touchstart/mousedown
   */
  const offsetX = useRef<number>(0)
  const offsetY = useRef<number>(0)

  // Keep track of spacing, so we can allow negative spacing when resizing if the user placed the window outside the canvas
  // Contains an object with top, left, right and bottom spacing between the panel and the viewport
  const lastSpacing = useRef<MovableSpacing | null>(null)

  const originalOverflow = useRef<string>('')
  const guid = guidFor()

  // React event handlers get added to the root element, so if we add listeners to the ref directly
  // and call stopPropagation they stop any React events on child nodes from firing.
  // Instead we add the listeners to the body and check if the event target is the ref.
  const addRefEventListener = <K extends keyof DocumentEventMap>(
    event: K,
    handler: (e: DocumentEventMap[K]) => void,
  ) => {
    const listener = (e: Event) => {
      const targetEvent = e as DocumentEventMap[K]
      if (ref.current?.contains(targetEvent.target as Node)) {
        handler(targetEvent)
      }
    }

    document.body.addEventListener(event, listener, false)

    return listener
  }

  const cancelClick = useCallback((e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const setTranslate = useCallback(
    (xPos: number, yPos: number) => {
      if (ref.current) {
        ref.current.style.transform = `translate(${xPos}px, ${yPos}px)`
      }
    },
    [ref],
  )

  const setPosition = useCallback(
    ({ x, y }: MovablePosition) => {
      currentX.current = x
      currentY.current = y

      if (!ref.current) {
        return
      }
      const width = ref.current.offsetWidth
      const height = ref.current.offsetHeight

      // Update spacing
      const spacing: MovableSpacing = {
        top: y,
        left: x,
        right: window.innerWidth - x - width,
        bottom: window.innerHeight - y - height,
      }
      lastSpacing.current = spacing

      setTranslate(x, y)
    },
    [setTranslate],
  )

  const getPosition = useCallback((): MovablePositionWithSpacing => {
    return {
      x: currentX.current,
      y: currentY.current,
      lastSpacing: lastSpacing.current,
    }
  }, [])

  const disableScroll = useCallback(() => {
    if (!ref.current) {
      return
    }
    originalOverflow.current = ref.current.style.overflow
    ref.current.style.overflow = 'hidden'
  }, [ref])

  const enableScroll = useCallback(() => {
    if (ref.current) {
      ref.current.style.overflow = originalOverflow.current
    }
  }, [ref])

  const disableSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()

    const stylesheet = document.createElement('style')
    stylesheet.id = `stylesheet-${guid}`

    document.head.appendChild(stylesheet)

    stylesheet.sheet?.insertRule('* { user-select: none !important; }', 0)
  }, [guid])

  const enableSelection = useCallback(() => {
    const stylesheet = document.getElementById(`stylesheet-${guid}`)
    stylesheet?.remove()
  }, [guid])

  // disabling pointer events prevents inputs being activated when drag finishes,
  // preventing clicks stops any event handlers that may otherwise result in the
  // movable element being closed when the drag finishes
  const disablePointerEvents = useCallback(() => {
    if (ref.current) {
      ref.current.style.pointerEvents = 'none'
    }
    window.addEventListener('click', cancelClick, { capture: true, passive: false } as AddEventListenerOptions)
  }, [ref, cancelClick])

  const enablePointerEvents = useCallback(() => {
    if (ref.current) {
      ref.current.style.pointerEvents = ''
    }
    window.removeEventListener('click', cancelClick, { capture: true })
  }, [ref, cancelClick])

  const drag = useCallback(
    (e: TouchEvent | MouseEvent) => {
      let eventX: number
      let eventY: number

      if (e instanceof TouchEvent) {
        eventX = e.touches[0].clientX
        eventY = e.touches[0].clientY
      } else {
        eventX = e.clientX
        eventY = e.clientY
      }

      if (!active.current) {
        if (
          Math.abs(eventX - offsetX.current - currentX.current) > moveThreshold ||
          Math.abs(eventY - offsetY.current - currentY.current) > moveThreshold
        ) {
          disableScroll()
          disableSelection()
          disablePointerEvents()
          active.current = true
        }
      }

      if (active.current) {
        let position: MovablePosition = {
          x: eventX - offsetX.current,
          y: eventY - offsetY.current,
        }

        if (adjustOnDrag) {
          position = adjustOnDrag(ref.current, { ...position, lastSpacing: lastSpacing.current })
        }

        setPosition(position)
      }
    },
    [moveThreshold, setPosition, disableScroll, disableSelection, disablePointerEvents, adjustOnDrag],
  )

  const dragEnd = useCallback(
    (_e?: Event) => {
      active.current = false

      window.removeEventListener('touchend', dragEnd as EventListener, { capture: true })
      window.removeEventListener('touchmove', drag as EventListener, { capture: true })
      window.removeEventListener('mouseup', dragEnd as EventListener, { capture: true })
      window.removeEventListener('mousemove', drag as EventListener, { capture: true })

      // Removing this immediately results in the click event behind re-enabled in the same
      // event loop meaning that it doesn't have the desired effect when dragging out of the canvas.
      // Putting in the next tick stops the immediate click event firing when finishing drag
      setTimeout(() => {
        window.removeEventListener('click', cancelClick, { capture: true })
      }, 1)

      enableScroll()
      enableSelection()

      // timeout required so immediate events blocked until the dragEnd has fully realised
      setTimeout(() => {
        enablePointerEvents()
      }, 5)
    },
    [enableScroll, enableSelection, enablePointerEvents, drag, cancelClick],
  )

  const addActiveEventListeners = useCallback(() => {
    window.addEventListener('touchend', dragEnd as EventListener, { capture: true, passive: true })
    window.addEventListener('touchmove', drag as EventListener, { capture: true, passive: true })
    window.addEventListener('mouseup', dragEnd as EventListener, { capture: true, passive: true })
    window.addEventListener('mousemove', drag as EventListener, { capture: true, passive: true })
  }, [dragEnd, drag])

  const dragStart = useCallback(
    (e: TouchEvent | MouseEvent) => {
      e.stopPropagation()
      active.current = false

      if (e.type === 'touchstart' || (e instanceof MouseEvent && e.button === 0)) {
        if (e instanceof TouchEvent) {
          offsetX.current = e.touches[0].clientX - (currentX.current || 0)
          offsetY.current = e.touches[0].clientY - (currentY.current || 0)
        } else if (e instanceof MouseEvent) {
          offsetX.current = e.clientX - (currentX.current || 0)
          offsetY.current = e.clientY - (currentY.current || 0)
        }

        const path = e.composedPath?.() ?? []
        for (const element of path) {
          const el = element as Element
          if (el?.matches?.('input, .ember-basic-dropdown-trigger')) {
            break
          }

          if (el === ref.current) {
            addActiveEventListeners()
            break
          }
        }
      }
    },
    [ref, addActiveEventListeners],
  )

  const addStartEventListeners = useCallback(() => {
    const touchStartListener = addRefEventListener('touchstart', dragStart)
    const mouseDownListener = addRefEventListener('mousedown', dragStart)

    return () => {
      ref.current?.removeEventListener('touchstart', touchStartListener)
      ref.current?.removeEventListener('mousedown', mouseDownListener)
    }
  }, [dragStart])

  const removeActiveEventListeners = useCallback(() => {
    window.removeEventListener('touchend', dragEnd as EventListener, { capture: true })
    window.removeEventListener('touchmove', drag as EventListener, { capture: true })
    window.removeEventListener('mouseup', dragEnd as EventListener, { capture: true })
    window.removeEventListener('mousemove', drag as EventListener, { capture: true })

    // Removing this immediately results in the click event behind re-enabled in the same
    // event loop meaning that it doesn't have the desired effect when dragging out of the canvas.
    // Putting in the next tick stops the immediate click event firing when finishing drag
    setTimeout(() => {
      window.removeEventListener('click', cancelClick, { capture: true })
    }, 1)
  }, [dragEnd, drag, cancelClick])

  useEffect(() => {
    const elem = ref.current
    if (!elem) {
      return
    }
    elem.setAttribute('draggable', 'true')
    elem.classList.add('inkling-card-movable')
    let _resizeObserver: ResizeObserver | undefined
    const removeStartEventListeners = addStartEventListeners()

    if (adjustOnResize) {
      _resizeObserver = new ResizeObserver(() => {
        if (currentX.current === 0 || currentY.current === 0) {
          return
        }

        const position = adjustOnResize(elem, {
          x: currentX.current,
          y: currentY.current,
          lastSpacing: lastSpacing.current,
        })

        if (position.x !== currentX.current || position.y !== currentY.current) {
          // Adjust offsetX and offsetY to account for the difference in position moved
          // This is to make sure we don't jump drag position if the element is resized just after touch start
          // Say you start dragging on a button that opens a collapsible section, if the section is resized -> this fixes glitches
          offsetX.current = offsetX.current - (position.x - currentX.current)
          offsetY.current = offsetY.current - (position.y - currentY.current)
          setPosition(position)
        }
      })
      _resizeObserver.observe(elem)
    }

    // Cleanup event listeners on unmount
    return () => {
      removeStartEventListeners()
      removeActiveEventListeners()
      _resizeObserver?.disconnect()
      enableSelection()
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ref, setPosition, getPosition }
}
