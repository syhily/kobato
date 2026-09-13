// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { useThumbhashHydration } from '@/ui/public/post/use-thumbhash-hydration'

// A real thumbhash (1x1 white) — decode failure paths return undefined.
const THUMBHASH = '1QcSHQRnh493V4dIh4eXh1h4kJUI'

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

describe('useThumbhashHydration', () => {
  it('paints the decoded thumbhash background and clears it on load', () => {
    const html = `<img src="/x.png" data-thumbhash="${THUMBHASH}" alt="">`
    const { container, ref } = mountContainer(html)
    renderHook(() => useThumbhashHydration(ref, html))

    const img = container.querySelector('img')!
    expect(img.style.backgroundImage).toContain('data:image/png')
    expect(img.style.backgroundSize).toBe('cover')

    img.dispatchEvent(new Event('load'))
    expect(img.style.backgroundImage).toBe('')
  })

  it('skips images without a thumbhash hook', () => {
    const html = '<img src="/x.png" alt="">'
    const { container, ref } = mountContainer(html)
    renderHook(() => useThumbhashHydration(ref, html))
    expect(container.querySelector('img')!.style.backgroundImage).toBe('')
  })

  it("paints the new article's placeholders when bodyHtml changes (client-side navigation)", () => {
    const htmlA = '<p>no images</p>'
    const htmlB = `<img src="/y.png" data-thumbhash="${THUMBHASH}" alt="">`
    const { container, ref } = mountContainer(htmlA)

    const { rerender } = renderHook(({ html }) => useThumbhashHydration(ref, html), { initialProps: { html: htmlA } })
    expect(container.querySelector('img')).toBeNull()

    container.innerHTML = htmlB
    rerender({ html: htmlB })

    expect(container.querySelector('img')!.style.backgroundImage).toContain('data:image/png')
  })

  it('no-ops on a null container', () => {
    expect(() => renderHook(() => useThumbhashHydration({ current: null }, ''))).not.toThrow()
  })

  it('scans the container for thumbhash images rather than gating on a bodyHtml substring', () => {
    const html = `<img src="/x.png" data-thumbhash="${THUMBHASH}" alt="">`
    const { container, ref } = mountContainer(html)

    // The re-scan key intentionally carries no 'data-thumbhash' marker.
    renderHook(() => useThumbhashHydration(ref, 'rescan-key'))

    expect(container.querySelector('img')!.style.backgroundImage).toContain('data:image/png')
  })
})
