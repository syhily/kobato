import type { PanelSuppression } from '@kobato/inkling-internal/utils/panel-suppression'
import type { RefObject } from 'react'

import {
  clampOnDrag,
  clampOnResize,
  driftTowardsInitial,
  isMobileViewport,
  resolveCardOrigin,
  resolveCardWidthTransition,
  resolveInitialPanelPosition,
  type PanelPosition,
  type PanelSize,
  type PanelSpacing,
  type PanelViewport,
} from '@kobato/inkling-internal/utils/floating-panel'
import {
  createPanelDragSession,
  type PanelDragActiveListeners,
} from '@kobato/inkling-internal/utils/panel-drag-session'
import { getScrollAncestor } from '@kobato/inkling-internal/utils/scroll-ancestor'
import { debounce } from '@kobato/inkling-internal/utils/timing'

export interface PanelReclampInput {
  position: PanelPosition
  lastSpacing: PanelSpacing | null
  panelSize: PanelSize
  viewport: PanelViewport
  origin: PanelPosition
}

export interface PanelReclamp {
  position: PanelPosition
  offsetDelta: PanelPosition
}

export function resolvePanelReclamp({
  position,
  lastSpacing,
  panelSize,
  viewport,
  origin,
}: PanelReclampInput): PanelReclamp | null {
  const clamped = clampOnResize({ ...position, panelSize, viewport, origin, lastSpacing })
  if (clamped.x === position.x && clamped.y === position.y) {
    return null
  }
  return { position: clamped, offsetDelta: { x: clamped.x - position.x, y: clamped.y - position.y } }
}

export interface PanelViewportShiftInput {
  position: PanelPosition

  initial: PanelPosition | undefined
  previousViewport: PanelViewport
  viewport: PanelViewport
  lastSpacing: PanelSpacing | null
  panelSize: PanelSize | null
  origin: PanelPosition
}

export function resolvePanelViewportShift({
  position,
  initial,
  previousViewport,
  viewport,
  lastSpacing,
  panelSize,
  origin,
}: PanelViewportShiftInput): PanelPosition {
  const drifted = driftTowardsInitial(position, initial, previousViewport, viewport)
  return clampOnResize({ ...drifted, panelSize, viewport, origin, lastSpacing })
}

function eventPoint(e: Event): PanelPosition | null {
  if (e instanceof TouchEvent) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  if (e instanceof MouseEvent) {
    return { x: e.clientX, y: e.clientY }
  }
  return null
}

export interface PanelDomWiringPorts {
  getElement: () => HTMLElement | null

  resolveCardElement: () => HTMLElement | null

  getCommittedPosition: () => { x: number | undefined; y: number | undefined; lastSpacing: PanelSpacing | null }

  getPosition: () => PanelPosition & { lastSpacing: PanelSpacing | null }
  setPosition: (position: PanelPosition) => void
  getViewport: () => PanelViewport
  getCardWidth: () => string
  previousCardWidth: RefObject<string>
  previousCardOrigin: RefObject<PanelPosition>
  previousViewport: RefObject<PanelViewport>
  isPanel: (element: unknown) => boolean
  isInteractive: (element: unknown) => boolean
  suppression: PanelSuppression
}

export interface PanelDomWiring {
  start: () => void

  destroy: () => void

  placeInitial: (panelElem: HTMLElement | null) => void

  applyCardWidthTransition: () => void
}

