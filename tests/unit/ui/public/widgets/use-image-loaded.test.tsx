import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { useImageLoaded } from '@/ui/public/widgets/use-image-loaded'

function LoadedIndicator() {
  const { ref, loaded } = useImageLoaded(undefined)
  return <img ref={ref} data-loaded={loaded} src="/image.png" alt="test" />
}

describe('ui/public/widgets/use-image-loaded', () => {
  it('returns loaded false during SSR', () => {
    const html = renderToStaticMarkup(<LoadedIndicator />)
    expect(html).toContain('data-loaded="false"')
  })

  it('forwards the ref to the image element', () => {
    const html = renderToStaticMarkup(<LoadedIndicator />)
    expect(html).toContain('<img')
    expect(html).toContain('src="/image.png"')
  })
})
