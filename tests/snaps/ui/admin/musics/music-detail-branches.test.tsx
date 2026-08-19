import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminMusicDto } from '@/shared/contracts/music'

import { makeAdminMusic } from '#/_helpers/catalog'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { MusicDetailView } from '@/ui/admin/musics/MusicDetailView'

const queryMocks = mockTanstackQuery()

queryMocks.query = {
  data: null as { music: AdminMusicDto } | null,
  isLoading: false,
  isPending: false,
  isFetching: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}

queryMocks.mutation = { mutate: vi.fn(), isPending: false }

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
  removeQueries: vi.fn(),
}

// `MusicDetailView` is already covered by `musics-branches.test.tsx` for the
// loading / error / not-found / resolved / no-cover / empty-lyrics branches.
// This suite adds the remaining SSR-reachable render path driven by the
// music-player context: the play/pause button reflects whether the current
// track is the one being viewed and whether playback is active.

const playerState = vi.hoisted(() => ({
  currentTrack: null as AdminMusicDto | null,
  isPlaying: false,
  currentTime: 0,
}))

vi.mock('@/ui/admin/musics/MusicPlayerContext', () => ({
  useMusicPlayerActions: () => ({
    load: vi.fn(),
    toggle: vi.fn(),
  }),
  useMusicPlayerState: () => ({
    currentTrack: playerState.currentTrack,
    isPlaying: playerState.isPlaying,
  }),
  useMusicPlayerTime: () => playerState.currentTime,
}))

// Divergent defaults preserved from this file's former local factory (the
// shared catalog factory defaults to 夜的第七章 / 十一月的萧邦).
const qingHuaCi: Partial<AdminMusicDto> = {
  name: '青花瓷',
  album: '我很忙',
  lyric: '[00:01.00]素胚勾勒出青花笔锋浓转淡',
}

const navigateMock = vi.fn()

function renderDetail(): string {
  return stableHtml(
    renderInRouter(<MusicDetailView id="music-1" navigate={navigateMock} />, '/admin/library/music/music-1'),
  )
}

describe('snapshot: MusicDetailView player-context branches', () => {
  beforeEach(() => {
    playerState.currentTrack = null
    playerState.isPlaying = false
    playerState.currentTime = 0
    queryMocks.query = {
      data: null,
      isLoading: true,
      isPending: true,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  })

  it('renders the play button when the track is not the current track', () => {
    const music = makeAdminMusic({ id: 'music-1', ...qingHuaCi })
    playerState.currentTrack = makeAdminMusic({
      id: 'music-other',
      ...qingHuaCi,
      name: '其他歌曲',
    })
    playerState.isPlaying = true
    queryMocks.query = {
      data: { music },
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }

    const html = renderDetail()
    expect(html).toContain('青花瓷')
    expect(html).toContain('aria-label="播放"')
    expect(html).toContain('lucide-play')
    expect(html).not.toContain('aria-label="暂停"')
  })

  it('renders the pause button when the track is the current track and playing', () => {
    const music = makeAdminMusic({ id: 'music-1', ...qingHuaCi })
    playerState.currentTrack = music
    playerState.isPlaying = true
    queryMocks.query = {
      data: { music },
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }

    const html = renderDetail()
    expect(html).toContain('青花瓷')
    expect(html).toContain('aria-label="暂停"')
    expect(html).toContain('lucide-pause')
    expect(html).not.toContain('aria-label="播放"')
  })
})
