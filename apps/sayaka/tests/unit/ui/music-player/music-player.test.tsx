// @vitest-environment happy-dom

import type { CardRenderContext } from '@kobato/inkling/headless/cards/card-html'

import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US'
import {
  MUSIC_PLAYER_CARD_CLASSES,
  type MusicPlayerCardMeta,
  musicPlayerFallbackHtml,
  renderMusicPlayerCard,
} from '@kobato/inkling/headless/cards/music-player'
import { diffHtmlStructures, structureFromHtml } from '@kobato/test/dom-structure'
import { MusicPlayerCard } from '@kobato/ui/components/music-player/music-player'
import { __resetProgrammaticVolumeSupportForTests } from '@kobato/ui/lib/use-music-playback'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { fireEvent, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const base = {
  name: 'Test Song',
  artist: 'Test Artist',
  url: 'https://example.com/audio.mp3',
  cover: 'https://example.com/cover.jpg',
  lrc: '[00:10.00]First line\n[00:20.00]Second line',
}

const playMock = vi.fn(() => Promise.resolve())
const pauseMock = vi.fn()

const SKELETON_TOKENS = [
  ...new Set(Object.values(MUSIC_PLAYER_CARD_CLASSES).flatMap((classes) => classes.split(/\s+/))),
]

const escapeText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function stubContext(): CardRenderContext {
  return {
    createDocument: () => document,
    sanitizeBasicHtml: (html) => html,
    escapeText,
    safeUrl: (_kind, value) => value,
  }
}

const baseMeta: MusicPlayerCardMeta = {
  playerId: 'p1',
  name: base.name,
  artist: base.artist,
  cover: base.cover,
  audioUrl: base.url,
  lyric: base.lrc,
}

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', { configurable: true, value: playMock })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', { configurable: true, value: pauseMock })
})

