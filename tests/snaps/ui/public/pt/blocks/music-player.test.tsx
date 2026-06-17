import { describe, expect, it } from 'vitest'

import type { MusicPlayerBlockMeta } from '@/shared/types/music'

import { renderToHtml } from '#/_helpers/render'
import { MusicPlayer } from '@/ui/pt/blocks/MusicPlayer'

const meta: MusicPlayerBlockMeta = {
  id: 'music-1',
  name: 'Test Song',
  artist: 'Test Artist',
  cover: '/images/cover.png',
  audioUrl: '/audio/test.mp3',
  lyric: '[00:00.00]Test lyric',
}

describe('snapshot: MusicPlayer', () => {
  it('renders the resolved meta player with a suspense fallback', () => {
    const html = renderToHtml(<MusicPlayer meta={meta} />)
    expect(html).toContain('aplayer')
    expect(html).toContain('data-id="music-1"')
  })

  it('renders a legacy placeholder when meta is absent', () => {
    const html = renderToHtml(<MusicPlayer id="legacy-id" />)
    expect(html).toContain('aplayer')
    expect(html).toContain('data-id="legacy-id"')
  })
})
