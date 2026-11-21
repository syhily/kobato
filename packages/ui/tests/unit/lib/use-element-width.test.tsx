import { useElementWidth } from '@kobato/ui/lib/use-element-width'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function WidthIndicator() {
  const { ref, width } = useElementWidth()
  return (
    <div ref={ref} data-width={width}>
      {width}px
    </div>
  )
}

describe('ui/lib/use-element-width', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(() => ({
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
      })),
    )
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => cb(0)),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns width 0 during SSR', () => {
    const html = renderToStaticMarkup(<WidthIndicator />)
    expect(html).toContain('data-width="0"')
    expect(html).toContain('0px')
  })

  it('exposes a ref that can be attached to an element', () => {
    const html = renderToStaticMarkup(<WidthIndicator />)
    expect(html).toContain('<div')
  })
})
