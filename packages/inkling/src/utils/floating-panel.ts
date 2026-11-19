import {
  createPressThresholdSession,
  type PressThresholdSession,
} from '@kobato/inkling-internal/utils/draggable/press-threshold-session'
import { fitRectWithin } from '@kobato/inkling-internal/utils/fit-rect'

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

export const CARD_SPACING = 20

export const MIN_PANEL_SPACING: PanelSpacing = { top: 66, bottom: 20, right: 20, left: 20 }

export const DRAG_BOUNDARY_SPACING = 10

export const DRAG_MOVE_THRESHOLD = 3

export function isMobileViewport(viewport: PanelViewport): boolean {
  return viewport.width < 768 && viewport.height > viewport.width
}

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

  panelSize: PanelSize | null

  viewport: PanelViewport
  origin: PanelPosition
  spacing: PanelSpacing
  lastSpacing?: PanelSpacing | null
}

/**
 * Clamps a panel position so the panel keeps the given spacing from the viewport edges. A
 * previous spacing tighter than the requested one is kept, so a panel the user deliberately
 * pushed offscreen is not dragged back.
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

export function clampOnResize(input: ClampRest & { lastSpacing?: PanelSpacing | null }): PanelPosition {
  const { lastSpacing, ...rest } = input
  const settled = clampWithinSpacing({ ...rest, spacing: MIN_PANEL_SPACING, lastSpacing })

  return clampOnDrag({ ...rest, x: settled.x, y: settled.y })
}
export interface InitialPanelPositionInput {
  cardRect: { top: number; bottom: number; right: number }
  panelSize: PanelSize
  viewport: PanelViewport
  origin: PanelPosition
  mobile: boolean
}

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

  const visibleHeight = Math.min(viewport.height, cardRect.bottom) - cardRect.top
  const y = cardRect.top + visibleHeight / 2 - panelSize.height / 2
  const x = cardRect.right + CARD_SPACING
  return clampOnResize({ x, y, panelSize, viewport, origin })
}

/** Empirical origin offset applied when a card goes wide: the wide-card transform shifts the card's rect by a couple of px, and without the fudge the panel visibly bounces on the transition. */
export const WIDE_CARD_ORIGIN_OFFSET: PanelPosition = { x: 2, y: 1 }

export interface CardWidthTransitionInput {
  position: PanelPosition

  previousOrigin: PanelPosition

  cardRect: { left: number; top: number } | null
  panelSize: PanelSize | null
  viewport: PanelViewport
  origin: PanelPosition
  from: string
  to: string
}

export interface CardWidthTransition {
  position: PanelPosition

  cardOrigin: PanelPosition
}

/**
 * The wide-card origin-shift policy: the panel positions in window coordinates normally,
 * but against the card's rect while the card is wide (its transform makes it the coordinate
 * origin — see `resolveCardOrigin`). Entering wide re-bases the position from window to
 * card origin; leaving wide re-bases it back through the remembered origin. Returns null
 * when no wide transition happened, so the caller leaves its bookkeeping untouched.
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
  getPosition: () => PanelPosition

  setPosition: (position: PanelPosition) => void

  adjustOnDrag?: (position: PanelPosition) => PanelPosition

  activateEffects: () => void

  deactivateEffects: () => void
}

export interface DragSession {
  start: (point: PanelPosition) => void

  move: (point: PanelPosition) => void

  end: () => void
  isDragging: () => boolean
  adjustOffset: (deltaX: number, deltaY: number) => void
}

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
