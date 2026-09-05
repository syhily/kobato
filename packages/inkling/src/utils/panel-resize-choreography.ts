// Panel resize choreography — the settings panel's two re-clamp resolutions as
// rects-as-data transitions over @/utils/floating-panel's clamp/drift math:
// resolvePanelReclamp (the panel's own resize — settle-clamp the committed
// position, null when unchanged, plus the grab-offset delta that keeps a
// mid-drag resize from jumping the position) and resolvePanelViewportShift
// (the scroll container's resize — drift back towards the initial placement
// by at most the viewport growth, then settle-clamp). The same module hosts
// the DOM assembly (createPanelDomWiring): the body-level press listeners,
// the drag-lifetime window listeners, the two ResizeObservers, and the
// wide-card origin transition — every measurement goes through injected
// ports, so the assembly is testable without a mounted panel. The React
// adapter (@/hooks/useFloatingPanel) keeps only the refs, the port
// closures, and the effect triggers.

import type { RefObject } from 'react'

import type { PanelSuppression } from '@/utils/panel-suppression'

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
} from '@/utils/floating-panel'
import { createPanelDragSession, type PanelDragActiveListeners } from '@/utils/panel-drag-session'
import { getScrollAncestor } from '@/utils/scroll-ancestor'
import { debounce } from '@/utils/timing'

export interface PanelReclampInput {
  /** Current committed panel position. */
  position: PanelPosition
  /** Spacing at the last committed position, so the settle clamp keeps a deliberate offscreen placement. */
  lastSpacing: PanelSpacing | null
  panelSize: PanelSize
  viewport: PanelViewport
  origin: PanelPosition
}

export interface PanelReclamp {
  /** The re-clamped position to commit. */
  position: PanelPosition
  /** The grab-offset shift keeping a mid-drag resize from jumping the drag position. */
  offsetDelta: PanelPosition
}

/**
 * The panel-resize resolution: settle-clamp the committed position against
 * the panel's new size. Returns null when the clamp leaves the position
 * untouched (no commit, no offset shift).
 */
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
  /** Current committed panel position. */
  position: PanelPosition
  /** The panel's preferred position; undefined when the card anchor is gone (no drift). */
  initial: PanelPosition | undefined
  previousViewport: PanelViewport
  viewport: PanelViewport
  lastSpacing: PanelSpacing | null
  /** Null when the panel element is missing — the clamp passes the position through origin-adjusted. */
  panelSize: PanelSize | null
  origin: PanelPosition
}

/**
 * The container-resize resolution: viewport-growth drift back towards the
 * initial placement, then the settle clamp ( honouring the last spacing).
 */
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

// --- the DOM assembly (drag wiring + resize observers + wide-card origin) ---

/** Pointer-event → client point; null for events that carry no pointer. */
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
  /** The panel element (the movable chrome). */
  getElement: () => HTMLElement | null
  /** The card anchoring the panel (positioning origin); null when gone. */
  resolveCardElement: () => HTMLElement | null
  /** Committed panel position; undefined axes mean "never positioned". */
  getCommittedPosition: () => { x: number | undefined; y: number | undefined; lastSpacing: PanelSpacing | null }
  /** Normalized committed position (undefined axes read as 0) — the drag input. */
  getPosition: () => PanelPosition & { lastSpacing: PanelSpacing | null }
  /** Commit a position (writes the transform). */
  setPosition: (position: PanelPosition) => void
  /** The current viewport with the breakout adjustment applied. */
  getViewport: () => PanelViewport
  /** Current committed card width ('wide' vs anything else). */
  getCardWidth: () => string
  /** Previous committed card width — the wide-transition state slot. */
  previousCardWidth: RefObject<string>
  /** Origin at the last committed wide transition. */
  previousCardOrigin: RefObject<PanelPosition>
  /** Viewport at the last committed re-position. */
  previousViewport: RefObject<PanelViewport>
  /** Whether a composed-path element is the panel itself. */
  isPanel: (element: unknown) => boolean
  /** Whether a composed-path element swallows the grab (an input, a dropdown trigger). */
  isInteractive: (element: unknown) => boolean
  /** The drag suppression (created once by the adapter). */
  suppression: PanelSuppression
}

export interface PanelDomWiring {
  /** Mount: set up the body press listeners, the drag session, and both ResizeObservers. */
  start: () => void
  /** Unmount: detach every listener and observer (drag session effects stay dormant). */
  destroy: () => void
  /** Position the panel on mount (and when the card anchor changes). */
  placeInitial: (panelElem: HTMLElement | null) => void
  /** Re-base the origin when the card width transitions (regular ↔ wide). */
  applyCardWidthTransition: () => void
}

/**
 * The settings panel's DOM lifecycle as headless assembly: drag grab/release
 * through the body-level press listeners and the window drag-lifetime
 * listeners, the panel-resize re-clamp, the scroll-container resize drift,
 * and the wide-card origin transition. Every behavior the adapter used to
 * inline is here; the adapter triggers start/destroy/placeInitial/
 * applyCardWidthTransition from its layout effects.
 */
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
  // preferred placement for the panel: the initial-position resolution over
  // the card anchor, viewport, and panel size (measured at the edge here)
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

  // the drag session reads every changing input through the ports; the
  // adjust/effect closures are assembled here, so the session itself never
  // captures a stale element or viewport
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
    // the drag-lifetime listeners: window-level, capture, detached on release
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

        // deferred for the same reason as the drag-end click suppression
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

    // React event handlers get added to the root element, so listeners added to
    // the panel directly would stopPropagation any React events on child nodes.
    // Instead the listeners live on the body and check the event target.
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

    // panel resize: re-clamp the settled position and shift the session's grab
    // offset so a resize mid-drag (e.g. a collapsible section toggled from a
    // panel button) doesn't jump the drag position
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

    // reposition on scroll container resize, covers two cases:
    // 1. window is resized
    // 2. sidebar is opened/closed
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
      // belt-and-braces recovery: a drag ending on unmount leaves the
      // suppression active (the deferred deactivate timeouts never ran)
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
    } catch {
      // positioning is best-effort
    }
    previousViewport.current = getViewport()
  }

  const applyCardWidthTransition = () => {
    const cardElement = resolveCardElement()
    const cardWidth = getCardWidth()
    if (cardWidth === 'wide' && previousCardWidth.current !== 'wide' && !cardElement) {
      // no card element yet — leave previousCardWidth so the shift can apply later
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
