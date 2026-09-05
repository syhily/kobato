// Floating panel — the one headless module owning the settings panel's layout
// decisions: the clamp math (clampWithinSpacing*, projected onto
// @/utils/fit-rect's 'clamp' policy), the card-origin resolution, the initial
// placement, the wide-card width transition, and the drag session
// (createDragSession — a port adapter over the shared press-threshold core in
// @/utils/draggable/press-threshold-session, which it shares with
// DragDropHandler's drag-start session). Everything DOM-shaped arrives as
// plain data or behind injected ports (position get/set, effect
// activate/deactivate), so the rules are unit-testable without layout or
// pointer events. The grab/listener choreography above the drag session lives
// in @/utils/panel-drag-session, the re-clamp resolutions in
// @/utils/panel-resize-choreography; the React adapter owning the DOM ports
// (body-level pointer listeners, the user-select stylesheet, click
// suppression, ResizeObservers) is @/hooks/useFloatingPanel; SettingsPanel is
// the sole consumer above that.

import { createPressThresholdSession, type PressThresholdSession } from '@/utils/draggable/press-threshold-session'
import { fitRectWithin } from '@/utils/fit-rect'

export interface PanelPosition {
  x: number
  y: number
}

export interface PanelSpacing {
  top: number
  bottom: number
  right: number
  left: number
}

export interface PanelSize {
  width: number
  height: number
}

export interface PanelViewport {
  width: number
  height: number
}

/** Default distance between the card and its settings panel. */
export const CARD_SPACING = 20

/** Minimum spacing between the panel and the viewport edges when settling (initial position, resize). */
export const MIN_PANEL_SPACING: PanelSpacing = { top: 66, bottom: 20, right: 20, left: 20 } // top: 66 is publish menu and word count size

/** Hard boundary spacing applied while dragging. */
export const DRAG_BOUNDARY_SPACING = 10

/** Distance in px the pointer must travel before a press becomes a drag. */
export const DRAG_MOVE_THRESHOLD = 3

export function isMobileViewport(viewport: PanelViewport): boolean {
  return viewport.width < 768 && viewport.height > viewport.width
}

/**
 * The origin every clamp agrees on. When the card has a transform applied
 * (e.g. wide cards) the panel is positioned relative to the card element
 * rather than the window, so the card's rect becomes the origin. DOM edge —
 * takes the card element, returns plain data; deliberately kept as this
 * module's single direct DOM read (the getComputedStyle transform check),
 * everything else arrives as data.
 */
export function resolveCardOrigin(cardElement: HTMLElement | null): PanelPosition {
  if (!cardElement || window.getComputedStyle(cardElement).transform === 'none') {
    return { x: 0, y: 0 }
  }
  const rect = cardElement.getBoundingClientRect()
  return { x: rect.left, y: rect.top }
}

export interface ClampInput {
  x: number
  y: number
  /** Null when the panel element is missing — the position passes through (origin-adjusted) unclamped. */
  panelSize: PanelSize | null
  /** Viewport with any host chrome adjustment already subtracted from the width. */
  viewport: PanelViewport
  origin: PanelPosition
  spacing: PanelSpacing
  lastSpacing?: PanelSpacing | null
}

/**
 * Clamps a panel position so the panel keeps the given spacing from the
 * viewport edges. A previous spacing tighter than the requested one is kept
 * (negative spacing allowed) so a panel the user deliberately pushed offscreen
 * is not dragged back. The fit itself projects onto @/utils/fit-rect's
 * 'clamp' policy over the rendered (origin-adjusted) rect.
 */
export function clampWithinSpacing({
  x,
  y,
  panelSize,
  viewport,
  origin,
  spacing,
  lastSpacing,
}: ClampInput): PanelPosition {
  if (!panelSize) {
    return { x: x + origin.x, y: y + origin.y }
  }

  let { top, bottom, right, left } = spacing
  if (lastSpacing && lastSpacing.top < top) {
    top = lastSpacing.top
  }
  if (lastSpacing && lastSpacing.bottom < bottom) {
    bottom = lastSpacing.bottom
  }
  if (lastSpacing && lastSpacing.right < right) {
    right = lastSpacing.right
  }
  if (lastSpacing && lastSpacing.left < left) {
    left = lastSpacing.left
  }

  const fitted = fitRectWithin({
    bounds: { top: 0, left: 0, right: viewport.width, bottom: viewport.height },
    rect: { top: y + origin.y, left: x + origin.x, width: panelSize.width, height: panelSize.height },
    gap: { top, right, bottom, left },
    policy: 'clamp',
  })
  return { x: fitted.left - origin.x, y: fitted.top - origin.y }
}

