import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { MusicPlayerBlockMeta } from '@/shared/types/music'

import { MusicPlayer } from '@/ui/pt/blocks/MusicPlayer'

describe('ui/pt/blocks/MusicPlayer', () => {
  const sampleMeta: MusicPlayerBlockMeta = {
    id: 'abcdefghijklmnop',
    name: 'Song Name',
    artist: 'Artist Name',
    cover: 'https://example.com/cover.jpg',
    audioUrl: 'https://example.com/audio.mp3',
    lyric: '[00:00.00]Lyric line',
  }

  it('renders from prerendered metadata without a client fetch', () => {
    const html = renderToString(<MusicPlayer meta={sampleMeta} auto alignment="center" />)
    expect(html).toContain('data-id="abcdefghijklmnop"')
    expect(html).toContain('aplayer')
  })

  it('renders a placeholder when metadata is missing', () => {
    const html = renderToString(<MusicPlayer id="legacy-id" alignment="start" />)
    expect(html).toContain('data-id="legacy-id"')
    expect(html).toContain('aplayer')
  })
})
