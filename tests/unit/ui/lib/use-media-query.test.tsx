import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMediaQuery } from '@/ui/lib/use-media-query'

function MatchIndicator({ query, fallback }: { query: string; fallback?: boolean }) {
  const matches = useMediaQuery(query, fallback ?? false)
  return <span data-matches={matches}>{matches ? 'yes' : 'no'}</span>
}

describe('ui/lib/use-media-query', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(min-width: 1px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the default value during SSR', () => {
    const html = renderToStaticMarkup(<MatchIndicator query="(min-width: 768px)" fallback />)
    expect(html).toContain('data-matches="true"')
    expect(html).toContain('yes')
  })

  it('defaults to false when no fallback is provided', () => {
    const html = renderToStaticMarkup(<MatchIndicator query="(min-width: 768px)" />)
    expect(html).toContain('data-matches="false"')
    expect(html).toContain('no')
  })

  it('does not crash when window.matchMedia is mocked', () => {
    const html = renderToStaticMarkup(<MatchIndicator query="(min-width: 1px)" />)
    expect(html).toContain('data-matches="false"')
  })
})
