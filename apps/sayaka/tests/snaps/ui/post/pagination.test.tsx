import { renderInRouter, renderToHtml } from '@kobato/web-kit/tests/utils/render'
import { Pagination } from '@sayaka/ui/post/Pagination'
import { describe, expect, it } from 'vitest'

describe('snapshot: Pagination', () => {
  it('dense (total = 4) at page 2', () => {
    const html = renderInRouter(<Pagination current={2} total={4} rootPath="/archives" />)
    expect(html).toContain('aria-label="文章"')
    expect(html).toContain('>1<')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('>2<')
    expect(html).toContain('>3<')
  })

  it('windowed (total = 12) near the start', () => {
    const html = renderInRouter(<Pagination current={2} total={12} rootPath="/archives" />)
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('>1<')
    expect(html).toContain('>2<')
    expect(html).toContain('>3<')
    expect(html).toContain('更多')
  })

  it('windowed (total = 12) in the middle', () => {
    const html = renderInRouter(<Pagination current={6} total={12} rootPath="/archives" />)
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('>5<')
    expect(html).toContain('>6<')
    expect(html).toContain('更多')
  })

  it('windowed (total = 12) near the end', () => {
    const html = renderInRouter(<Pagination current={11} total={12} rootPath="/archives" />)
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('>11<')
    expect(html).toContain('>12<')
    expect(html).toContain('更多')
  })

  it('returns nothing when total <= 1', () => {
    const html = renderToHtml(<Pagination current={1} total={1} rootPath="/archives" />)
    expect(html).toBe('')
  })
})
