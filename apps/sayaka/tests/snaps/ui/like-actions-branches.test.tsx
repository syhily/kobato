import { mockTanstackQuery } from '@kobato/test/mock-react-query'
import { renderToHtml, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { LikeButton } from '@sayaka/ui/LikeActions'
import { describe, expect, it } from 'vitest'

mockTanstackQuery()

describe('snapshot: LikeButton branches', () => {
  it('renders the initial unliked button with the like count', () => {
    const html = stableHtml(renderToHtml(<LikeButton permalink="/posts/hello" commentKey="key-1" likes={42} />))
    expect(html).toContain('喜欢这篇文章吗？')
    expect(html).toContain('data-liked="false"')
    expect(html).toContain('aria-label="点赞"')
    expect(html).toContain('42')
  })
})
