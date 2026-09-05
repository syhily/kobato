import { act, renderHook } from '@testing-library/react'
import { type LexicalEditor } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'

import { useSelectionAnchoredPopup } from '@/hooks/useSelectionAnchoredPopup'
import { type PopupRectLike } from '@/utils/selection-anchored-popup'

function rect(top: number, left: number, width: number, height: number): PopupRectLike {
  return { top, left, width, height, bottom: top + height, right: left + width }
}

function createEditor(root: HTMLElement): LexicalEditor {
  return {
    update: (fn: () => void) => fn(),
    getRootElement: () => root,
  } as unknown as LexicalEditor
}

function setBodyScroll(scrollHeight: number, scrollTop = 0) {
  Object.defineProperty(document.body, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(document.body, 'scrollTop', { value: scrollTop, configurable: true })
}

describe('useSelectionAnchoredPopup', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function setup({ scrollHeight = 2000 }: { scrollHeight?: number } = {}) {
    setBodyScroll(scrollHeight)

    const root = document.createElement('div')
    document.body.appendChild(root)
    const popup = document.createElement('div')
    document.body.appendChild(popup)

    const editor = createEditor(root)
    const popupRef = { current: popup }
    const anchorRect = { current: rect(700, 20, 100, 20) }
    const container = rect(0, 20, 460, 800)

    const { result } = renderHook(() =>
      useSelectionAnchoredPopup({
        editor,
        popupRef,
        anchor: () => anchorRect.current as DOMRect,
        containerRect: () => container as DOMRect,
      }),
    )

    return { anchorRect, popup, result }
  }

  it('writes the resolved placement onto the popup element', () => {
    const { popup } = setup()

    expect(popup.style.top).toBe('730px')
    expect(popup.style.left).toBe('20px')
    expect(popup.style.width).toBe('460px')
  })

  it('flips above the anchor when the scroll container overflows', () => {
    const { popup } = setup({ scrollHeight: 800 })

    expect(popup.style.top).toBe(`${700 - 10}px`) // popupHeight is 0 in jsdom
  })

  it('does not reposition while the anchor resolves to null', () => {
    const { popup } = setup()
    popup.style.top = ''

    const root = document.body.firstElementChild as HTMLElement
    const editor = createEditor(root)
    renderHook(() =>
      useSelectionAnchoredPopup({
        editor,
        popupRef: { current: popup },
        anchor: () => null,
        containerRect: () => rect(0, 20, 460, 800) as DOMRect,
      }),
    )

    expect(popup.style.top).toBe('')
  })

  it('repositions on window resize', () => {
    const { anchorRect, popup } = setup()

    act(() => {
      anchorRect.current = rect(100, 20, 100, 20)
      window.dispatchEvent(new Event('resize'))
    })

    expect(popup.style.top).toBe('130px')
  })
})