export function createPanelDomWiring({
  getElement,
  resolveCardElement,
  getCommittedPosition,
  getPosition,
  setPosition,
  getViewport,
  getCardWidth,
  previousCardWidth,
  previousCardOrigin,
  previousViewport,
  isPanel,
  isInteractive,
  suppression,
}: PanelDomWiringPorts): PanelDomWiring {
  const getInitialPosition = (panelElem: HTMLElement): PanelPosition | undefined => {
    const cardElement = resolveCardElement()
    if (!cardElement) {
      return
    }
    const cardRect = cardElement.getBoundingClientRect()
    const viewport = getViewport()
    const panelSize = { width: panelElem.offsetWidth, height: panelElem.offsetHeight }
    return resolveInitialPanelPosition({
      cardRect,
      panelSize,
      viewport,
      origin: resolveCardOrigin(cardElement),
      mobile: isMobileViewport({ width: window.innerWidth, height: window.innerHeight }),
    })
  }

  const session = createPanelDragSession({
    getPosition,
    setPosition,
    adjustOnDrag: (position) => {
      const elem = getElement()
      return clampOnDrag({
        ...position,
        panelSize: { width: elem?.offsetWidth ?? 0, height: elem?.offsetHeight ?? 0 },
        viewport: getViewport(),
        origin: resolveCardOrigin(resolveCardElement()),
      })
    },
    activateEffects: suppression.activate,
    deactivateEffects: suppression.deactivate,

    listenActive: ({ move, end }: PanelDragActiveListeners) => {
      const onMove = (e: Event) => {
        const point = eventPoint(e)
        if (point) {
          move(point)
        }
      }
      const onEnd = () => {
        end()
      }
      window.addEventListener('touchend', onEnd, { capture: true, passive: true })
      window.addEventListener('touchmove', onMove, { capture: true, passive: true })
      window.addEventListener('mouseup', onEnd, { capture: true, passive: true })
      window.addEventListener('mousemove', onMove, { capture: true, passive: true })
      return () => {
        window.removeEventListener('touchend', onEnd, { capture: true })
        window.removeEventListener('touchmove', onMove, { capture: true })
        window.removeEventListener('mouseup', onEnd, { capture: true })
        window.removeEventListener('mousemove', onMove, { capture: true })

        setTimeout(() => {
          window.removeEventListener('click', suppression.cancelClick, { capture: true })
        }, 1)
      }
    },
    isPanel,
    isInteractive,
  })

  let destroy: (() => void) | null = null

  const start = () => {
    const elem = getElement()
    if (!elem || destroy !== null) {
      return
    }

    const startListener = (e: TouchEvent | MouseEvent) => {
      const target = e.target
      if (!(target instanceof Node) || !getElement()?.contains(target)) {
        return
      }
      e.stopPropagation()

      if (e.type !== 'touchstart' && !(e instanceof MouseEvent && e.button === 0)) {
        return
      }

      const point = eventPoint(e)
      if (!point) {
        return
      }
      session.grab(point, e.composedPath?.() ?? [])
    }

    document.body.addEventListener('touchstart', startListener, false)
    document.body.addEventListener('mousedown', startListener, false)

    const panelResizeObserver = new ResizeObserver(() => {
      const { x, y, lastSpacing } = getCommittedPosition()
      if (x === undefined || y === undefined) {
        return
      }

      const reclamp = resolvePanelReclamp({
        position: { x, y },
        lastSpacing,
        panelSize: { width: elem.offsetWidth, height: elem.offsetHeight },
        viewport: getViewport(),
        origin: resolveCardOrigin(resolveCardElement()),
      })
      if (reclamp) {
        session.adjustOffset(reclamp.offsetDelta.x, reclamp.offsetDelta.y)
        setPosition(reclamp.position)
      }
    })
    panelResizeObserver.observe(elem)

    const container = getScrollAncestor(elem) || document.body
    let prevWidth = 0

    const onResize = (panelElem: HTMLElement | null) => {
      const { x, y, lastSpacing: spacing } = getPosition()

      const viewport = getViewport()
      setPosition(
        resolvePanelViewportShift({
          position: { x, y },
          initial: panelElem ? getInitialPosition(panelElem) : undefined,
          previousViewport: previousViewport.current,
          viewport,
          lastSpacing: spacing,
          panelSize: panelElem ? { width: panelElem.offsetWidth, height: panelElem.offsetHeight } : null,
          origin: resolveCardOrigin(resolveCardElement()),
        }),
      )

      previousViewport.current = viewport
    }

    const panelRepositionDebounced = debounce(
      (newWidth: number) => {
        prevWidth = newWidth
        onResize(getElement())
      },
      100,
      { leading: true, trailing: true },
    )

    const containerResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const firstSize = entry.contentBoxSize?.[0]
        if (firstSize) {
          const width = firstSize.inlineSize
          if (typeof width === 'number' && width !== prevWidth) {
            panelRepositionDebounced(width)
          }
        }
      }
    })

    containerResizeObserver.observe(container)

    destroy = () => {
      document.body.removeEventListener('touchstart', startListener, false)
      document.body.removeEventListener('mousedown', startListener, false)
      session.destroy()
      panelResizeObserver.disconnect()
      containerResizeObserver.disconnect()
      panelRepositionDebounced.cancel()

      suppression.dispose()
      destroy = null
    }
  }

  const placeInitial = (panelElem: HTMLElement | null) => {
    if (!panelElem) {
      return
    }
    try {
      const initialPosition = getInitialPosition(panelElem)
      if (initialPosition) {
        setPosition(initialPosition)
      }
    } catch {}
    previousViewport.current = getViewport()
  }

  const applyCardWidthTransition = () => {
    const cardElement = resolveCardElement()
    const cardWidth = getCardWidth()
    if (cardWidth === 'wide' && previousCardWidth.current !== 'wide' && !cardElement) {
      return
    }
    const cardRect = cardElement?.getBoundingClientRect() ?? null
    const elem = getElement()
    const transition = resolveCardWidthTransition({
      position: getPosition(),
      previousOrigin: previousCardOrigin.current,
      cardRect: cardRect ? { left: cardRect.left, top: cardRect.top } : null,
      panelSize: elem ? { width: elem.offsetWidth, height: elem.offsetHeight } : null,
      viewport: getViewport(),
      origin: resolveCardOrigin(cardElement),
      from: previousCardWidth.current,
      to: cardWidth,
    })
    if (transition) {
      previousCardOrigin.current = transition.cardOrigin
      if (elem) {
        setPosition(transition.position)
      }
    }
    previousCardWidth.current = cardWidth
  }

  return {
    start,
    destroy: () => destroy?.(),
    placeInitial,
    applyCardWidthTransition,
  }
}
