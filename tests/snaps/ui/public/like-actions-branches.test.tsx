import { describe, expect, it, vi } from 'vitest'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { LikeButton } from '@/ui/public/LikeActions'

// `like-actions.test.tsx` covers `LikeShare`; this file adds the SSR
// render-path for `LikeButton`. Event handlers, localStorage and the
// optimistic transition are client-only, but the initial button state is
// reachable in a snapshot.

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  }
})

describe('snapshot: LikeButton branches', () => {
  it('renders the initial unliked button with the like count', () => {
    const html = stableHtml(renderToHtml(<LikeButton permalink="/posts/hello" commentKey="key-1" likes={42} />))
    expect(html).toContain('Do you like me?')
    expect(html).toContain('data-liked="false"')
    expect(html).toContain('aria-label="点赞"')
    expect(html).toContain('42')
  })
})
