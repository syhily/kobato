import { describe, expect, it, vi } from 'vitest'

import {
  clampOnDrag,
  clampOnResize,
  clampWithinSpacing,
  createDragSession,
  driftTowardsInitial,
  isMobileViewport,
  MIN_PANEL_SPACING,
  resolveCardWidthTransition,
  resolveInitialPanelPosition,
  WIDE_CARD_ORIGIN_OFFSET,
  type PanelPosition,
} from '@/utils/floating-panel'

const viewport = { width: 1024, height: 768 }
const panelSize = { width: 100, height: 100 }
const origin = { x: 0, y: 0 }

function clamp(x: number, y: number, overrides: Partial<Parameters<typeof clampWithinSpacing>[0]> = {}) {
  return clampWithinSpacing({
    x,
    y,
    panelSize,
    viewport,
    origin,
    spacing: MIN_PANEL_SPACING,
    ...overrides,
  })
}

describe('clampWithinSpacing', () => {
  it('leaves a position inside the spacing untouched', () => {
    expect(clamp(100, 100)).toEqual({ x: 100, y: 100 })
  })

  it('clamps a top-offscreen panel down to the top spacing', () => {
    expect(clamp(100, 10)).toEqual({ x: 100, y: 66 })
  })

  it('clamps a bottom-offscreen panel up to the bottom spacing', () => {
    // bottom edge 800, viewport 768 → y = 768 - 100 - 20
    expect(clamp(100, 700)).toEqual({ x: 100, y: 648 })
  })

  it('clamps a right-offscreen panel left to the right spacing', () => {
    expect(clamp(950, 100)).toEqual({ x: 904, y: 100 })
  })

  it('clamps a left-offscreen panel right to the left spacing', () => {
    expect(clamp(5, 100)).toEqual({ x: 20, y: 100 })
  })

  it('does not adjust vertically when the panel is offscreen on both vertical edges', () => {
    expect(clamp(100, -50, { panelSize: { width: 100, height: 1000 } })).toEqual({ x: 100, y: -50 })
  })

  it('keeps a tighter previous spacing instead of pulling the panel back', () => {
    // lastSpacing.top -50 wins over the requested 66, so y = 0 stays
    expect(clamp(0, 0, { lastSpacing: { top: -50, bottom: 20, right: 20, left: -50 } })).toEqual({ x: 0, y: 0 })
  })

  it('passes the position through origin-adjusted when the panel element is missing', () => {
    expect(clamp(10, 20, { panelSize: null, origin: { x: 5, y: 6 } })).toEqual({ x: 15, y: 26 })
  })

  it('clamps relative to the origin when the card carries a transform', () => {
    const cardOrigin = { x: 50, y: 40 }
    // y + origin.y = 60 < top spacing 66 → y = 66 - 40
    expect(clamp(100, 20, { origin: cardOrigin })).toEqual({ x: 100, y: 26 })
  })

  it('detects a left-offscreen panel when a wide card bleeds the origin left', () => {
    // wide card origin sits 100px left of the window: rendered left edge 50-100 = -50 < 20 → clamped to 20 rendered
    expect(clamp(50, 100, { origin: { x: -100, y: 0 } })).toEqual({ x: 120, y: 100 })
  })

  it('does not clamp a left-bleeding local x when the origin keeps the rendered edge onscreen', () => {
    // rendered left edge 5+100 = 105 ≥ 20 → untouched
    expect(clamp(5, 100, { origin: { x: 100, y: 0 } })).toEqual({ x: 5, y: 100 })
  })
})

describe('clampOnDrag', () => {
  it('enforces the hard boundary spacing on every edge', () => {
    expect(clampOnDrag({ x: 5, y: 5, panelSize, viewport, origin })).toEqual({ x: 10, y: 10 })
  })
})

