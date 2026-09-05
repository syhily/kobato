import { describe, expect, it } from 'vitest'

import {
  POPUP_LIST_MAX_HEIGHT,
  POPUP_LIST_MAX_HEIGHT_VH,
  POPUP_TOOLBAR_HEIGHT_PX,
  popupMaxHeightBudget,
  resolveAnchoredPopupPlacement,
  type PopupRectLike,
} from '@/utils/selection-anchored-popup'

function rect(top: number, left: number, width: number, height: number): PopupRectLike {
  return { top, left, width, height, bottom: top + height, right: left + width }
}

const containerRect = rect(0, 20, 460, 800)

function layout(overrides: Partial<Parameters<typeof resolveAnchoredPopupPlacement>[0]> = {}) {
  return resolveAnchoredPopupPlacement({
    anchorRect: rect(700, 20, 100, 20),
    containerRect,
    popupHeight: 200,
    scrollTop: 0,
    scrollHeight: 2000,
    viewportHeight: 1000,
    ...overrides,
  })
}

describe('popupMaxHeightBudget', () => {
  it('reserves the results list height plus the toolbar row', () => {
    expect(popupMaxHeightBudget(1000)).toBe((1000 / 100) * POPUP_LIST_MAX_HEIGHT_VH + POPUP_TOOLBAR_HEIGHT_PX)
    expect(popupMaxHeightBudget(1000)).toBe(354)
  })

  it('single-sources the CSS-side max height', () => {
    expect(POPUP_LIST_MAX_HEIGHT).toBe('30vh')
  })
})

describe('resolveAnchoredPopupPlacement', () => {
  it('places the popup below the anchor, spanning the container', () => {
    const placement = layout()

    expect(placement).toEqual({ top: 730, left: 20, width: 460, flipped: false })
  })

  it('flips above the anchor when the below position plus the budget overflows the scroll container', () => {
    // belowTop 730 + budget 354 = 1084 > scrollHeight 800
    const placement = layout({ scrollHeight: 800 })

    expect(placement.top).toBe(700 - 200 - 10)
    expect(placement.flipped).toBe(true)
  })

  it('accounts for the scroll position when checking overflow', () => {
    // scrolled to the bottom: document-coordinate overflow even though scrollHeight is large
    const placement = layout({ scrollTop: 1500, scrollHeight: 2000 })

    expect(placement.flipped).toBe(true)
  })

  it('stays below when the budget fits exactly', () => {
    const placement = layout({ scrollHeight: 1084 })

    expect(placement.flipped).toBe(false)
  })

  it('honours a custom below gap', () => {
    const placement = layout({ gap: 4, scrollHeight: 2000 })

    expect(placement.top).toBe(724)
  })

  it('honours a custom above gap when flipped', () => {
    const placement = layout({ scrollHeight: 800, aboveGap: 55 })

    expect(placement.top).toBe(700 - 200 - 55)
  })
})

describe('resolveAnchoredPopupPlacement — absolute mode', () => {
  // the card menus' geometry: parent-relative offsets at natural width
  const parent = rect(0, 0, 700, 2000)

  function absolute(overrides: Partial<Parameters<typeof resolveAnchoredPopupPlacement>[0]> = {}) {
    return resolveAnchoredPopupPlacement({
      positioning: 'absolute',
      anchorRect: rect(100, 0, 100, 20),
      containerRect: parent,
      popupHeight: 300,
      scrollTop: 0,
      scrollHeight: 0,
      viewportHeight: 1000,
      ...overrides,
    })
  }

  it('at-anchor places the popup at the anchor’s top offset within the parent (plus button)', () => {
    expect(absolute({ absoluteEdge: 'at-anchor' })).toEqual({ top: 100, left: 0, flipped: false })
  })

  it('below places the popup under the anchor by default (slash menu)', () => {
    expect(absolute({ absoluteEdge: 'below' })).toEqual({ top: 120, left: 0, flipped: false })
  })

  it('never flips without the measured policy, even when below overflows the viewport', () => {
    // 120 + 300 = 420 > 400 overflows — but the policy is 'never'
    const placement = absolute({ viewportHeight: 400, absoluteEdge: 'below', absoluteFlip: 'never' })

    expect(placement).toEqual({ top: 120, left: 0, flipped: false })
  })

  it('measured flips above when below overflows the viewport and the popup fits above', () => {
    // anchor bottom 520 + 300 = 820 > 800 overflows; 500 - 300 = 200 ≥ 0 fits above
    const placement = absolute({
      anchorRect: rect(500, 0, 100, 20),
      viewportHeight: 800,
      absoluteEdge: 'below',
      absoluteFlip: 'measured',
    })

    // the flipped popup's bottom edge sits at the anchor's top: parent height minus the anchor offset
    expect(placement).toEqual({ bottom: 2000 - 500, left: 0, flipped: true })
  })

  it('measured stays below when below overflows but the popup does not fit above', () => {
    // 120 + 300 = 420 > 400 overflows; 100 - 300 < 0 does not fit above
    const placement = absolute({ viewportHeight: 400, absoluteEdge: 'below', absoluteFlip: 'measured' })

    expect(placement).toEqual({ top: 120, left: 0, flipped: false })
  })

  it('measured judges the overflow in viewport coordinates when the parent is offset from the viewport top', () => {
    // parent top 300: the parent-relative below position (420 + 300 = 720) fits, but the
    // viewport-relative one (720 + 300 = 1020 > 1000) overflows — the flip must fire
    const placement = absolute({
      anchorRect: rect(700, 0, 100, 20),
      containerRect: rect(300, 0, 700, 2000),
      viewportHeight: 1000,
      absoluteEdge: 'below',
      absoluteFlip: 'measured',
    })

    expect(placement).toEqual({ bottom: 2000 - (700 - 300), left: 0, flipped: true })
  })

  it('measured stays below at the exact viewport boundary with an offset parent', () => {
    // 720 + 280 = 1000 fits exactly — no flip, even though the offset parent would
    // change the parent-relative comparison
    const placement = absolute({
      anchorRect: rect(700, 0, 100, 20),
      containerRect: rect(300, 0, 700, 2000),
      popupHeight: 280,
      viewportHeight: 1000,
      absoluteEdge: 'below',
      absoluteFlip: 'measured',
    })

    expect(placement).toEqual({ top: 700 - 300 + 20, left: 0, flipped: false })
  })
})
