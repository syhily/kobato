import type * as LockModule from '@kobato/web-public/ui/comments/viewport-zoom-lock'

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120'

const ORIGINAL_CONTENT = 'width=device-width, initial-scale=1'
const LOCKED_CONTENT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'

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

beforeEach(() => {
  vi.resetModules()
  document.querySelector('meta[name="viewport"]')?.remove()
})

async function freshLock(): Promise<typeof LockModule> {
  return import('@kobato/web-public/ui/comments/viewport-zoom-lock')
}

describe('viewport-zoom-lock', () => {
  it('locks the meta on acquire and restores it only on the last release', async () => {
    setUserAgent(IOS_UA)
    const meta = mountViewportMeta()
    const { acquireViewportZoomLock, releaseViewportZoomLock } = await freshLock()

    acquireViewportZoomLock()
    expect(meta.content).toBe(LOCKED_CONTENT)

    acquireViewportZoomLock()
    releaseViewportZoomLock()
    expect(meta.content).toBe(LOCKED_CONTENT)

    releaseViewportZoomLock()
    expect(meta.content).toBe(ORIGINAL_CONTENT)
  })

  it('no-ops on non-iOS user agents', async () => {
    setUserAgent(ANDROID_UA)
    const meta = mountViewportMeta()
    const { acquireViewportZoomLock, releaseViewportZoomLock } = await freshLock()

    acquireViewportZoomLock()
    releaseViewportZoomLock()
    expect(meta.content).toBe(ORIGINAL_CONTENT)
  })

  it('stays balanced when the viewport meta is missing', async () => {
    setUserAgent(IOS_UA)
    const { acquireViewportZoomLock, releaseViewportZoomLock } = await freshLock()

    expect(() => {
      acquireViewportZoomLock()
      releaseViewportZoomLock()
    }).not.toThrow()

    const meta = mountViewportMeta()
    acquireViewportZoomLock()
    expect(meta.content).toBe(LOCKED_CONTENT)
    releaseViewportZoomLock()
    expect(meta.content).toBe(ORIGINAL_CONTENT)
  })
})
