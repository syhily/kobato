// @vitest-environment happy-dom

import type { AdminMusicDto } from '@kobato/api/contracts/admin/music'

import { renderInRouter, stableHtml } from '@kobato/web-client/tests/utils/render'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

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

const musicplayercontext = await import('@kobato/web-admin/ui/music/player/music-player-context')
vi.spyOn(musicplayercontext, 'useMusicPlayerState').mockImplementation(() => player.state)
vi.spyOn(musicplayercontext, 'useMusicPlayerTime').mockImplementation(() => player.time)
vi.spyOn(musicplayercontext, 'useMusicPlayerActions').mockImplementation(() => player.actions)

afterAll(() => {
  vi.restoreAllMocks()
})

async function renderFloat(initialPath = '/admin/dashboard') {
  const { AdminMusicPlayerFloat } = await import('@kobato/web-admin/ui/music/player/AdminMusicPlayerFloat')
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
      expect(html).toContain('bg-surface-dim')
      expect(html).not.toContain('src="https://example.com/c.png"')
    })

    it('exposes the expand control', async () => {
      const html = await renderFloat()
      expect(html).toContain('展开播放器')
    })
  })

  describe('position persistence (loadPosition / savePosition)', () => {
    beforeEach(() => {
      player.state.currentTrack = track
      player.state.playlist = playlist
      player.state.currentIndex = 0
      localStorage.clear()
    })

    it('falls back to {x:0, y:0} when no stored position exists', async () => {
      const html = await renderFloat()
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
