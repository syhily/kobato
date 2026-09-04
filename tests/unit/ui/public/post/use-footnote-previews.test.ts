// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

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
  document.body.replaceChildren()
})

describe('useFootnotePreviews', () => {
  it('floats the target note on hover and hides it on leave, without the backref link', () => {
    const { container, ref } = mountContainer(BODY)
    const { unmount } = renderHook(() => useFootnotePreviews(ref))

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
    renderHook(() => useFootnotePreviews(ref))

    const anchor = container.querySelector<HTMLAnchorElement>('sup a')!
    anchor.dispatchEvent(new Event('focus'))
    expect(document.body.querySelector<HTMLDivElement>('.footnote-preview')!.hidden).toBe(false)
  })

  it('does not mount a popover when no footnote refs exist', () => {
    const { ref } = mountContainer('<p>no notes</p>')
    renderHook(() => useFootnotePreviews(ref))
    expect(document.body.querySelector('.footnote-preview')).toBeNull()
  })
})
