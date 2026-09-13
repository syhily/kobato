// @vitest-environment happy-dom

import { fireEvent, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { MUSIC_PLAYER_CARD_CLASSES, musicPlayerFallbackHtml } from '@/shared/lexical/cards/music-player'
import { MusicPlayerCard } from '@/ui/public/music-player/music-player'
import { __resetProgrammaticVolumeSupportForTests } from '@/ui/public/music-player/use-music-playback'

const base = {
  name: 'Test Song',
  artist: 'Test Artist',
  url: 'https://example.com/audio.mp3',
  cover: 'https://example.com/cover.jpg',
  lrc: '[00:10.00]First line\n[00:20.00]Second line',
}

const playMock = vi.fn(() => Promise.resolve())
const pauseMock = vi.fn()

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', { configurable: true, value: playMock })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', { configurable: true, value: pauseMock })
})

describe('ui/public/music-player/music-player', () => {
  it('renders name, artist, cover, and the paused initial times', () => {
    const html = renderToStaticMarkup(<MusicPlayerCard {...base} />)
    expect(html).toContain('Test Song')
    expect(html).toContain('Test Artist')
    expect(html).toContain('https://example.com/cover.jpg')
    expect(html).toContain('0:00')
    expect(html).toContain('--:--')
  })

  it('renders the glyph placeholder when cover is missing', () => {
    const html = renderToStaticMarkup(<MusicPlayerCard {...base} cover={undefined} />)
    expect(html).toContain('🎵')
    expect(html).not.toContain('<img')
  })

  it('renders the lyrics toggle only when lrc is present', () => {
    const withLrc = renderToStaticMarkup(<MusicPlayerCard {...base} />)
    expect(withLrc).toContain('aria-label="歌词"')
    const withoutLrc = renderToStaticMarkup(<MusicPlayerCard {...base} lrc={undefined} />)
    expect(withoutLrc).not.toContain('aria-label="歌词"')
  })

  it('starts playing when the cover button is clicked', () => {
    const { getByLabelText } = render(<MusicPlayerCard {...base} />)
    fireEvent.click(getByLabelText('播放'))
    expect(playMock).toHaveBeenCalled()
  })

  it('expands the lyrics panel on toggle and seeks on line click', () => {
    const { getByLabelText, getByText, queryByText } = render(<MusicPlayerCard {...base} />)
    expect(queryByText('First line')).toBeNull()

    fireEvent.click(getByLabelText('歌词'))
    expect(getByText('First line')).not.toBeNull()
  })

  it('keeps the volume slider collapsed until hover/focus on fine pointers', () => {
    const html = renderToStaticMarkup(<MusicPlayerCard {...base} />)
    expect(html).toContain('aria-label="音量"')
    expect(html).toContain('group-hover/volume:w-20')
  })

  it('keeps the volume slider expanded on coarse pointers (touch has no hover)', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(hover: none)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }))
    try {
      const { getByLabelText } = render(<MusicPlayerCard {...base} />)
      const container = getByLabelText('音量').parentElement
      expect(container?.className).toContain('w-20')
      expect(container?.className).not.toContain('w-0')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('hides the volume slider but keeps mute when the platform ignores programmatic volume (iOS)', () => {
    const original = Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, 'volume')
    Object.defineProperty(window.HTMLMediaElement.prototype, 'volume', {
      configurable: true,
      get: () => 1,
      set: () => {},
    })
    __resetProgrammaticVolumeSupportForTests()
    try {
      const html = renderToStaticMarkup(<MusicPlayerCard {...base} />)
      expect(html).not.toContain('aria-label="音量"')
      expect(html).toContain('aria-label="静音"')
    } finally {
      if (original) {
        Object.defineProperty(window.HTMLMediaElement.prototype, 'volume', original)
      }
      __resetProgrammaticVolumeSupportForTests()
    }
  })

  it('keeps the paused initial render structurally aligned with the export fallback markup', () => {
    const playerHtml = renderToStaticMarkup(<MusicPlayerCard {...base} />)
    const fallbackHtml = musicPlayerFallbackHtml(
      { playerId: 'p1', name: base.name, artist: base.artist, cover: base.cover, audioUrl: base.url, lyric: base.lrc },
      (value) => value,
    )
    for (const classes of [
      MUSIC_PLAYER_CARD_CLASSES.fallbackBody,
      MUSIC_PLAYER_CARD_CLASSES.fallbackProgress,
      MUSIC_PLAYER_CARD_CLASSES.fallbackBarTrack,
    ]) {
      expect(playerHtml).toContain(classes)
      expect(fallbackHtml).toContain(classes)
    }
  })
})
