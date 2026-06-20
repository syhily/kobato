import { describe, expect, it } from 'vitest'

import { renderToHtml } from '#/_helpers/render'
import { BlockImage } from '@/ui/inkling/render/components/BlockImage'

describe('snapshot: BlockImage', () => {
  it('renders an img with explicit dimensions', () => {
    const html = renderToHtml(<BlockImage src="/images/block.png" alt="Block" width={800} height={450} />)
    expect(html).toContain('src="/images/block.png"')
    expect(html).toContain('alt="Block"')
    expect(html).toContain('width="800"')
    expect(html).toContain('height="450"')
    expect(html).toContain('sizes="100vw"')
  })

  it('falls back to a 16/9 aspect ratio when dimensions are missing', () => {
    const html = renderToHtml(<BlockImage src="/images/block.png" alt="Block" />)
    expect(html).toContain('aspect-ratio:16/9')
  })
})