type ClampRest = Omit<ClampInput, 'spacing' | 'lastSpacing'>

/** Drag clamp: hard boundary spacing on every edge, previous spacing ignored. */
export function clampOnDrag(input: ClampRest): PanelPosition {
  return clampWithinSpacing({
    ...input,
    spacing: {
      top: DRAG_BOUNDARY_SPACING,
      bottom: DRAG_BOUNDARY_SPACING,
      right: DRAG_BOUNDARY_SPACING,
      left: DRAG_BOUNDARY_SPACING,
    },
  })
}

/** Settle clamp: minimum spacing ( honouring previous spacing), then the drag boundary. */
export function clampOnResize(input: ClampRest & { lastSpacing?: PanelSpacing | null }): PanelPosition {
  const { lastSpacing, ...rest } = input
  const settled = clampWithinSpacing({ ...rest, spacing: MIN_PANEL_SPACING, lastSpacing })
  // the boundary pass ignores previous spacing, matching the drag clamp
  return clampOnDrag({ ...rest, x: settled.x, y: settled.y })
}

export interface InitialPanelPositionInput {
  cardRect: { top: number; bottom: number; right: number }
  panelSize: PanelSize
  viewport: PanelViewport
  origin: PanelPosition
  mobile: boolean
}

/**
 * The panel's preferred position: below the card (centered) on mobile;
 * vertically centered against the card's visible height, to the card's right,
 * on desktop. Clamped like a settle (desktop) or a drag (mobile).
 */
export function resolveInitialPanelPosition({
  cardRect,
  panelSize,
  viewport,
  origin,
  mobile,
}: InitialPanelPositionInput): PanelPosition {
  if (mobile) {
    const x = viewport.width / 2 - panelSize.width / 2
    const y = cardRect.bottom + CARD_SPACING
    return clampOnDrag({ x, y, panelSize, viewport, origin })
  }

  // correct the card height to what is actually on screen so the vertical
  // centering tracks the visible part of the card
  const visibleHeight = Math.min(viewport.height, cardRect.bottom) - cardRect.top
  const y = cardRect.top + visibleHeight / 2 - panelSize.height / 2
  const x = cardRect.right + CARD_SPACING
  return clampOnResize({ x, y, panelSize, viewport, origin })
}

/**
 * Empirical origin offset applied when a card goes wide — the wide-card
 * transform shifts the card's rect by a couple of pixels relative to where
 * the panel math expects it, and without the fudge the panel visibly bounces
 * on the transition. Carried from the original inline effect math.
 */
export const WIDE_CARD_ORIGIN_OFFSET: PanelPosition = { x: 2, y: 1 }

export interface CardWidthTransitionInput {
  /** Current committed panel position (window coordinates). */
  position: PanelPosition
  /** The card origin the panel positioned against while wide ({0,0} before the first wide transition). */
  previousOrigin: PanelPosition
  /** The card element's viewport rect; null when the element is missing (no transition resolves). */
  cardRect: { left: number; top: number } | null
  panelSize: PanelSize | null
  viewport: PanelViewport
  /** The clamp origin (`resolveCardOrigin` of the card element). */
  origin: PanelPosition
  /** The card width before this render. */
  from: string
  /** The card width now. */
  to: string
}

export interface CardWidthTransition {
  /** The re-clamped panel position to commit. */
  position: PanelPosition
  /**
   * The origin the panel now positions against: the card's rect (plus
   * `WIDE_CARD_ORIGIN_OFFSET`) when entering wide, the window origin when
   * leaving it.
   */
  cardOrigin: PanelPosition
}

/**
 * The wide-card origin-shift policy: the panel positions in window
 * coordinates normally, but against the card's rect while the card is wide
 * (its transform makes it the coordinate origin — see `resolveCardOrigin`).
 * Entering wide re-bases the position from window to card origin; leaving
 * wide re-bases it back through the remembered origin. Both directions
 * settle-clamp the result. Returns null when no wide transition happened
 * (or the card element is gone), so the caller leaves its bookkeeping
 * untouched.
 */