describe('clampOnResize', () => {
  it('settles to the minimum spacing and then the drag boundary', () => {
    expect(clampOnResize({ x: 5, y: 0, panelSize, viewport, origin })).toEqual({ x: 20, y: 66 })
  })

  it('honours a tighter previous spacing on settle', () => {
    expect(
      clampOnResize({
        x: 0,
        y: 0,
        panelSize,
        viewport,
        origin,
        lastSpacing: { top: -50, bottom: 20, right: 20, left: 20 },
      }),
    ).toEqual({ x: 20, y: 10 }) // y: settle keeps 0, boundary lifts to 10
  })
})

describe('resolveInitialPanelPosition', () => {
  const cardRect = { top: 100, bottom: 300, right: 500 }
  const panel = { width: 320, height: 400 }

  it('positions right of the card, vertically centered on its visible height, on desktop', () => {
    // visible height 300-100 = 200 → y = 100 + 100 - 200 = 0, settled to top spacing 66
    expect(resolveInitialPanelPosition({ cardRect, panelSize: panel, viewport, origin, mobile: false })).toEqual({
      x: 520,
      y: 66,
    })
  })

  it('centers below the card on mobile', () => {
    const mobileViewport = { width: 375, height: 700 }
    expect(
      resolveInitialPanelPosition({ cardRect, panelSize: panel, viewport: mobileViewport, origin, mobile: true }),
    ).toEqual({ x: 375 / 2 - 160, y: 290 }) // 320 below the card, pulled up 30 by the drag boundary (400-tall panel)
  })

  it('detects mobile viewports', () => {
    expect(isMobileViewport({ width: 375, height: 700 })).toBe(true)
    expect(isMobileViewport(viewport)).toBe(false)
  })
})

describe('resolveCardWidthTransition', () => {
  const cardRect = { left: 120, top: 80 }
  const base = { panelSize, viewport, origin }

  it('returns null when the wideness did not change', () => {
    expect(
      resolveCardWidthTransition({
        ...base,
        position: { x: 500, y: 100 },
        previousOrigin: { x: 0, y: 0 },
        cardRect,
        from: 'regular',
        to: 'regular',
      }),
    ).toBeNull()
  })

  it('returns null entering wide without a card rect', () => {
    expect(
      resolveCardWidthTransition({
        ...base,
        position: { x: 500, y: 100 },
        previousOrigin: { x: 0, y: 0 },
        cardRect: null,
        from: 'regular',
        to: 'wide',
      }),
    ).toBeNull()
  })

  it('re-bases the position onto the card origin (plus the fudge) entering wide', () => {
    const transition = resolveCardWidthTransition({
      ...base,
      position: { x: 500, y: 400 },
      previousOrigin: { x: 0, y: 0 },
      cardRect,
      from: 'regular',
      to: 'wide',
    })
    const cardOrigin = { x: cardRect.left + WIDE_CARD_ORIGIN_OFFSET.x, y: cardRect.top + WIDE_CARD_ORIGIN_OFFSET.y }
    expect(transition?.cardOrigin).toEqual(cardOrigin)
    // 500-122=378, 400-81=319 — inside spacing, so the clamp leaves them
    expect(transition?.position).toEqual({ x: 500 - cardOrigin.x, y: 400 - cardOrigin.y })
  })

  it('re-bases back through the remembered origin leaving wide', () => {
    const previousOrigin = { x: 122, y: 81 }
    const transition = resolveCardWidthTransition({
      ...base,
      position: { x: 378, y: 319 },
      previousOrigin,
      cardRect,
      from: 'wide',
      to: 'regular',
    })
    expect(transition?.cardOrigin).toEqual({ x: 0, y: 0 })
    expect(transition?.position).toEqual({ x: 378 + previousOrigin.x, y: 319 + previousOrigin.y })
  })

  it('settle-clamps the re-based position', () => {
    // entering wide at a position that lands offscreen-left after the re-base
    const transition = resolveCardWidthTransition({
      ...base,
      position: { x: 130, y: 90 },
      previousOrigin: { x: 0, y: 0 },
      cardRect,
      from: 'regular',
      to: 'wide',
    })
    // re-based x = 130-122 = 8 → clamped to left spacing 20
    expect(transition?.position.x).toBe(20)
  })
})

