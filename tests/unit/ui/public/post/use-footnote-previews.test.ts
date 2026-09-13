// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useFootnotePreviews } from '@/ui/public/post/use-footnote-previews'

const BODY =
  '<p>text<sup id="user-content-fnref-1"><a href="#user-content-fn-1">1</a></sup></p>' +
  '<section class="footnotes" data-footnotes=""><ol>' +
  '<li id="user-content-fn-1"><p>note body</p><a data-footnote-backref="" href="#user-content-fnref-1">↩</a></li>' +
  '</ol></section>'

function mountContainer(html: string): { container: HTMLDivElement; ref: RefObject<HTMLDivElement | null> } {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const ref = createRef<HTMLDivElement>()
  ;(ref as { current: HTMLDivElement | null }).current = container
  return { container, ref }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('useFootnotePreviews', () => {
  it('floats the target note on hover and hides it on leave, without the backref link', () => {
    const { container, ref } = mountContainer(BODY)
    const { unmount } = renderHook(() => useFootnotePreviews(ref, BODY))

    const anchor = container.querySelector<HTMLAnchorElement>('sup a')!
    anchor.dispatchEvent(new Event('mouseenter'))

    const popover = document.body.querySelector<HTMLDivElement>('.footnote-preview')!
    expect(popover.hidden).toBe(false)
    expect(popover.innerHTML).toContain('note body')
    expect(popover.innerHTML).not.toContain('data-footnote-backref')

    anchor.dispatchEvent(new Event('mouseleave'))
    expect(popover.hidden).toBe(true)

    unmount()
    expect(document.body.querySelector('.footnote-preview')).toBeNull()
  })

  it('shows on keyboard focus as well', () => {
    const { container, ref } = mountContainer(BODY)
    renderHook(() => useFootnotePreviews(ref, BODY))

    const anchor = container.querySelector<HTMLAnchorElement>('sup a')!
    anchor.dispatchEvent(new Event('focus'))
    expect(document.body.querySelector<HTMLDivElement>('.footnote-preview')!.hidden).toBe(false)
  })

  it("binds the new article's footnote refs when bodyHtml changes (client-side navigation)", () => {
    const htmlA = '<p>no notes</p>'
    const { container, ref } = mountContainer(htmlA)

    const { rerender } = renderHook(({ html }) => useFootnotePreviews(ref, html), { initialProps: { html: htmlA } })
    expect(document.body.querySelector('.footnote-preview')).toBeNull()

    container.innerHTML = BODY
    rerender({ html: BODY })

    const anchor = container.querySelector<HTMLAnchorElement>('sup a')!
    anchor.dispatchEvent(new Event('mouseenter'))
    const popover = document.body.querySelector<HTMLDivElement>('.footnote-preview')!
    expect(popover.hidden).toBe(false)
    expect(popover.innerHTML).toContain('note body')
  })

  it('does not mount a popover when no footnote refs exist', () => {
    const { ref } = mountContainer('<p>no notes</p>')
    renderHook(() => useFootnotePreviews(ref, '<p>no notes</p>'))
    expect(document.body.querySelector('.footnote-preview')).toBeNull()
  })

  it('scans the container for footnote refs rather than gating on a bodyHtml substring', () => {
    const { container, ref } = mountContainer(BODY)

    // The re-scan key intentionally carries no '#user-content-fn-' marker.
    renderHook(() => useFootnotePreviews(ref, 'rescan-key'))

    container.querySelector<HTMLAnchorElement>('sup a')!.dispatchEvent(new Event('mouseenter'))
    expect(document.body.querySelector<HTMLDivElement>('.footnote-preview')!.hidden).toBe(false)
  })

  it('points an arrow at the trigger, flipping below when there is no room above', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40)
    const { container, ref } = mountContainer(BODY)
    renderHook(() => useFootnotePreviews(ref, BODY))

    const anchor = container.querySelector<HTMLAnchorElement>('sup a')!
    anchor.getBoundingClientRect = () =>
      ({ top: 200, bottom: 212, left: 400, width: 12, right: 412, height: 12, x: 400, y: 200 }) as DOMRect

    anchor.dispatchEvent(new Event('mouseenter'))
    const popover = document.body.querySelector<HTMLDivElement>('.footnote-preview')!
    // left = 406 - 50 = 356; arrow x = 406 - 356 = 50; top = 200 - 40 - 8 = 152.
    expect(popover.dataset.side).toBe('top')
    expect(popover.style.getPropertyValue('--footnote-arrow-x')).toBe('50px')
    expect(popover.style.top).toBe('152px')

    anchor.dispatchEvent(new Event('mouseleave'))

    anchor.getBoundingClientRect = () =>
      ({ top: 20, bottom: 32, left: 400, width: 12, right: 412, height: 12, x: 400, y: 20 }) as DOMRect
    anchor.dispatchEvent(new Event('mouseenter'))
    expect(popover.dataset.side).toBe('bottom')
    expect(popover.style.top).toBe('40px')
  })

  it('clamps the arrow inside the popover when the popover is viewport-clamped', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40)
    const { container, ref } = mountContainer(BODY)
    renderHook(() => useFootnotePreviews(ref, BODY))

    const anchor = container.querySelector<HTMLAnchorElement>('sup a')!
    // Trigger center at x=6: the popover left clamps to 8, so the raw arrow
    // offset (-2px) would fall outside the popover.
    anchor.getBoundingClientRect = () =>
      ({ top: 200, bottom: 212, left: 0, width: 12, right: 12, height: 12, x: 0, y: 200 }) as DOMRect

    anchor.dispatchEvent(new Event('mouseenter'))
    const popover = document.body.querySelector<HTMLDivElement>('.footnote-preview')!
    expect(popover.style.left).toBe('8px')
    expect(popover.style.getPropertyValue('--footnote-arrow-x')).toBe('10px')
  })
})