export function resolveCardWidthTransition({
  position,
  previousOrigin,
  cardRect,
  panelSize,
  viewport,
  origin,
  from,
  to,
}: CardWidthTransitionInput): CardWidthTransition | null {
  if (to === 'wide' && from !== 'wide') {
    if (!cardRect) {
      return null
    }
    const cardOrigin: PanelPosition = {
      x: cardRect.left + WIDE_CARD_ORIGIN_OFFSET.x,
      y: cardRect.top + WIDE_CARD_ORIGIN_OFFSET.y,
    }
    return {
      cardOrigin,
      position: clampOnResize({
        x: position.x - cardOrigin.x,
        y: position.y - cardOrigin.y,
        panelSize,
        viewport,
        origin,
      }),
    }
  }

  if (from === 'wide' && to !== 'wide') {
    return {
      cardOrigin: { x: 0, y: 0 },
      position: clampOnResize({
        x: position.x + previousOrigin.x,
        y: position.y + previousOrigin.y,
        panelSize,
        viewport,
        origin,
      }),
    }
  }

  return null
}

/**
 * Viewport-resize drift: when the viewport grows, pull the panel back towards
 * its preferred position by at most the grown amount, so a panel pushed
 * offscreen by a small viewport becomes fully visible again on resize/rotate.
 */
export function driftTowardsInitial(
  position: PanelPosition,
  initial: PanelPosition | undefined,
  previousViewport: PanelViewport,
  viewport: PanelViewport,
): PanelPosition {
  let { x, y } = position
  if (!initial) {
    return { x, y }
  }
  if (viewport.height > previousViewport.height) {
    const heightIncrease = viewport.height - previousViewport.height
    if (initial.y > y) {
      y += Math.min(initial.y - y, heightIncrease)
    }
  }
  if (viewport.width > previousViewport.width) {
    const widthIncrease = viewport.width - previousViewport.width
    if (initial.x > x) {
      x += Math.min(initial.x - x, widthIncrease)
    }
  }
  return { x, y }
}

export interface DragSessionPorts {
  /** Current committed panel position. */
  getPosition: () => PanelPosition
  /** Commit a position (writes the transform, updates spacing). */
  setPosition: (position: PanelPosition) => void
  /** Clamp/policy applied to every drag position. */
  adjustOnDrag?: (position: PanelPosition) => PanelPosition
  /** Declared drag side effects (scroll/selection/pointer suppression) — begin. */
  activateEffects: () => void
  /** Declared drag side effects — end. */
  deactivateEffects: () => void
}

export interface DragSession {
  /** Pointer went down at point; records the grab offset. */
  start: (point: PanelPosition) => void
  /** Pointer moved; crosses the threshold once, then drags. */
  move: (point: PanelPosition) => void
  /** Pointer released; ends the session and its side effects. */
  end: () => void
  isDragging: () => boolean
  /** Shift the grab offset (panel re-clamped mid-drag after a resize — prevents position jumps). */
  adjustOffset: (deltaX: number, deltaY: number) => void
}

/**
 * Headless drag session: start threshold → move → end, with the side effects
 * declared behind ports. A port adapter over the shared press-threshold core
 * (@/utils/draggable/press-threshold-session): the core's grab origin is the
 * zero point and this adapter feeds it travel deltas measured against the
 * live position, preserving the historical threshold math. The React adapter
 * feeds it pointer coordinates and owns every DOM consequence.
 */
export function createDragSession({
  getPosition,
  setPosition,
  adjustOnDrag,
  activateEffects,
  deactivateEffects,
}: DragSessionPorts): DragSession {
  let dragging = false
  let offsetX = 0
  let offsetY = 0
  // re-created per grab; never given an onCancel — ending the session is the
  // adapter's own concern (end always unwinds the effects)
  let press: PressThresholdSession | null = null

  return {
    start(point) {
      dragging = false
      const current = getPosition()
      offsetX = point.x - current.x
      offsetY = point.y - current.y
      press = createPressThresholdSession(
        { x: 0, y: 0 },
        {
          threshold: DRAG_MOVE_THRESHOLD,
          onBegin: () => {
            activateEffects()
            dragging = true
          },
        },
      )
    },

    move(point) {
      if (!dragging && press) {
        const current = getPosition()
        press.move({ x: point.x - offsetX - current.x, y: point.y - offsetY - current.y })
      }

      if (dragging) {
        let position: PanelPosition = { x: point.x - offsetX, y: point.y - offsetY }
        if (adjustOnDrag) {
          position = adjustOnDrag(position)
        }
        setPosition(position)
      }
    },

    end() {
      press?.cancel()
      press = null
      dragging = false
      deactivateEffects()
    },

    isDragging: () => dragging,

    adjustOffset(deltaX, deltaY) {
      offsetX -= deltaX
      offsetY -= deltaY
    },
  }
}