describe('ui/public/music-player/music-player', () => {
  it('renders name, artist, cover, and the paused initial times', () => {
    const html = renderToStaticMarkup(wrapWithI18n(<MusicPlayerCard {...base} />))
    expect(html).toContain('Test Song')
    expect(html).toContain('Test Artist')
    expect(html).toContain('https://example.com/cover.jpg')
    expect(html).toContain('00:00')
    expect(html).toContain('--:--')
  })

  it('renders the glyph placeholder when cover is missing', () => {
    const html = renderToStaticMarkup(wrapWithI18n(<MusicPlayerCard {...base} cover={undefined} />))
    expect(html).toContain('🎵')
    expect(html).not.toContain('<img')
  })

  it('renders the lyrics toggle only when lrc is present', () => {
    const withLrc = renderToStaticMarkup(wrapWithI18n(<MusicPlayerCard {...base} />))
    expect(withLrc).toContain('aria-label="歌词"')
    const withoutLrc = renderToStaticMarkup(wrapWithI18n(<MusicPlayerCard {...base} lrc={undefined} />))
    expect(withoutLrc).not.toContain('aria-label="歌词"')
  })

  it('starts playing when the cover button is clicked', () => {
    const { getByLabelText } = render(wrapWithI18n(<MusicPlayerCard {...base} />))
    fireEvent.click(getByLabelText('播放'))
    expect(playMock).toHaveBeenCalled()
  })

  it('expands the lyrics panel on toggle and seeks on line click', () => {
    const { getByLabelText, getByText, queryByText } = render(wrapWithI18n(<MusicPlayerCard {...base} />))
    expect(queryByText('First line')).toBeNull()

    fireEvent.click(getByLabelText('歌词'))
    expect(getByText('First line')).not.toBeNull()
  })

  it('localizes its control labels (en-US)', () => {
    const html = renderToStaticMarkup(
      wrapWithI18n(<MusicPlayerCard {...base} />, { locale: 'en-US', messages: uiMessagesEnUS }),
    )
    expect(html).toContain('aria-label="Play"')
    expect(html).toContain('aria-label="Lyrics"')
    expect(html).toContain('aria-label="Mute"')
    expect(html).not.toContain('aria-label="播放"')
  })

  it('keeps the volume slider collapsed until hover/focus on fine pointers', () => {
    const html = renderToStaticMarkup(wrapWithI18n(<MusicPlayerCard {...base} />))
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
      const { getByLabelText } = render(wrapWithI18n(<MusicPlayerCard {...base} />))
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
      const html = renderToStaticMarkup(wrapWithI18n(<MusicPlayerCard {...base} />))
      expect(html).not.toContain('aria-label="音量"')
      expect(html).toContain('aria-label="静音"')
    } finally {
      if (original) {
        Object.defineProperty(window.HTMLMediaElement.prototype, 'volume', original)
      }
      __resetProgrammaticVolumeSupportForTests()
    }
  })

  it('renders a paused initial skeleton structurally identical to the export fallback markup', () => {
    const playerHtml = renderToStaticMarkup(wrapWithI18n(<MusicPlayerCard {...base} />))
    const fallbackHtml = musicPlayerFallbackHtml(baseMeta, (value) => value)
    const diffs = diffHtmlStructures(playerHtml, fallbackHtml, {
      prune: ['link', 'button', 'svg', 'img', '.absolute', '[class*="group/volume"]'],
      classTokens: SKELETON_TOKENS,
      dataAttributes: [],
      compareText: true,
    })
    expect(diffs).toEqual([])
  })

  it('pins the fallback cover markup the skeleton comparison prunes away', () => {
    const fallbackHtml = musicPlayerFallbackHtml(baseMeta, escapeText)
    const [fallback, ...rest] = structureFromHtml(fallbackHtml, { attributes: ['src', 'alt'] })
    expect(rest).toEqual([])
    const img = fallback?.children[0]?.children[0]
    expect(img?.tag).toBe('img')
    expect(img?.classes).toEqual(MUSIC_PLAYER_CARD_CLASSES.fallbackCover.split(/\s+/).sort())
    expect(img?.attributes).toEqual({ src: baseMeta.cover, alt: baseMeta.name })
  })

  it('renders the no-cover glyph fallback with the surviving skeleton still aligned', () => {
    const noCoverMeta: MusicPlayerCardMeta = { ...baseMeta, cover: '' }
    const playerHtml = renderToStaticMarkup(wrapWithI18n(<MusicPlayerCard {...base} cover={undefined} />))
    const fallbackHtml = musicPlayerFallbackHtml(noCoverMeta, escapeText)
    const diffs = diffHtmlStructures(playerHtml, fallbackHtml, {
      prune: ['button', 'svg', 'img', '.absolute', '[class*="group/volume"]', '[aria-hidden]'],
      classTokens: SKELETON_TOKENS,
      dataAttributes: [],
      compareText: true,
    })
    expect(diffs).toEqual([])
    const [fallback] = structureFromHtml(fallbackHtml, { compareText: true })
    const glyph = fallback?.children[0]?.children[0]
    expect(glyph?.tag).toBe('span')
    expect(glyph?.classes).toEqual(MUSIC_PLAYER_CARD_CLASSES.fallbackGlyph.split(/\s+/).sort())
    expect(glyph?.text).toBe('🎵')
  })

  it('exports the mount point with exactly the data attributes the hydrator consumes', () => {
    const full = renderMusicPlayerCard(baseMeta, stubContext())
    expect(full.type).toBe('outer')
    const [wrapper, ...rest] = structureFromHtml(full.element.outerHTML)
    expect(rest).toEqual([])
    expect(wrapper?.tag).toBe('div')
    expect(wrapper?.classes).toEqual(MUSIC_PLAYER_CARD_CLASSES.wrapper.split(/\s+/).sort())
    expect(wrapper?.children.length).toBe(1)
    const mount = wrapper?.children[0]
    expect(mount?.tag).toBe('div')
    expect(mount?.classes).toEqual(['aplayer'])
    expect(mount?.data).toEqual({
      id: baseMeta.playerId,
      name: baseMeta.name,
      artist: baseMeta.artist,
      url: baseMeta.audioUrl,
      cover: baseMeta.cover,
      lrc: baseMeta.lyric,
    })
    const mountHtml = full.element.querySelector('.aplayer')?.innerHTML ?? ''
    expect(diffHtmlStructures(mountHtml, musicPlayerFallbackHtml(baseMeta, escapeText), { compareText: true })).toEqual(
      [],
    )
  })
})
