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
    const { container, ref } = mountContainer(`<img src="/x.png" data-thumbhash="${THUMBHASH}" alt="">`)
    renderHook(() => useThumbhashHydration(ref))

    const img = container.querySelector('img')!
    expect(img.style.backgroundImage).toContain('data:image/png')
    expect(img.style.backgroundSize).toBe('cover')

    img.dispatchEvent(new Event('load'))
    expect(img.style.backgroundImage).toBe('')
  })

  it('skips images without a thumbhash hook', () => {
    const { container, ref } = mountContainer('<img src="/x.png" alt="">')
    renderHook(() => useThumbhashHydration(ref))
    expect(container.querySelector('img')!.style.backgroundImage).toBe('')
  })

  it('no-ops on a null container', () => {
    expect(() => renderHook(() => useThumbhashHydration({ current: null }))).not.toThrow()
  })
})
