import { describe, expect, it } from 'vitest'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderToHtml, stableHtml } from '#/_helpers/render'
import { LikeButton } from '@/ui/public/LikeActions'

mockTanstackQuery()

// like-actions.test.tsx covers LikeShare; this adds the SSR render-path
// for LikeButton (handlers/localStorage/optimistic transition are client-only).

describe('snapshot: LikeButton branches', () => {
  it('renders the initial unliked button with the like count', () => {
    const html = stableHtml(renderToHtml(<LikeButton permalink="/posts/hello" commentKey="key-1" likes={42} />))
    expect(html).toContain('Do you like me?')
    expect(html).toContain('data-liked="false"')
    expect(html).toContain('aria-label="点赞"')
    expect(html).toContain('42')
  })
})
