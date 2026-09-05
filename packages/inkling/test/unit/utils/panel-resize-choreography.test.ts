import { describe, expect, it } from 'vitest'

import { resolvePanelReclamp, resolvePanelViewportShift } from '@/utils/panel-resize-choreography'

const viewport = { width: 1024, height: 768 }
const origin = { x: 0, y: 0 }
const panelSize = { width: 320, height: 100 }

describe('resolvePanelReclamp', () => {
  it('returns null when the settle clamp leaves the position untouched', () => {
    expect(
      resolvePanelReclamp({ position: { x: 320, y: 150 }, lastSpacing: null, panelSize, viewport, origin }),
    ).toBeNull()
  })

  it('returns the re-clamped position and the grab-offset delta when the panel outgrows the viewport', () => {
    // right edge 700 + 400 = 1100 > settle inset 1004 → x = 1004 - 400 = 604
    const reclamp = resolvePanelReclamp({
      position: { x: 700, y: 150 },
      lastSpacing: null,
      panelSize: { width: 400, height: 100 },
      viewport,
      origin,
    })

    expect(reclamp).toEqual({ position: { x: 604, y: 150 }, offsetDelta: { x: -96, y: 0 } })
  })

  it('keeps a deliberate offscreen placement through the last spacing', () => {
    // lastSpacing.top -50 wins over the settle minimum 66 so the settle keeps
    // y 0, then the drag boundary lifts it to 10 (the clampOnResize two-pass)
    const reclamp = resolvePanelReclamp({
      position: { x: 100, y: 0 },
      lastSpacing: { top: -50, bottom: 20, right: 20, left: 20 },
      panelSize,
      viewport,
      origin,
    })

    expect(reclamp).toEqual({ position: { x: 100, y: 10 }, offsetDelta: { x: 0, y: 10 } })
  })
})

describe('resolvePanelViewportShift', () => {
  it('drifts towards the initial position by at most the viewport growth, then settle-clamps', () => {
    // height grew 32 → y drifts 32 of the 50 gap, then the settle clamp leaves it
    const shifted = resolvePanelViewportShift({
      position: { x: 100, y: 100 },
      initial: { x: 500, y: 150 },
      previousViewport: { width: 1024, height: 768 },
      viewport: { width: 1024, height: 800 },
      lastSpacing: null,
      panelSize,
      origin,
    })

    expect(shifted).toEqual({ x: 100, y: 132 })
  })

  it('settle-clamps the position when the viewport shrank', () => {
    // right edge 320 + 320 = 640 > settle inset 480 → x = 160
    const shifted = resolvePanelViewportShift({
      position: { x: 320, y: 150 },
      initial: { x: 320, y: 150 },
      previousViewport: { width: 1024, height: 768 },
      viewport: { width: 500, height: 768 },
      lastSpacing: null,
      panelSize,
      origin,
    })

    expect(shifted).toEqual({ x: 160, y: 150 })
  })

  it('passes the position through origin-adjusted when the panel element is missing', () => {
    // panelSize null passes through origin-adjusted in both clampOnResize
    // passes (settle then drag boundary) — the historical clampSettled shape
    const shifted = resolvePanelViewportShift({
      position: { x: 10, y: 20 },
      initial: undefined,
      previousViewport: viewport,
      viewport: { width: 2000, height: 1000 },
      lastSpacing: null,
      panelSize: null,
      origin: { x: 5, y: 6 },
    })

    expect(shifted).toEqual({ x: 20, y: 32 })
  })
})
