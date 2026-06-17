import { describe, expect, it } from 'vitest'

import { renderToHtml } from '#/_helpers/render'
import { Image, RawImage } from '@/ui/public/widgets/Image'

describe('snapshot: Image', () => {
  it('renders an optimized img tag with the test asset host', () => {
    const html = renderToHtml(<Image src="/images/cover.png" alt="Cover" width={600} height={400} />)
    expect(html).toContain('src="/images/cover.png"')
    expect(html).toContain('alt="Cover"')
    expect(html).toContain('width="600"')
    expect(html).toContain('height="400"')
    expect(html).toContain('loading="lazy"')
  })

  it('renders a raw image with explicit asset host and url template', () => {
    const html = renderToHtml(
      <RawImage
        src="https://assets.example.com/photo.jpg"
        alt="Photo"
        width={800}
        height={600}
        sizes="(max-width: 1200px) 100vw, 800px"
        assetHost="assets.example.com"
        urlTemplate="/{width}x{height}/q{quality}/{src}"
      />,
    )
    expect(html).toContain('alt="Photo"')
    expect(html).toContain('srcSet=')
    expect(html).toContain('sizes=')
  })
})
