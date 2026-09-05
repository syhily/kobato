import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useClickOutside } from '@/hooks/useClickOutside'

function setupDom() {
  const container = document.createElement('div')
  const child = document.createElement('button')
  const outside = document.createElement('div')
  container.appendChild(child)
  document.body.appendChild(container)
  document.body.appendChild(outside)
  return { child, container, outside }
}

function mousedown(target: Element) {
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
}

describe('useClickOutside', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('fires the handler for a mousedown outside the ref element', () => {
    const { container, outside } = setupDom()
    const handler = vi.fn()
    renderHook(() => useClickOutside(true, { current: container }, handler))

    mousedown(outside)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toBeInstanceOf(MouseEvent)
  })

  it('does not fire the handler for a mousedown inside the ref element', () => {
    const { child, container } = setupDom()
    const handler = vi.fn()
    renderHook(() => useClickOutside(true, { current: container }, handler))

    mousedown(child)

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not fire the handler when disabled', () => {
    const { outside, container } = setupDom()
    const handler = vi.fn()
    renderHook(() => useClickOutside(false, { current: container }, handler))

    mousedown(outside)

    expect(handler).not.toHaveBeenCalled()
  })

  it('removes the listener on unmount', () => {
    const { outside, container } = setupDom()
    const handler = vi.fn()
    const { unmount } = renderHook(() => useClickOutside(true, { current: container }, handler))

    unmount()
    mousedown(outside)

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not fire the handler while the ref is unattached', () => {
    const { outside } = setupDom()
    const handler = vi.fn()
    renderHook(() => useClickOutside(true, { current: null }, handler))

    mousedown(outside)

    expect(handler).not.toHaveBeenCalled()
  })
})
