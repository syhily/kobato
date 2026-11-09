// @vitest-environment happy-dom
/**
 * The document-level iOS zoom-lock tracker, listener behavior: the lock must
 * be taken at POINTERDOWN (capture) — iOS decides the focus auto-zoom when
 * the tap's default action focuses the target, so the original
 * focusin-time rewrite was already too late on real devices. Form controls
 * hold the lock for their focused session; a contenteditable canvas releases
 * on the task after its focus lands.
 */
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useIosNoZoomOnFocus } from '@/client/hooks/use-ios-no-zoom'

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120'

const ORIGINAL_CONTENT = 'width=device-width, initial-scale=1'
const LOCKED_CONTENT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'

const ORIGINAL_UA = window.navigator.userAgent

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}

function mountViewportMeta() {
  const meta = document.createElement('meta')
  meta.name = 'viewport'
  meta.content = ORIGINAL_CONTENT
  document.head.appendChild(meta)
  return meta
}

function Probe() {
  useIosNoZoomOnFocus()
  return (
    <main>
      <input data-testid="name" />
      <input data-testid="email" />
      <div data-testid="canvas" contentEditable />
      <div data-testid="plain" />
    </main>
  )
}

// The handler only reads `event.target` — a bare Event is equivalent to the
// PointerEvent the browser dispatches.
function pointerDownOn(el: Element) {
  el.dispatchEvent(new Event('pointerdown', { bubbles: true }))
}

let meta: HTMLMetaElement

beforeEach(() => {
  document.querySelector('meta[name="viewport"]')?.remove()
  meta = mountViewportMeta()
})

afterEach(() => {
  setUserAgent(ORIGINAL_UA)
})

describe('useIosNoZoomOnFocus — pointerdown-time acquisition', () => {
  it('locks the viewport at pointerdown on a form control, before any focus event', () => {
    setUserAgent(IOS_UA)
    render(<Probe />)

    pointerDownOn(document.querySelector('[data-testid="name"]')!)
    // Locked with no focus event at all — the acquisition precedes the tap's
    // default action, which is where WebKit decides the zoom.
    expect(meta.content).toBe(LOCKED_CONTENT)
  })

  it('locks at pointerdown on a mounted contenteditable canvas', () => {
    setUserAgent(IOS_UA)
    render(<Probe />)

    pointerDownOn(document.querySelector('[data-testid="canvas"]')!)
    expect(meta.content).toBe(LOCKED_CONTENT)
  })

  it('does not lock for taps outside zoom-sensitive controls', () => {
    setUserAgent(IOS_UA)
    render(<Probe />)

    pointerDownOn(document.querySelector('[data-testid="plain"]')!)
    expect(meta.content).toBe(ORIGINAL_CONTENT)
  })

  it('no-ops on non-iOS user agents', () => {
    setUserAgent(ANDROID_UA)
    render(<Probe />)

    pointerDownOn(document.querySelector('[data-testid="name"]')!)
    expect(meta.content).toBe(ORIGINAL_CONTENT)
  })
})

describe('useIosNoZoomOnFocus — release choreography', () => {
  it('releases on the task after a contenteditable takes focus', async () => {
    setUserAgent(IOS_UA)
    render(<Probe />)
    const canvas = document.querySelector('[data-testid="canvas"]')!

    pointerDownOn(canvas)
    expect(meta.content).toBe(LOCKED_CONTENT)

    canvas.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await waitFor(() => expect(meta.content).toBe(ORIGINAL_CONTENT))
  })

  it('keeps the lock while focus hops between form controls, releases when it leaves', async () => {
    setUserAgent(IOS_UA)
    render(<Probe />)
    const name = document.querySelector('[data-testid="name"]')!
    const email = document.querySelector('[data-testid="email"]')!

    pointerDownOn(name)
    name.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    // input → input (the keyboard "next" hop, no pointerdown to relock).
    name.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: email }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(meta.content).toBe(LOCKED_CONTENT)

    // Leaving the form-control world releases.
    email.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }))
    await waitFor(() => expect(meta.content).toBe(ORIGINAL_CONTENT))
  })

  it('releases via the safety timer when a tap never focuses', async () => {
    setUserAgent(IOS_UA)
    render(<Probe />)

    pointerDownOn(document.querySelector('[data-testid="name"]')!)
    expect(meta.content).toBe(LOCKED_CONTENT)

    // No focusin ever lands (drag away / cancelled touch).
    await waitFor(() => expect(meta.content).toBe(ORIGINAL_CONTENT), { timeout: 2000 })
  })
})
