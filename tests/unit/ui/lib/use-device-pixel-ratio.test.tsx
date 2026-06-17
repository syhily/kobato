import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDevicePixelRatio } from '@/ui/lib/use-device-pixel-ratio'

function DprIndicator() {
  const dpr = useDevicePixelRatio()
  return <span data-dpr={dpr}>{dpr}</span>
}

describe('ui/lib/use-device-pixel-ratio', () => {
  beforeEach(() => {
    vi.stubGlobal('devicePixelRatio', 2)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 1 during SSR', () => {
    const html = renderToStaticMarkup(<DprIndicator />)
    expect(html).toContain('data-dpr="1"')
  })

  it('does not crash when window.devicePixelRatio is mocked', () => {
    const html = renderToStaticMarkup(<DprIndicator />)
    expect(html).toContain('data-dpr="1"')
  })
})
