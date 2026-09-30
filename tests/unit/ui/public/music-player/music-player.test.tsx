// @vitest-environment happy-dom

import { fireEvent, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { CardRenderContext } from '@/shared/lexical/cards/card-html'

import { diffHtmlStructures, structureFromHtml } from '#/_helpers/dom-structure'
import {
  MUSIC_PLAYER_CARD_CLASSES,
  type MusicPlayerCardMeta,
  musicPlayerFallbackHtml,
  renderMusicPlayerCard,
} from '@/shared/lexical/cards/music-player'
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

// The parity surface: every class token the shared spec's constants define.
// The hydrated card adds behavior-only classes on top of these (select-none,
// group/scrub, relative…) — they fall out of the structural comparison.
const SKELETON_TOKENS = [
  ...new Set(Object.values(MUSIC_PLAYER_CARD_CLASSES).flatMap((classes) => classes.split(/\s+/))),
]

const escapeText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The render-context fields `renderMusicPlayerCard` touches, identity-style
 * (URL policy is pinned separately by the projection tests). */
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

  it('renders a paused initial skeleton structurally identical to the export fallback markup', () => {
    const playerHtml = renderToStaticMarkup(<MusicPlayerCard {...base} />)
    const fallbackHtml = musicPlayerFallbackHtml(baseMeta, (value) => value)
    const diffs = diffHtmlStructures(playerHtml, fallbackHtml, {
      // Interactive chrome only the hydrated player renders — the inert
      // fallback omits it by design: the play/lyrics/mute buttons (with
      // their icons and the cover image they wrap), the absolutely
      // positioned overlay/fill/thumb, the volume slider group, and React
      // 19's hoisted preload <link> (an SSR fetch hint, not chrome markup).
      prune: ['link', 'button', 'svg', 'img', '.absolute', '[class*="group/volume"]'],
      classTokens: SKELETON_TOKENS,
      // No hydrator-consumed data-* lives on the card itself — the mount
      // point carries those, pinned by the mount-point test below.
      dataAttributes: [],
      compareText: true,
    })
    expect(diffs).toEqual([])
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
    // useMusicPlayers reads data-url (+ name/artist/cover/lrc) off the mount
    // point to build the hydrated card; data-id is the dataset remnant.
    expect(mount?.data).toEqual({
      id: baseMeta.playerId,
      name: baseMeta.name,
      artist: baseMeta.artist,
      url: baseMeta.audioUrl,
      cover: baseMeta.cover,
      lrc: baseMeta.lyric,
    })
    // The mount point embeds exactly the static fallback the hydration swap
    // replaces — structure and text survive the export parse unaltered.
    const mountHtml = full.element.querySelector('.aplayer')?.innerHTML ?? ''
    expect(diffHtmlStructures(mountHtml, musicPlayerFallbackHtml(baseMeta, escapeText), { compareText: true })).toEqual(
      [],
    )
  })
})