describe('driftTowardsInitial', () => {
  it('pulls the panel towards its initial position by at most the viewport growth', () => {
    expect(
      driftTowardsInitial(
        { x: 100, y: 100 },
        { x: 500, y: 150 },
        { width: 1024, height: 768 },
        { width: 1024, height: 800 },
      ),
    ).toEqual({ x: 100, y: 132 }) // height grew 32 → y moves 32 of the 50 gap
  })

  it('caps the drift at the initial position', () => {
    expect(
      driftTowardsInitial(
        { x: 100, y: 100 },
        { x: 110, y: 110 },
        { width: 1024, height: 768 },
        { width: 2000, height: 2000 },
      ),
    ).toEqual({ x: 110, y: 110 })
  })

  it('does nothing when the viewport shrank or the initial position is behind the panel', () => {
    expect(
      driftTowardsInitial(
        { x: 100, y: 100 },
        { x: 50, y: 50 },
        { width: 1024, height: 768 },
        { width: 2000, height: 2000 },
      ),
    ).toEqual({ x: 100, y: 100 })
    expect(
      driftTowardsInitial({ x: 100, y: 100 }, undefined, { width: 1024, height: 768 }, { width: 2000, height: 2000 }),
    ).toEqual({
      x: 100,
      y: 100,
    })
  })
})

describe('createDragSession', () => {
  function setup(adjustOnDrag?: (position: PanelPosition) => PanelPosition) {
    const effects = { activate: vi.fn(), deactivate: vi.fn() }
    const positions: PanelPosition[] = []
    let current: PanelPosition = { x: 0, y: 0 }
    const session = createDragSession({
      getPosition: () => current,
      setPosition: (position) => {
        current = position
        positions.push(position)
      },
      adjustOnDrag,
      activateEffects: effects.activate,
      deactivateEffects: effects.deactivate,
    })
    return { effects, positions, session }
  }

  it('ignores pointer travel within the start threshold', () => {
    const { effects, positions, session } = setup()
    session.start({ x: 10, y: 10 })
    session.move({ x: 12, y: 12 })

    expect(effects.activate).not.toHaveBeenCalled()
    expect(positions).toEqual([])
    expect(session.isDragging()).toBe(false)
  })

  it('activates the declared effects once the threshold is crossed, then drags', () => {
    const { effects, positions, session } = setup()
    session.start({ x: 10, y: 10 })
    session.move({ x: 20, y: 20 })
    session.move({ x: 25, y: 25 })

    expect(effects.activate).toHaveBeenCalledTimes(1)
    expect(positions).toEqual([
      { x: 10, y: 10 },
      { x: 15, y: 15 },
    ])
    expect(session.isDragging()).toBe(true)
  })

  it('routes drag positions through the adjust port', () => {
    const { positions, session } = setup(() => ({ x: 5, y: 5 }))
    session.start({ x: 10, y: 10 })
    session.move({ x: 20, y: 20 })

    expect(positions).toEqual([{ x: 5, y: 5 }])
  })

  it('deactivates the effects on end and restarts cleanly', () => {
    const { effects, positions, session } = setup()
    session.start({ x: 10, y: 10 })
    session.move({ x: 20, y: 20 })
    session.end()

    expect(effects.deactivate).toHaveBeenCalledTimes(1)
    expect(session.isDragging()).toBe(false)

    session.start({ x: 30, y: 30 })
    session.move({ x: 40, y: 40 })
    expect(effects.activate).toHaveBeenCalledTimes(2)
    expect(positions.at(-1)).toEqual({ x: 20, y: 20 })
  })

  it('shifts the grab offset so a mid-drag re-clamp does not jump the position', () => {
    const { positions, session } = setup()
    session.start({ x: 10, y: 10 })
    session.adjustOffset(3, 0)
    session.move({ x: 20, y: 20 })

    expect(positions).toEqual([{ x: 13, y: 10 }])
  })
})
