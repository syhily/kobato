import { ANCHOR_POPUP_GAP, fitRectWithin, type FitRect } from '@kobato/inkling-internal/utils/fit-rect'
import { describe, expect, it } from 'vitest'

function rect(top: number, left: number, width: number, height: number): FitRect {
  return { top, left, width, height }
}

const bounds = { top: 0, left: 0, right: 1000, bottom: 800 }

function clamp(proposed: FitRect, gap: Parameters<typeof fitRectWithin>[0]['gap'] = 10) {
  return fitRectWithin({ bounds, rect: proposed, gap, policy: 'clamp' })
}

describe('fitRectWithin — clamp', () => {
  it('leaves a rect inside the gap-inset bounds untouched', () => {
    expect(clamp(rect(100, 100, 200, 100))).toEqual({ top: 100, left: 100, flipped: false })
  })

  it('pushes a top-offscreen rect down to the top inset', () => {
    expect(clamp(rect(5, 100, 200, 100))).toEqual({ top: 10, left: 100, flipped: false })
  })

  it('pulls a bottom-offscreen rect up to the bottom inset', () => {
    expect(clamp(rect(650, 100, 200, 200))).toEqual({ top: 590, left: 100, flipped: false })
  })

  it('leaves a rect offscreen on both vertical edges alone', () => {
    expect(clamp(rect(-50, 100, 200, 1000))).toEqual({ top: -50, left: 100, flipped: false })
  })

  it('pulls a right-offscreen rect left to the right inset', () => {
    expect(clamp(rect(100, 850, 200, 100))).toEqual({ top: 100, left: 790, flipped: false })
  })

  it('pushes a left-offscreen rect right to the left inset', () => {
    expect(clamp(rect(100, 5, 200, 100))).toEqual({ top: 100, left: 10, flipped: false })
  })

  it('lets the left edge win when both horizontal edges overflow, judged on the proposed position', () => {
    expect(clamp(rect(100, 5, 1200, 100))).toEqual({ top: 100, left: 10, flipped: false })
  })

  it('honours per-edge gaps', () => {
    const fitted = clamp(rect(30, 30, 100, 100), { top: 66, right: 20, bottom: 20, left: 20 })
    expect(fitted).toEqual({ top: 66, left: 30, flipped: false })
  })

  it('treats a negative gap as an expanded bound (deliberate offscreen placement)', () => {
    expect(clamp(rect(-50, 100, 200, 100), { top: -50 })).toEqual({ top: -50, left: 100, flipped: false })
  })
})

describe('fitRectWithin — flip-below-above', () => {
  const anchor = rect(700, 20, 100, 20)
  const size = { width: 0, height: 200 }

  it('places the rect below the anchor with the below gap when it fits', () => {
    const fitted = fitRectWithin({
      bounds,
      rect: anchor,
      size: { width: 0, height: 50 },
      gap: { below: 10, above: 10 },
      policy: 'flip-below-above',
    })
    expect(fitted).toEqual({ top: 730, left: 20, flipped: false })
  })

  it('flips above the anchor with the above gap when the below placement overflows', () => {
    const fitted = fitRectWithin({
      bounds,
      rect: anchor,
      size,
      gap: { below: 10, above: 55 },
      policy: 'flip-below-above',
    })
    expect(fitted).toEqual({ top: 445, left: 20, flipped: true })
  })

  it('stays below when the placement fits exactly (strict overflow)', () => {
    const fitted = fitRectWithin({
      bounds,
      rect: rect(580, 20, 100, 20),
      size,
      gap: { below: 0, above: 0 },
      policy: 'flip-below-above',
    })
    expect(fitted).toEqual({ top: 600, left: 20, flipped: false })
  })

  it('judges the overflow with the reserved budget rather than the placed height', () => {
    const fitted = fitRectWithin({
      bounds,
      rect: rect(610, 20, 100, 20),
      size: { width: 0, height: 100 },
      gap: { below: 0, above: 0 },
      policy: 'flip-below-above',
      belowBudget: 300,
    })
    expect(fitted).toEqual({ top: 510, left: 20, flipped: true })
  })

  it('requireFitAbove keeps the rect below when the flipped placement does not fit', () => {
    const fitted = fitRectWithin({
      bounds: { top: 0, left: 0, right: 1000, bottom: 400 },
      rect: rect(100, 0, 100, 20),
      size: { width: 0, height: 300 },
      policy: 'flip-below-above',
      requireFitAbove: true,
    })
    expect(fitted).toEqual({ top: 120, left: 0, flipped: false })
  })
})

describe('fitRectWithin — clamp-above', () => {
  it('places the rect above the anchor with the gap, horizontally centered', () => {
    const fitted = fitRectWithin({
      bounds,
      rect: rect(100, 100, 50, 20),
      size: { width: 40, height: 10 },
      gap: 10,
      policy: 'clamp-above',
    })
    expect(fitted).toEqual({ top: 80, left: 105, flipped: false })
  })

  it('clamps the left edge into the bounds', () => {
    const fitted = fitRectWithin({
      bounds: { top: 0, left: 50, right: 550, bottom: 0 },
      rect: rect(100, 10, 50, 20),
      size: { width: 100, height: 10 },
      gap: ANCHOR_POPUP_GAP,
      policy: 'clamp-above',
    })
    expect(fitted.left).toBe(50)
  })

  it('clamps the right edge into the bounds (winning over the left clamp)', () => {
    const fitted = fitRectWithin({
      bounds: { top: 0, left: 550, right: 600, bottom: 0 },
      rect: rect(100, 500, 50, 20),
      size: { width: 100, height: 10 },
      policy: 'clamp-above',
    })
    expect(fitted.left).toBe(500)
  })
})
