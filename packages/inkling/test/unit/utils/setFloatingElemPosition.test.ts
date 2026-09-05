import { describe, expect, it } from 'vitest'

import { setFloatingElemPosition } from '@/utils/setFloatingElemPosition'

describe('setFloatingElemPosition', () => {
  it('does nothing when required elements are missing', () => {
    const anchor = document.createElement('div')
    expect(() => setFloatingElemPosition(null, null, anchor)).not.toThrow()
  })

  it('positions the floating element above the target', () => {
    const scroller = document.createElement('div')
    const anchor = document.createElement('div')
    scroller.appendChild(anchor)

    const floating = document.createElement('div')
    scroller.appendChild(floating)

    const targetRect = new DOMRect(100, 100, 50, 20)
    Object.defineProperty(floating, 'getBoundingClientRect', {
      value: () => new DOMRect(0, 0, 40, 10),
    })
    Object.defineProperty(scroller, 'getBoundingClientRect', {
      value: () => new DOMRect(0, 0, 500, 500),
    })

    setFloatingElemPosition(targetRect, floating, anchor)

    expect(floating.style.top).toBe('80px')
    expect(floating.style.left).toBe('105px')
  })

  it('clamps the floating element to the scroller bounds', () => {
    const scroller = document.createElement('div')
    const anchor = document.createElement('div')
    scroller.appendChild(anchor)

    const floating = document.createElement('div')
    scroller.appendChild(floating)

    const targetRect = new DOMRect(10, 100, 50, 20)
    Object.defineProperty(floating, 'getBoundingClientRect', {
      value: () => new DOMRect(0, 0, 100, 10),
    })
    Object.defineProperty(scroller, 'getBoundingClientRect', {
      value: () => new DOMRect(50, 0, 500, 500),
    })

    setFloatingElemPosition(targetRect, floating, anchor)

    expect(floating.style.left).toBe('50px')
  })

  it('sets opacity when controlOpacity is true', () => {
    const scroller = document.createElement('div')
    const anchor = document.createElement('div')
    scroller.appendChild(anchor)

    const floating = document.createElement('div')
    scroller.appendChild(floating)

    const targetRect = new DOMRect(100, 100, 50, 20)
    Object.defineProperty(floating, 'getBoundingClientRect', {
      value: () => new DOMRect(0, 0, 40, 10),
    })
    Object.defineProperty(scroller, 'getBoundingClientRect', {
      value: () => new DOMRect(0, 0, 500, 500),
    })

    setFloatingElemPosition(targetRect, floating, anchor, { controlOpacity: true })

    expect(floating.style.opacity).toBe('1')
  })
})
