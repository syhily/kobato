import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminMusicDto } from '@/shared/contracts/music'

import { renderInRouter, stableHtml } from '#/_helpers/render'

// `AdminMusicPlayerFloat` is a pure consumer of three hooks exported from
// `MusicPlayerContext` plus `useLocation` from react-router. The provider
// itself can't seed a current track in a single SSR pass (its state lives
// in `useState` and the only way to populate it is through `load()`, which
// requires the audio element an effect creates — and effects don't run
// here). So instead of mounting the real provider we stub the three hooks
// with a hoisted mutable singleton and rebind its fields per test. That
// lets us drive the collapsed / expanded / hidden-on-music-page branches
// directly, which is where the float's function coverage actually lives.

const track: AdminMusicDto = {
  id: 'm1',
  source: 'netease',
  sourceId: '1',
  playerId: 'player0000000001',
  name: 'Neon Skyline',
  artist: ['Aria', 'Vox'],
  album: 'Midnight',
  audioStoragePath: '/a.mp3',
  audioUrl: 'https://example.com/a.mp3',
  coverStoragePath: '/c.png',
  coverUrl: 'https://example.com/c.png',
  lyric: null,
  uploaderId: null,
  uploaderName: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const playlist: AdminMusicDto[] = [track]

// ── hoisted mutable singletons ──────────────────────────────────────────
//
// `vi.hoisted` runs before the module-level `vi.mock` factory bodies, so
// the factories can close over these objects. Each test rebinds the
// fields; the mock hook implementations read them fresh on every render.

const player = vi.hoisted(() => ({
  state: {
    currentTrack: null as AdminMusicDto | null,
    isPlaying: false,
    duration: 0,
    volume: 0.7,
    muted: false,
    extractedColor: null as string | null,
    playlist: [] as AdminMusicDto[],
    currentIndex: -1,
  },
  time: 0,
  actions: {
    load: vi.fn(),
    playIndex: vi.fn(),
    toggle: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
    close: vi.fn(),
  },
}))

const router = vi.hoisted(() => ({
  pathname: '/admin/dashboard',
}))

vi.mock('@/ui/admin/musics/MusicPlayerContext', () => ({
  useMusicPlayerState: () => player.state,
  useMusicPlayerTime: () => player.time,
  useMusicPlayerActions: () => player.actions,
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useLocation: () => ({ pathname: router.pathname }),
  }
})

// Drive the import lazily *after* the mocks are registered so the module
// under test picks up the stubbed hooks.
async function renderFloat(initialPath = router.pathname) {
  const { AdminMusicPlayerFloat } = await import('@/ui/admin/musics/AdminMusicPlayerFloat')
  return stableHtml(renderInRouter(<AdminMusicPlayerFloat />, initialPath))
}

describe('ui/admin/musics/AdminMusicPlayerFloat', () => {
  beforeEach(() => {
    player.state = {
      currentTrack: null,
      isPlaying: false,
      duration: 0,
      volume: 0.7,
      muted: false,
      extractedColor: null,
      playlist: [],
      currentIndex: -1,
    }
    player.time = 0
    for (const fn of Object.values(player.actions)) {
      fn.mockClear()
    }
    router.pathname = '/admin/dashboard'
  })

  describe('visibility gate', () => {
    it('renders nothing when there is no current track', async () => {
      const html = await renderFloat()
      expect(html).toBe('')
    })

    it('renders nothing on the music library page even with a current track', async () => {
      player.state.currentTrack = track
      router.pathname = '/admin/library/music'
      const html = await renderFloat('/admin/library/music')
      // `visible = currentTrack !== null && !isMusicPage` — the music
      // page branch suppresses the float so the full-page player owns
      // playback.
      expect(html).toBe('')
    })

    it('renders nothing on a nested music route', async () => {
      player.state.currentTrack = track
      router.pathname = '/admin/library/music/m1'
      const html = await renderFloat('/admin/library/music/m1')
      expect(html).toBe('')
    })
  })

  describe('collapsed chrome', () => {
    beforeEach(() => {
      player.state.currentTrack = track
      player.state.playlist = playlist
      player.state.currentIndex = 0
    })

    it('renders the track name, artist, and cover image', async () => {
      const html = await renderFloat()
      expect(html).toContain('Neon Skyline')
      expect(html).toContain('Aria / Vox')
      expect(html).toContain('src="https://example.com/c.png"')
      expect(html).toContain('aria-label="展开播放器"')
    })

    it('shows the play affordance when not playing', async () => {
      const html = await renderFloat()
      expect(html).toContain('播放')
      expect(html).not.toContain('暂停')
    })

    it('shows the pause affordance when playing', async () => {
      player.state.isPlaying = true
      const html = await renderFloat()
      expect(html).toContain('暂停')
    })

    it('renders a placeholder cover when the track has no coverUrl', async () => {
      player.state.currentTrack = { ...track, coverUrl: '' }
      const html = await renderFloat()
      // The collapsed branch emits a `<div class="size-10 rounded-full
      // bg-surface-dim" />` placeholder instead of the spinning cover,
      // and crucially no `<img>` tag is emitted for the cover slot.
      expect(html).toContain('bg-surface-dim')
      expect(html).not.toContain('src="https://example.com/c.png"')
    })

    it('exposes the expand control', async () => {
      const html = await renderFloat()
      expect(html).toContain('展开播放器')
    })
  })

  describe('position persistence (loadPosition / savePosition)', () => {
    // The float reads its drag position from localStorage via a lazy
    // `useState` initializer — that initializer runs during the single
    // SSR pass, so both the valid-parse and fallback branches of
    // `loadPosition` are reachable here.
    beforeEach(() => {
      player.state.currentTrack = track
      player.state.playlist = playlist
      player.state.currentIndex = 0
      const store = new Map<string, string>()
      vi.stubGlobal('localStorage', {
        getItem(key: string) {
          return store.get(key) ?? null
        },
        setItem(key: string, value: string) {
          store.set(key, value)
        },
        removeItem(key: string) {
          store.delete(key)
        },
        clear() {
          store.clear()
        },
      } as unknown as Storage)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('falls back to {x:0, y:0} when no stored position exists', async () => {
      const html = await renderFloat()
      // `position.x || undefined` — a zero position leaves `left`
      // unset, so the fixed container relies on its CSS class anchors
      // (`md:right-4 md:bottom-4`) rather than an inline `left`.
      expect(html).not.toContain('left:0')
      expect(html).toContain('cursor-grab')
    })

    it('hydrates a stored {x, y} position into the inline style', async () => {
      localStorage.setItem('kobato-admin-player-pos', JSON.stringify({ x: 120, y: 200 }))
      const html = await renderFloat()
      // `position.x` is truthy → `left:120px` and `right:'auto'` are
      // written into the inline style, exercising the parsed-value
      // branch of loadPosition.
      expect(html).toContain('left:120px')
      expect(html).toContain('top:200px')
      expect(html).toContain('right:auto')
      expect(html).toContain('bottom:auto')
    })

    it('ignores a stored payload that is not a valid {x, y} object', async () => {
      localStorage.setItem('kobato-admin-player-pos', JSON.stringify({ x: 'nope' }))
      const html = await renderFloat()
      // Invalid shape → loadPosition returns the default {0, 0} → no
      // inline left/top is written.
      expect(html).not.toContain('left:')
      expect(html).not.toContain('top:')
    })

    it('ignores unparseable JSON in storage', async () => {
      localStorage.setItem('kobato-admin-player-pos', '{not json')
      const html = await renderFloat()
      expect(html).not.toContain('left:')
    })
  })
})
