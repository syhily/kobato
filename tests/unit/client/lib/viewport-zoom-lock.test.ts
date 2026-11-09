// @vitest-environment happy-dom
/**
 * The refcounted viewport zoom lock (client/AGENTS.md → iOS auto-zoom):
 * iOS Safari decides the input auto-zoom when focus lands, so activations
 * freeze the viewport meta until the editable has taken focus, then restore
 * it — pinch-zoom stays available. Refcounting lets the document-level
 * form-control tracker and the composer's activation handoff overlap
 * without racing the same `<meta>` rewrite.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as LockModule from '@/client/lib/viewport-zoom-lock'

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

// The lock keeps module-level holder state — a fresh module graph per case
// keeps them independent.
beforeEach(() => {
  vi.resetModules()
  document.querySelector('meta[name="viewport"]')?.remove()
})

async function freshLock(): Promise<typeof LockModule> {
  return import('@/client/lib/viewport-zoom-lock')
}

describe('viewport-zoom-lock', () => {
  it('locks the meta on acquire and restores it only on the last release', async () => {
    setUserAgent(IOS_UA)
    const meta = mountViewportMeta()
    const { acquireViewportZoomLock, releaseViewportZoomLock } = await freshLock()

    acquireViewportZoomLock()
    expect(meta.content).toBe(LOCKED_CONTENT)

    // A second holder (form-control tracker + composer handoff overlap) must
    // not restore the meta early.
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

    // The skipped pair left no phantom holder: the next cycle still locks.
    const meta = mountViewportMeta()
    acquireViewportZoomLock()
    expect(meta.content).toBe(LOCKED_CONTENT)
    releaseViewportZoomLock()
    expect(meta.content).toBe(ORIGINAL_CONTENT)
  })
})
