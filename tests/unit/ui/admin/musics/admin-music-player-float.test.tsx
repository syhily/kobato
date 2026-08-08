import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminMusicDto } from '@/shared/contracts/music'

import { renderInRouter, stableHtml } from '#/_helpers/render'

// `AdminMusicPlayerFloat` consumes three hooks from `MusicPlayerContext`
// plus `useLocation`. The real provider can't seed a track in an SSR pass,
// so the hooks are stubbed with a hoisted mutable singleton.

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

// `vi.hoisted` runs before the `vi.mock` factories, so they can close over `player`.

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

vi.mock('@/ui/admin/musics/MusicPlayerContext', () => ({
  useMusicPlayerState: () => player.state,
  useMusicPlayerTime: () => player.time,
  useMusicPlayerActions: () => player.actions,
}))

// Import lazily so the module under test picks up the stubbed hooks.
async function renderFloat(initialPath = '/admin/dashboard') {
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
  })

  describe('visibility gate', () => {
    it('renders nothing when there is no current track', async () => {
      const html = await renderFloat()
      expect(html).toBe('')
    })

    it('renders nothing on the music library page even with a current track', async () => {
      player.state.currentTrack = track
      const html = await renderFloat('/admin/library/music')
      // The music-page branch suppresses the float; the full-page player owns playback.
      expect(html).toBe('')
    })

    it('renders nothing on a nested music route', async () => {
      player.state.currentTrack = track
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
      // The cover slot emits the placeholder div, never an `<img>`.
      expect(html).toContain('bg-surface-dim')
      expect(html).not.toContain('src="https://example.com/c.png"')
    })

    it('exposes the expand control', async () => {
      const html = await renderFloat()
      expect(html).toContain('展开播放器')
    })
  })

  describe('position persistence (loadPosition / savePosition)', () => {
    // The lazy `useState` position initializer runs during the SSR pass,
    // reaching both `loadPosition` branches.
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
      // `position.x || undefined` — zero coordinates leave `left`/`top` unset.
      expect(html).not.toContain('left:0')
      expect(html).toContain('cursor-grab')
    })

    it('hydrates a stored {x, y} position into the inline style', async () => {
      localStorage.setItem('kobato-admin-player-pos', JSON.stringify({ x: 120, y: 200 }))
      const html = await renderFloat()
      expect(html).toContain('left:120px')
      expect(html).toContain('top:200px')
      expect(html).toContain('right:auto')
      expect(html).toContain('bottom:auto')
    })

    it('ignores a stored payload that is not a valid {x, y} object', async () => {
      localStorage.setItem('kobato-admin-player-pos', JSON.stringify({ x: 'nope' }))
      const html = await renderFloat()
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
